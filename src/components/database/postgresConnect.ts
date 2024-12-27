import { processTrigger, executeAction } from '../actions'
import { actionLibrary } from '../pluginsConnect'
import { deleteFile } from '../files/deleteFiles'
import config from '../../config'
import { Client, Pool, QueryResult } from 'pg'
import {
  ActionInTemplate,
  ActionQueue,
  ActionPlugin,
  FileDownloadInfo,
  ActionQueueExecutePayload,
  ActionQueuePayload,
  FilePayload,
  TriggerQueueUpdatePayload,
  UserOrg,
  DBOperationType,
} from '../../types'
import {
  ApplicationOutcome,
  ApplicationStatus,
  ReviewStatus,
  Trigger,
} from '../../generated/graphql'
import { errorMessage } from '../utilityFunctions'
import { updateReviewerStatsFromDBEvent } from './updateReviewerStats'
import { hashRecord } from '../template-import-export'

class PostgresDB {
  private static _instance: PostgresDB
  private pool: Pool
  public tableJsonColumns: Record<string, Set<string>>

  constructor() {
    this.pool = new Pool(config.pg_database_connection)

    // the pool will emit an error on behalf of any idle pools
    // it contains if a backend error or network partition happens
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle pool', err)
      throw err
      process.exit(-1)
    })

    this.startListener()

    // When updating a row generically, JSON data must be handled differently,
    // so this is a reference we can use to check which columns are JSON type
    this.tableJsonColumns = {}
    this.query({
      text: `SELECT c.table_name, column_name
          FROM information_schema.columns c
          LEFT JOIN information_schema.tables t
          ON c.table_name = t.table_name
          WHERE
          data_type = 'jsonb'
          AND table_type = 'BASE TABLE'`,
    }).then((result) => {
      result.rows.forEach(({ table_name, column_name }) => {
        if (table_name in this.tableJsonColumns) this.tableJsonColumns[table_name].add(column_name)
        else this.tableJsonColumns[table_name] = new Set([column_name])
      })
    })
  }

  private startListener = async () => {
    const listener = new Client(config.pg_database_connection)
    listener.connect()
    listener.query('LISTEN trigger_notifications')
    listener.query('LISTEN action_notifications')
    listener.query('LISTEN file_notifications')
    listener.query('LISTEN update_reviewer_stats_notification')
    listener.query('LISTEN recalculate_checksum_notification')
    listener.on('notification', async ({ channel, payload }) => {
      if (!payload) {
        console.log(`Notification ${channel} received with no payload!`)
        return
      }
      const payloadObject = JSON.parse(payload)
      switch (channel) {
        case 'trigger_notifications':
          // Temporary diagnostic:
          console.log(new Date().toLocaleString(), 'TRIGGER', payloadObject.trigger)
          // "data" is stored output from scheduled trigger or verification
          // "data" can sometimes exceed the byte limit for notification payload, so must be fetched separately
          const data = await this.getTriggerPayloadData(payloadObject.trigger_id)
          const { trigger, table, record_id } = payloadObject
          config.Throttle.add({
            name: `Trigger ${trigger} on ${table}, id ${record_id}`,
            data: { ...payloadObject, data },
            action: processTrigger,
          })
          break
        case 'action_notifications':
          // For Async Actions only
          try {
            // Trigger payload fetched separately to avoid over-size payload
            // error
            const trigger_payload = await this.getTriggerPayload(payloadObject.id)
            await executeAction(
              { ...payloadObject, trigger_payload },
              actionLibrary,
              trigger_payload?.data
            )
          } catch (err) {
            console.log(errorMessage(err))
          } finally {
            break
          }
        case 'file_notifications':
          deleteFile(payloadObject)
          break
        case 'update_reviewer_stats_notification':
          // Time delay so this aggregation process doesn't slow down Action
          // execution
          config.Throttle.add({
            name: `Reviewer Action update from DB trigger on table ${payloadObject?.tableName}`,
            data: payloadObject,
            action: updateReviewerStatsFromDBEvent,
          })
          break
        case 'recalculate_checksum_notification':
          hashRecord(payloadObject)
          break
      }
    })
  }

  // Fetches data from trigger_queue for Action
  private getTriggerPayloadData = async (triggerId: number) => {
    const text = `SELECT data FROM trigger_queue WHERE id = $1`
    try {
      const result = await this.query({ text, values: [triggerId] })
      return result.rows[0].data
    } catch (err) {
      throw err
    }
  }

  // Fetches trigger_payload from action_queue for async Action
  private getTriggerPayload = async (actionId: number) => {
    const text = `SELECT trigger_payload FROM action_queue WHERE id = $1`
    try {
      const result = await this.query({ text, values: [actionId] })
      return result.rows[0].trigger_payload
    } catch (err) {
      throw err
    }
  }

  // Generic method to fetch a single full record from any table, by any field
  // (defaults to "id"). If more than one record matches the query, only the
  // first one is returned (so try and make sure you only query by a unique
  // field)
  public getRecord = async <T>(
    tableName: string,
    value: number | string | (number | string)[],
    field: string | string[] = 'id'
  ): Promise<T> => {
    try {
      const text = Array.isArray(field)
        ? `SELECT * FROM ${tableName} WHERE ${field
            .map((val, index) =>
              index === 0 ? `${val} = $${index + 1}` : `AND ${val} = $${index + 1}`
            )
            .join(' ')}`
        : `SELECT * FROM ${tableName} WHERE ${field} = $1`

      const result = await this.query({
        text,
        values: Array.isArray(value) ? [...value] : [value],
      })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  // Generic method to return multiple full records from any table by matching
  // against any field.
  public getRecordsByField = async <T>(
    tableName: string,
    field: string,
    value: unknown
  ): Promise<T[]> => {
    try {
      const text = `
            SELECT * FROM ${tableName} WHERE ${field} = $1
          `
      const result = await this.query({ text, values: [value] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public isJsonColumn = (tableName: string, columnName: string) => {
    if (!(tableName in this.tableJsonColumns)) return false
    return this.tableJsonColumns[tableName].has(columnName)
  }

  public getValuesPlaceholders = (object: { [key: string]: any }, offset: number = 1) =>
    Object.keys(object).map((_, index) => `$${index + offset}`)

  public static get Instance() {
    return this._instance || (this._instance = new this())
  }

  public query = async (expression: {
    text: string
    values?: any[]
    rowMode?: string
  }): Promise<QueryResult> => {
    const client = await this.pool.connect()
    try {
      return await client.query(expression)
    } finally {
      // Make sure to release the client before any error handling,
      // just in case the error handling itself throws an error.
      client.release()
    }
  }

  public end = () => {
    this.pool.end()
  }

  public getCounter = async (counterName: string, increment = true) => {
    const textSelect = 'SELECT value FROM counter WHERE name = $1;'
    const textNewCounter = 'INSERT INTO counter (name, value) VALUES($1, 1)'
    const textUpdate = 'UPDATE counter SET value = value + 1 WHERE name = $1;'
    try {
      await this.query({ text: 'BEGIN TRANSACTION;' })
      const result: any = await this.query({ text: textSelect, values: [counterName] })
      if (result.rows.length === 0) {
        await this.query({ text: textNewCounter, values: [counterName] })
      }
      if (increment) await this.query({ text: textUpdate, values: [counterName] })
      await this.query({ text: 'COMMIT TRANSACTION;' })
      return result.rows[0]?.value
    } catch (err) {
      throw err
    }
  }

  public addActionQueue = async (action: ActionQueuePayload): Promise<boolean> => {
    const text = `INSERT into action_queue (${Object.keys(action)}, time_queued) 
      VALUES (${this.getValuesPlaceholders(action)}, CURRENT_TIMESTAMP)`

    try {
      await this.query({ text, values: Object.values(action) })
      return true
    } catch (err) {
      throw err
    }
  }

  public executedActionStatusUpdate = async (
    payload: ActionQueueExecutePayload
  ): Promise<ActionQueueExecutePayload> => {
    const text =
      'UPDATE action_queue SET status = $1, error_log = $2, parameters_evaluated = $3, output = $4, time_completed = CURRENT_TIMESTAMP WHERE id = $5'
    try {
      await this.query({ text, values: Object.values(payload) })
      return { ...payload }
    } catch (err) {
      throw err
    }
  }

  public getActionsProcessing = async (templateId: number): Promise<ActionQueue[]> => {
    const text =
      "SELECT id, action_code, trigger_payload, condition_expression, parameter_queries FROM action_queue WHERE template_id = $1 AND status = 'PROCESSING' ORDER BY sequence"
    try {
      const result = await this.query({
        text,
        values: [templateId],
      })
      return result.rows as ActionQueue[]
    } catch (err) {
      throw err
    }
  }

  public updateActionParametersEvaluated = async (action_id: number, parameters: any) => {
    const text = 'UPDATE action_queue SET parameters_evaluated = $1 WHERE id = $2'
    try {
      const result = await this.query({
        text,
        values: [parameters, action_id],
      })
      return true
    } catch (err) {
      throw err
    }
  }

  public getScheduledEvent = async (applicationId: number, eventCode: string) => {
    const text = `
      SELECT * FROM trigger_schedule
      WHERE application_id = $1
      AND event_code = $2
    `
    try {
      const result = await this.query({ text, values: [applicationId, eventCode] })
      return result.rows[0] ?? null
    } catch (err) {
      throw err
    }
  }

  public updateScheduledEventTime = async (
    applicationId: number,
    eventCode: string,
    newTime: string, // ISO string
    userId: number
  ) => {
    const text = `
      UPDATE trigger_schedule
        SET time_scheduled = $1, is_active = TRUE, editor_user_id = $2
        WHERE application_id = $3
        AND event_code = $4
        RETURNING *
    `
    try {
      const result = await this.query({ text, values: [newTime, userId, applicationId, eventCode] })
      return result.rows[0] ?? null
    } catch (err) {
      throw err
    }
  }

  public triggerScheduledActions = async () => {
    const text = `
      UPDATE trigger_schedule SET trigger = 'ON_SCHEDULE'
        WHERE time_scheduled < NOW()
        AND is_active = true
    `
    try {
      const result = await this.query({ text })
      return true
    } catch (err) {
      throw err
    }
  }

  public resetTrigger = async (
    table: string,
    record_id: number,
    fail = false
  ): Promise<boolean> => {
    const triggerStatus = fail ? Trigger.Error : null
    const text = `UPDATE ${table} SET trigger = $1 WHERE id = $2`
    try {
      const result = await this.query({
        text,
        values: [triggerStatus, record_id],
      })
      return true
    } catch (err) {
      throw err
    }
  }

  // Normally triggers are added automatically by the database when trigger
  // fields are set, but we can add them via a function call if we need to, such
  // as in the "extend-application" endpoint.
  public addTriggerEvent = async ({
    trigger,
    table,
    recordId,
    eventCode,
    data,
  }: {
    trigger: Trigger
    table: string
    recordId: number
    eventCode?: string
    data?: { [key: string]: any }
  }) => {
    console.log('eventCode', eventCode)
    const text = `
      INSERT INTO trigger_queue
        (trigger_type, "table", record_id, event_code, data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `
    try {
      const result = await this.query({
        text,
        values: [trigger, table, recordId, eventCode, data],
      })
      return result.rows[0].id
    } catch (err) {
      throw err
    }
  }

  public setScheduledActionDone = async (table: string, record_id: number): Promise<boolean> => {
    const text = `UPDATE ${table} SET is_active = false WHERE id = $1`
    try {
      const result = await this.query({
        text,
        values: [record_id],
      })
      return true
    } catch (err) {
      throw err
    }
  }

  public addFile = async (payload: FilePayload): Promise<{ unique_id: string; id: string }> => {
    const { template_id, ...file } = payload
    const text = `INSERT INTO file (${Object.keys(file)}) 
      VALUES (${this.getValuesPlaceholders(file)})
      ON CONFLICT (unique_id) DO UPDATE
        SET (${Object.keys(file)}) = (${this.getValuesPlaceholders(file)})
        RETURNING id, unique_id`
    try {
      const result = await this.query({ text, values: Object.values(file) })
      const { unique_id, id } = result.rows[0]
      if (template_id) {
        // Create a template_join record
        await this.query({
          text: `
          INSERT INTO template_file_join (template_id, file_id)
          VALUES ($1, $2);`,
          values: [template_id, id],
        })
      }
      return { unique_id, id }
    } catch (err) {
      throw err
    }
  }

  public updateFileDescription = async (
    unique_id: string,
    description: string
  ): Promise<{ unique_id: string; original_filename: string; mimetype: string }> => {
    const text = `UPDATE file SET description = $1 
      WHERE unique_id = $2
      RETURNING unique_id, original_filename, mimetype`
    try {
      const result = await this.query({ text, values: [description, unique_id] })
      return result.rows[0]
    } catch (err) {
      throw err
    }
  }

  public getFileDownloadInfo = async (uid: string): Promise<FileDownloadInfo | undefined> => {
    const text = `SELECT original_filename, file_path, thumbnail_path, archive_path FROM file WHERE unique_id = $1`
    try {
      const result = await this.query({ text, values: [uid] })
      return result.rows[0] as FileDownloadInfo
    } catch (err) {
      throw err
    }
  }

  public cleanUpFiles = async () => {
    const text = `
      DELETE FROM file
      WHERE to_be_deleted = true
      AND timestamp < now() - interval '${config?.previewDocsMinKeepTime ?? '2 hours'}'
      RETURNING id;
    `
    try {
      const result = await this.query({ text })
      return result.rows.length
    } catch (err) {
      throw err
    }
  }

  public deleteMissingFileRecords = async (fileIds: number[]) => {
    const text = `
      DELETE FROM file
      WHERE id = ANY($1);
    `
    try {
      await this.query({ text, values: [fileIds] })
    } catch (err) {
      throw err
    }
  }

  public checkIfInFileTable = async (filePath: string) => {
    const text = `
    SELECT id 
    FROM file
    WHERE file_path = $1 OR thumbnail_path = $1
    `
    try {
      const result = await this.query({ text, values: [filePath] })
      return result.rows.length !== 0
    } catch (err) {
      throw err
    }
  }

  // File archiving

  public getFilesToArchive = async (days: number) => {
    const duration = `${days} days`
    const text = `
      SELECT unique_id, file_path, thumbnail_path,
        timestamp, file_size
      FROM file
      WHERE archive_path IS NULL
      AND to_be_deleted = FALSE
      AND timestamp < now() - interval '${duration}' 
    `
    try {
      const result = await this.query({ text })
      return result.rows
    } catch (err) {
      throw err
    }
  }

  public setFileArchived = async (file: { unique_id: string; archive_path: string }) => {
    const { unique_id, archive_path } = file
    const text = `
      UPDATE file SET archive_path = $1 
      WHERE unique_id = $2`
    try {
      const result = await this.query({ text, values: [archive_path, unique_id] })
      return result.rows
    } catch (err) {
      throw err
    }
  }

  public addActionPlugin = async (plugin: ActionPlugin): Promise<boolean> => {
    const text = `INSERT INTO action_plugin (${Object.keys(plugin)}) 
      VALUES (${this.getValuesPlaceholders(plugin)})`
    try {
      await this.query({ text, values: Object.values(plugin) })
      return true
    } catch (err) {
      throw err
    }
  }

  public deleteActionPlugin = async (payload: Pick<ActionPlugin, 'code'>): Promise<boolean> => {
    const text = 'DELETE FROM action_plugin WHERE code = $1'
    try {
      await this.query({ text, values: [payload.code] })
      return true
    } catch (err) {
      throw err
    }
  }

  public getActionPlugins = async (): Promise<ActionPlugin[]> => {
    const text = 'SELECT * FROM action_plugin'
    try {
      const result = await this.query({ text })
      return result.rows as ActionPlugin[]
    } catch (err) {
      throw err
    }
  }

  public getApplicationData = async (applicationId: number) => {
    const text = `
      SELECT application_id as "applicationId",
      serial as "applicationSerial",
      name as "applicationName",
      session_id as "sessionId",
      template_id as "templateId",
      template_name as "templateName",
      template_code as "templateCode",
      stage_id as "stageId", stage_number as "stageNumber", stage,
      stage_history_id as "stageHistoryId",
      stage_history_time_created as "stageHistoryTimeCreated",
      status_history_id as "statusHistoryId", status, status_history_time_created as "statusHistoryTimeCreated",
      user_id as "userId",
      org_id as "orgId",
      outcome
      FROM application_stage_status_latest
      WHERE application_id = $1
    `
    const result = await this.query({ text, values: [applicationId] })
    const applicationData = result.rows[0]
    return applicationData
  }

  public getApplicationResponses = async (applicationId: number) => {
    const text = `
    SELECT DISTINCT ON (code) code, value
    FROM application_response JOIN template_element
    ON template_element.id = application_response.template_element_id
    WHERE application_id = $1
    ORDER BY code, time_updated DESC
    `
    const result = await this.query({ text, values: [applicationId] })
    const responses = result.rows
    return responses
  }

  public getApplicationSections = async (applicationId: number) => {
    const text = `
    SELECT template_section.code as code
    FROM template_section 
    JOIN template ON template_section.template_id = template.id
    JOIN application on application.template_id = template.id
    WHERE application.id = $1
    `
    const result = await this.query({ text, values: [applicationId] })
    const responses = result.rows
    return responses
  }

  public getApplicationIdFromTrigger = async (tableName: string, recordId: number) => {
    let text: string
    switch (tableName) {
      case 'application':
        return recordId
      case 'review':
        // NB: Check the rest of these queries properly once we have data in the tables
        text = 'SELECT application_id FROM review WHERE id = $1'
        break
      case 'review_assignment':
        text = 'SELECT application_id FROM review_assignment WHERE id = $1'
        break
      case 'verification':
        text = 'SELECT application_id FROM verification WHERE id = $1'
        break
      case 'trigger_schedule':
        text = 'SELECT application_id FROM trigger_schedule WHERE id = $1'
        break
      // To-Do: queries for other trigger tables
      default:
        throw new Error('Table name not valid')
    }
    const result = await this.query({ text, values: [recordId] })
    return result.rows[0].application_id
  }

  public getTemplateIdFromTrigger = async (
    tableName: string,
    recordId: number
  ): Promise<number> => {
    let text: string
    switch (tableName) {
      case 'application':
        text = 'SELECT template_id FROM application WHERE id = $1'
        break
      case 'review':
        // NB: Check the rest of these queries properly once we have data in the tables
        text =
          'SELECT template_id FROM application WHERE id = (SELECT application_id FROM review WHERE id = $1)'
        break
      case 'review_assignment':
        text =
          'SELECT template_id FROM application WHERE id = (SELECT application_id FROM review_assignment WHERE id = $1)'
        break
      case 'verification':
        text =
          'SELECT template_id FROM application WHERE id = (SELECT application_id FROM verification WHERE id = $1)'
        break
      case 'trigger_schedule':
        text = 'SELECT template_id FROM trigger_schedule WHERE id = $1'
        break
      default:
        throw new Error('Table name not valid')
    }
    const result = await this.query({ text, values: [recordId] })
    return result.rows[0].template_id
  }

  public getTemplateSerialPattern = async (templateId: number) => {
    const text = `
      SELECT serial_pattern FROM template
      WHERE id = $1`

    try {
      const result = await this.query({ text, values: [templateId] })
      return result.rows[0].serial_pattern
    } catch (err) {
      throw err
    }
  }

  public getActionsByTemplateId = async (
    templateId: number,
    trigger: Trigger
  ): Promise<ActionInTemplate[]> => {
    const text = `SELECT action_plugin.code, action_plugin.path, action_plugin.name, trigger, template_action.event_code AS event_code, sequence, condition, parameter_queries
    FROM template 
    JOIN template_action ON template.id = template_action.template_id 
    JOIN action_plugin ON template_action.action_code = action_plugin.code 
    WHERE template_id = $1 AND trigger = $2
    ORDER BY sequence NULLS FIRST`

    try {
      const result = await this.query({ text, values: [templateId, trigger] })
      return result.rows as ActionInTemplate[]
    } catch (err) {
      throw err
    }
  }

  public getSingleTemplateAction = async (
    templateId: number,
    code: string
  ): Promise<ActionInTemplate> => {
    const text = `
      SELECT action_plugin.code, action_plugin.path, action_plugin.name, trigger, template_action.event_code AS event_code, sequence, condition, parameter_queries 
      FROM template 
      JOIN template_action ON template.id = template_action.template_id 
      JOIN action_plugin ON template_action.action_code = action_plugin.code 
      WHERE template_id = $1 AND template_action.code = $2
    `
    try {
      const result = await this.query({ text, values: [templateId, code] })
      return result.rows[0] as ActionInTemplate
    } catch (err) {
      throw err
    }
  }

  public updateActionPlugin = async (plugin: ActionPlugin): Promise<boolean> => {
    const setMapping = Object.keys(plugin).map((key, index) => `${key} = $${index + 1}`)
    const text = `UPDATE action_plugin SET ${setMapping.join(',')} WHERE code = $${
      setMapping.length + 1
    }`
    // TODO: Dynamically select what is being updated
    try {
      await this.query({ text, values: [...Object.values(plugin), plugin.code] })
      return true
    } catch (err) {
      throw err
    }
  }

  public updateTriggerQueueStatus = async ({
    id,
    application_id,
    status,
  }: TriggerQueueUpdatePayload): Promise<boolean> => {
    const text = `UPDATE trigger_queue SET status = $1${
      application_id ? ', application_id = $3' : ''
    } WHERE id = $2`
    const values = [status, id]
    if (application_id) values.push(application_id)

    try {
      await this.query({ text, values })
      return true
    } catch (err) {
      throw err
    }
  }

  public getVerification = async (uid: string) => {
    const text = `
      SELECT unique_id, time_expired, is_verified, message
        FROM verification
        WHERE unique_id = $1`
    try {
      const result = await this.query({ text, values: [uid] })
      return result.rows[0]
    } catch (err) {
      throw err
    }
  }

  public setVerification = async (uid: string) => {
    const text = `
      UPDATE verification
      SET is_verified = true, trigger = 'ON_VERIFICATION'
      WHERE unique_id = $1;`
    try {
      await this.query({ text, values: [uid] })
      return true
    } catch (err) {
      throw err
    }
  }

  // Join a user to an org in user_organisation table
  public addUserOrg = async (userOrg: {
    user_id: number
    organisation_id: number
    user_role?: string
  }): Promise<object> => {
    // First check if exists
    const result = await this.query({
      text: `
        SELECT id FROM user_organisation
        WHERE user_id = $1
        AND organisation_id = $2
      `,
      values: [userOrg.user_id, userOrg.organisation_id],
    })
    const id = result.rows[0]?.id
    if (id) {
      console.log('User already exists in organisation:', id)
      return { userOrgId: result.rows[0].id, success: true }
    }

    const text = `INSERT INTO user_organisation (${Object.keys(userOrg)}) 
      VALUES (${this.getValuesPlaceholders(userOrg)})
      RETURNING id`
    try {
      const result = await this.query({ text, values: Object.values(userOrg) })
      return { userOrgId: result.rows[0].id, success: true }
    } catch (err) {
      throw err
    }
  }

  // Remove specific user (or all user - if no userId specified)
  // from an org in user_organisation table
  public removeUserOrg = async ({
    orgId,
    userId,
  }: {
    orgId: number
    userId?: number
  }): Promise<{ pairs: UserOrg[]; success: boolean }> => {
    const text = `
      DELETE FROM user_organisation WHERE
      organisation_id = $1 ${userId ? 'AND user_id = $2' : ''}
      RETURNING id, user_id as "userId", organisation_id as "orgId";
      `
    try {
      const result = await this.query({ text, values: userId ? [orgId, userId] : [orgId] })
      return { pairs: result.rows, success: true }
    } catch (err) {
      throw err
    }
  }

  // Remove all permissions for user-org
  public deleteUserOrgPermissions = async ({
    orgId,
    userId,
  }: {
    orgId: number
    userId?: number
  }) => {
    const text = `
      DELETE FROM permission_join WHERE
      organisation_id = $1 ${userId ? 'AND user_id = $2' : ''};
      `
    try {
      await this.query({ text, values: userId ? [orgId, userId] : [orgId] })
      return { success: true }
    } catch (err) {
      throw err
    }
  }

  public getOrgName = async (orgId: number | null) => {
    if (!orgId) return null
    const text = `
      SELECT name FROM organisation
      WHERE id = $1
    `
    try {
      const result = await this.query({ text, values: [orgId] })
      return result.rows[0].name
    } catch (err) {
      throw err
    }
  }

  // Used by triggers/actions -- please don't modify
  public getUserData = async (userId: number, orgId: number) => {
    const text = `
      SELECT first_name as "firstName",
      last_name as "lastName",
      username, date_of_birth as "dateOfBirth",
      email
      FROM "user"
      WHERE id = $1
      `
    const text2 = `
      SELECT name as "orgName"
      FROM organisation
      WHERE id = $1
      `
    try {
      const result = await this.query({ text, values: [userId] })
      const userData = { ...result.rows[0], orgName: null }
      if (orgId) {
        const orgResult = await this.query({ text: text2, values: [orgId] })
        userData.orgName = orgResult.rows[0].orgName
      }
      return userData
    } catch (err) {
      throw err
    }
  }

  public getUserOrgData = async ({ username, userId }: any) => {
    const queryText = `
      SELECT user_id as "userId",
        first_name as "firstName",
        last_name as "lastName",
        username,
        date_of_birth as "dateOfBirth",
        email,
        password_hash as "passwordHash",
        org_id as "orgId",
        org_name as "orgName",
        user_role as "userRole",
        registration,
        address,
        logo_url as "logoUrl",
        is_system_org as "isSystemOrg"
        FROM user_org_join`
    const text = userId ? `${queryText} WHERE user_id = $1` : `${queryText} WHERE username = $1`
    try {
      const result = await this.query({ text, values: [userId ? userId : username] })
      return result.rows
    } catch (err) {
      throw err
    }
  }

  public isUnique = async (
    table: string,
    field: string,
    value: string,
    caseInsensitive: boolean
  ): Promise<boolean> => {
    const text = caseInsensitive
      ? `SELECT COUNT(*) FROM "${table}" WHERE LOWER(${field}) = LOWER($1)`
      : `SELECT COUNT(*) FROM "${table}" WHERE ${field} = $1`
    try {
      const result = await this.query({ text, values: [value] })
      return !Boolean(Number(result.rows[0].count))
    } catch (err) {
      // Check if table and field actually exist -- return true if not
      const text = `
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = $1
        AND column_name = $2
      `
      try {
        const result = await this.query({ text, values: [table, field] })
        return !Boolean(Number(result.rows[0].count))
      } catch {
        throw err
      }
      throw err
    }
  }

  public setApplicationOutcome = async (
    appId: number,
    outcome: ApplicationOutcome
  ): Promise<boolean> => {
    // Note: There is a trigger in Postgres DB that automatically updates the `is_active` field to False when outcome is set to "APPROVED" or "REJECTED"
    const text = 'UPDATE application SET outcome = $1  WHERE id = $2'
    try {
      await this.query({ text, values: [outcome, appId] })
      return true
    } catch (err) {
      console.log(errorMessage(err))
      return false
    }
  }

  public getTemplateStages = async (templateId: number) => {
    const text = 'SELECT id, number, title FROM template_stage WHERE template_id = $1'
    try {
      const result = await this.query({ text, values: [templateId] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getCurrentStageStatusHistory = async (applicationId: number) => {
    const text = `
      SELECT stage_id AS "stageId",
      stage_number AS "stageNumber",
      stage,
      stage_history_id AS "stageHistoryId",
      stage_history_time_created AS "stageHistoryTimeCreated",
      status_history_id AS "statusHistoryId",
      status,
      status_history_time_created AS "statusHistoryTimeCreated"
      FROM application_stage_status_latest 
      WHERE application_id = $1
    `
    try {
      const result = await this.query({ text, values: [applicationId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getNextStage = async (templateId: number, currentStageNumber = 0) => {
    const text = `SELECT id as stage_id, number as stage_number, title from template_stage
    WHERE template_id = $1
    AND number = (
      SELECT min(number) from template_stage
      WHERE number > $2
    )`
    try {
      const result = await this.query({ text, values: [templateId, currentStageNumber] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public addNewStageHistory = async (applicationId: number, stageId: number) => {
    // Note: switching is_current of previous stage_histories to False is done automatically by a Postgres trigger function
    const text =
      'INSERT into application_stage_history (application_id, stage_id, time_created) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id'
    try {
      const result = await this.query({ text, values: [applicationId, stageId] })
      return result.rows[0].id
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public addNewApplicationStatusHistory = async (
    stageHistoryId: number,
    status: ApplicationStatus = ApplicationStatus.Draft
  ) => {
    // Note: switching is_current of previous status_histories to False is done automatically by a Postgres trigger function
    const text =
      'INSERT into application_status_history (application_stage_history_id, status, time_created) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id, status, time_created'
    try {
      const result = await this.query({ text, values: [stageHistoryId, status] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getReviewCurrentStatusHistory = async (reviewId: number) => {
    const text = `SELECT id, status, time_created FROM
      review_status_history WHERE
      review_id = $1 and is_current = true;`
    try {
      const result = await this.query({ text, values: [reviewId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public addNewReviewStatusHistory = async (
    reviewId: number,
    status: ReviewStatus = ReviewStatus.Draft
  ) => {
    // Note: switching is_current of previous status_histories to False is done automatically by a Postgres trigger function
    const text =
      'INSERT into review_status_history (review_id, status) VALUES ($1, $2) RETURNING id, status, time_created'
    try {
      const result = await this.query({ text, values: [reviewId, status] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getUserTemplatePermissions = async (
    username: string,
    orgId: number | null,
    includeUserCategory = false
  ) => {
    const orgMatch = `"orgId" ${orgId === null ? 'IS NULL' : '= $2'}`

    // "User" category permissions are ONLY included in login routes
    const userCategoryString = includeUserCategory ? ` OR "isUserCategory" = true` : ''

    const text = `SELECT * FROM permissions_all
      WHERE username = $1
      AND (${orgMatch}${userCategoryString})
      `

    const values: (string | number)[] = [username]
    if (orgId) values.push(orgId)
    try {
      const result = await this.query({ text, values })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getOrgTemplatePermissions = async (orgId: number) => {
    const text = `SELECT * FROM permissions_all
      WHERE "orgId" = $1
      AND username IS NULL
      `
    const values: number[] = [orgId]
    try {
      const result = await this.query({ text, values })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getAllPermissions = async () => {
    const text = 'select * from permissions_all'
    try {
      const result = await this.query({ text, values: [] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getTemplatePermissions = async (isSystemOrgPermission: boolean = false) => {
    const text = `SELECT * FROM permissions_all
      WHERE  "isSystemOrgPermission" = $1
      ORDER BY "permissionName"
      `
    try {
      const result = await this.query({ text, values: [isSystemOrgPermission] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getUserAdminStatus = async (
    managementPrefName: string,
    userId: number,
    orgId: number | null
  ) => {
    const orgMatch = `"organisation_id" ${orgId ? '= $3' : 'IS NULL'}`
    const text = `
      SELECT name, user_id, organisation_id, permission_name_id
      FROM permission_join pj JOIN permission_name pn
      ON pj.permission_name_id = pn.id
      WHERE user_id = $2
      AND ${orgMatch}
      AND (name = 'admin' OR name = $1)
      AND is_active = true
    `
    const values = [managementPrefName, userId]
    if (orgId) values.push(orgId)
    try {
      const result = await this.query({ text, values })
      const isAdmin = result.rows.some((row) => row.name === 'admin')
      const isManager = result.rows.some((row) => row.name === managementPrefName)
      return { isAdmin, isManager }
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getAllGeneratedRowPolicies = async () => {
    const text = `
      SELECT policyname, tablename 
      FROM pg_policies 
      WHERE policyname LIKE 'view\_%'
      OR policyname LIKE 'update\_%'
      OR policyname LIKE 'create\_%'
      OR policyname LIKE 'delete\_%'
    `
    try {
      const result = await this.query({ text, values: [] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getUserOrgPermissionNames = async (userId: number, orgId: number | null | undefined) => {
    // Only consider userId = NULL when orgId is present (can't both be NULL)
    const userMatch = `("userId" = $1 ${orgId ? 'OR "userId" IS NULL' : ''})`
    const orgMatch = `"orgId" ${orgId ? '= $2' : 'IS NULL'}`
    const text = `
      SELECT DISTINCT "permissionNameId" as id,
      "permissionName" FROM permissions_all
      WHERE ${userMatch}
      AND ${orgMatch}`
    const values: number[] = [userId]
    if (orgId) values.push(orgId)
    try {
      const result = await this.query({ text, values })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getNumReviewLevels = async (stageId: number) => {
    const text = `
    SELECT MAX(number) FROM template_stage_review_level
    WHERE stage_id = $1
    `
    try {
      const result = await this.query({ text, values: [stageId] })
      return result.rows[0].max
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getReviewStageAndLevel = async (reviewId: number) => {
    const text = `
      SELECT review.level_number AS "levelNumber", stage_number as "stageNumber"
      FROM review WHERE review.id = $1
    `
    try {
      const result = await this.query({ text, values: [reviewId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getCurrentReviewStageAndLevel = async (applicationId: number) => {
    const text = `
      SELECT MAX(review.level_number) AS "levelNumber", MAX(stage_number) as "stageNumber"
      FROM review WHERE review.application_id = $1
    `
    try {
      const result = await this.query({ text, values: [applicationId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  // public isFullyAssignedLevel1 = async (applicationId: number) => {
  //   const text = `
  //   SELECT is_fully_assigned_level_1
  //   FROM application_list()
  //   WHERE id = $1
  //   `
  //   try {
  //     const result = await this.query({
  //       text,
  //       values: [applicationId],
  //     })
  //     return result.rows[0].is_fully_assigned_level_1
  //   } catch (err) {
  //     console.log(errorMessage(err))
  //     throw err
  //   }
  // }

  public getAllApplicationResponses = async (applicationId: number) => {
    const text = `
    SELECT ar.id, template_element_id, code, value, time_updated, te.reviewability
    FROM application_response ar JOIN template_element te
    ON ar.template_element_id = te.id
    WHERE application_id = $1
    ORDER BY time_updated
    `
    try {
      const result = await this.query({ text, values: [applicationId] })
      const responses = result.rows
      return responses
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getAllReviewResponses = async (reviewId: number) => {
    const text = `
    SELECT rr.id, r.level_number, code, comment, decision, rr.status, rr.template_element_id,
    rr.application_response_id, rr.review_response_link_id, rr.time_updated
    FROM review_response rr JOIN application_response ar
    ON rr.application_response_id = ar.id
    JOIN template_element te ON ar.template_element_id = te.id
    JOIN review r ON rr.review_id = r.id
    WHERE review_id = $1
    ORDER BY time_updated
    `
    try {
      const result = await this.query({ text, values: [reviewId] })
      const responses = result.rows
      return responses
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getDatabaseInfo: GetDatabaseInfo = async (tableName = '') => {
    const whereClause = tableName ? `where table_name = $1` : ''
    const values = tableName ? [tableName] : []
    try {
      const result = await this.query({
        text: `SELECT * FROM schema_columns ${whereClause}`,
        values,
      })
      const responses = result.rows as SchemaColumn[]
      return responses
    } catch (err) {
      console.log(errorMessage(err))
      throw new Error('Problem getting database info')
    }
  }

  public getAllTableNames = async () => {
    const text = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
      AND table_type='BASE TABLE';
    `
    try {
      const result = await this.query({ text, rowMode: 'array' })
      return result.rows.map((table) => table[0])
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getDataTableColumns = async (tableName: string) => {
    const text = `
      SELECT column_name as name,
      data_type as "dataType",
      udt_name as "userType"
      FROM information_schema.columns
      WHERE table_name = $1;
    `
    try {
      const result = await this.query({ text, values: [tableName] })
      return result.rows.map(({ name, dataType, userType }) => ({
        name,
        // So we can discriminate between citext and enums -- data type returns
        // "USER-DEFINED" for both
        dataType: dataType === 'USER-DEFINED' ? userType : dataType,
      }))
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getTemplateVersionIDs = async (templateCode: string) => {
    const text = `
      SELECT version_id FROM template WHERE code = $1;
    `
    try {
      const result = await this.query({ text, values: [templateCode] })
      return result.rows.map((row) => row.version_id)
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getPermissionPolicies: GetPermissionPolicies = async () => {
    try {
      const result = await this.query({
        text: 'SELECT id, rules FROM permission_policy',
      })
      const responses = result.rows as permissionPolicyColumns[]
      return responses
    } catch (err) {
      console.log(errorMessage(err))
      throw new Error('Problem getting permission policies')
    }
  }

  // DATA TABLE / VIEWS QUERIES

  public getAllowedDataViews = async (userPermissions: string[], dataViewCode?: string) => {
    // Returns any records that have ANY permissionNames in common with input
    // userPermissions, or are empty (i.e. public)
    const text = `
      SELECT * FROM data_view
      WHERE (
              $1 && permission_names
              OR permission_names IS NULL
              OR cardinality(permission_names) = 0
            )
      ${dataViewCode ? 'AND code = $2' : ''}
       AND enabled = TRUE;
    `
    const values = dataViewCode ? [userPermissions, dataViewCode] : [userPermissions]
    try {
      const result = await this.query({ text, values })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getDataViewColumnDefinitions = async (tableName: string, columnMatches: string[]) => {
    const text = `
      SELECT * FROM data_view_column_definition
      WHERE table_name = $1
      AND column_name = ANY($2)
    `
    try {
      const result = await this.query({ text, values: [tableName, columnMatches] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  // Changelog
  public addToChangelog = async (
    tableName: string,
    recordId: number,
    type: DBOperationType,
    oldData: Record<string, any> | null,
    newData: Record<string, any> | null,
    userId: number | null | undefined,
    orgId: number | null | undefined,
    applicationId: number | null | undefined,
    comment: string | null | undefined
  ) => {
    const username =
      (
        await this.query({
          text: `
      SELECT username from "user"
      WHERE id = $1`,
          values: [userId],
        })
      ).rows?.[0]?.username ?? null
    const dataTable = tableName.replace(config.dataTablePrefix, '')
    const text = `
      INSERT INTO data_changelog
        (data_table, record_id, update_type, old_data, new_data,
          user_id, org_id, username, application_id, comment)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `
    try {
      await this.query({
        text,
        values: [
          dataTable,
          recordId,
          type,
          oldData,
          newData,
          userId,
          orgId,
          username,
          applicationId,
          comment,
        ],
      })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public getSystemInfo = async (type: string) => {
    const text = `SELECT value
    FROM system_info
    WHERE timestamp =
      (SELECT MAX(timestamp) FROM system_info
      WHERE name=$1)
     `
    try {
      const result = await this.query({ text, values: [type] })
      return result.rows[0]?.value ?? null
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public setSystemInfo = async (type: string, value: unknown) => {
    const text = `
      INSERT INTO system_info (name, value)
      VALUES($1, $2)
      RETURNING name, value, timestamp
     `
    try {
      const result = await this.query({ text, values: [type, JSON.stringify(value)] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  public waitForDatabaseValue = async ({
    table,
    column,
    matchColumn = 'id',
    matchValue,
    waitValue,
    errorValue,
    refetchInterval = 0.5, // seconds
    maxAttempts = 20,
  }: {
    table: string
    column: string
    matchColumn: string
    matchValue: any
    waitValue: any
    errorValue?: any
    refetchInterval?: number
    maxAttempts?: number
  }): Promise<'SUCCESS' | 'ERROR' | 'TIMEOUT'> => {
    const text = `
      SELECT ${column} FROM ${table}
      WHERE ${matchColumn} = $1;
    `
    try {
      for (let i = 0; i < maxAttempts; i++) {
        const result = await this.query({ text, values: [matchValue] })
        const value = result.rows[0][column]

        if (value === waitValue) return 'SUCCESS'

        if (errorValue !== undefined && value === errorValue) return 'ERROR'

        await this.query({ text: 'SELECT pg_sleep($1)', values: [refetchInterval] })
      }
      return 'TIMEOUT'
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }
}

export type permissionPolicyColumns = {
  id: number
  rules: object
}

type GetPermissionPolicies = () => Promise<permissionPolicyColumns[]>

type SchemaColumn = {
  table_name: string
  table_type: 'BASE TABLE' | 'VIEW'
  column_name: string
  is_nullable: 'YES' | 'NO'
  is_generated: 'ALWAYS' | 'NEVER'
  data_type: 'USER-DEFINED' | 'jsonb' | 'ARRAY' | string // only interested in USER-DEFINED (enum), jsonb and array
  sub_data_type: 'USER-DEFINED' | string // this is for arry type, only interested in USER-DEFINED (enum)
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | null
  fk_to_table_name: string | null
  fk_to_column_name: string | null
}
type GetDatabaseInfo = (tableName?: string) => Promise<SchemaColumn[]>

const postgressDBInstance = PostgresDB.Instance
export default postgressDBInstance
