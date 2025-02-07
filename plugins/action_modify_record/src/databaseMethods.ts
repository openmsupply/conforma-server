import { errorMessage } from '../../../src/components/utilityFunctions'
import config from '../../../src/config'

const DATA_TABLE_PREFIX = config.dataTablePrefix

interface UserData {
  userId?: number | null
  orgId?: number | null
  applicationId?: number | null
}

interface ChangeLogOptions extends UserData {
  noChangeLog: boolean
  comment?: string
}

const databaseMethods = (DBConnect: any) => {
  const getCurrentData = async (
    tableName: string,
    recordId: number,
    newData: Record<string, any> | null
  ) => {
    const text = newData
      ? `
      SELECT ${Object.keys(newData).join(', ')} FROM "${tableName}"
      WHERE id = $1
    `
      : `
      SELECT * FROM "${tableName}"
      WHERE id = $1
    `
    try {
      const result = await DBConnect.query({ text, values: [recordId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  const createRecord = async (
    tableName: string,
    record: { [key: string]: any },
    changeLogOptions: ChangeLogOptions
  ) => {
    const text = `
      INSERT INTO "${tableName}" ${getKeys(record)} 
      VALUES (${DBConnect.getValuesPlaceholders(record)})
      RETURNING *
      `
    const { userId, orgId, applicationId, noChangeLog, comment } = changeLogOptions
    try {
      const result = await DBConnect.query({ text, values: Object.values(record) })
      const firstRow = result.rows[0]
      if (!noChangeLog)
        await DBConnect.addToChangelog(
          tableName,
          firstRow.id,
          'CREATE',
          null,
          record,
          userId,
          orgId,
          applicationId,
          comment
        )
      return { success: true, [tableName]: firstRow, recordId: firstRow.id }
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  }

  return {
    getRecordIds: async (tableName: string, matchField: string, value: any) => {
      const text = `
      SELECT id FROM "${tableName}"
      WHERE "${matchField}" = $1
    `
      try {
        const result = await DBConnect.query({ text, values: [value] })
        return result?.rows.map(({ id }: { id: number }) => id)
      } catch (err) {
        console.log(errorMessage(err))
        throw err
      }
    },
    updateRecord: async (
      tableName: string,
      id: number,
      record: Record<string, any>,
      changeLogOptions: ChangeLogOptions
    ) => {
      const { userId, orgId, applicationId, noChangeLog, comment } = changeLogOptions

      let oldData: Record<string, any> = {}
      const newData = { ...record }
      try {
        oldData = await getCurrentData(tableName, id, record)

        // We only want to update data that has changed, so compare first
        Object.keys(oldData).forEach((key) => {
          if (key in newData && JSON.stringify(oldData[key]) === JSON.stringify(newData[key])) {
            delete oldData[key]
            delete newData[key]
          }
        })
      } catch (err) {
        console.log(errorMessage(err))
        throw err
      }

      const placeholders = DBConnect.getValuesPlaceholders(newData)
      const matchValuePlaceholder = `$${placeholders.length + 1}`

      const anythingToUpdate = Object.keys(newData).length > 0
      const text = anythingToUpdate
        ? `
        UPDATE "${tableName}" SET ${getKeys(newData, true)}
        = (${placeholders})
        WHERE id = ${matchValuePlaceholder}
        RETURNING *
      `
        : `
        SELECT * FROM "${tableName}"
        WHERE id = ${matchValuePlaceholder}
      `

      // Adding extra diagnostic logs here due to odd server bug, where the
      // serial wasn't being written on application create due to database
      // duplicate foreign key error
      console.log('Attempting query:', text)
      console.log('With values:', [...Object.values(newData), id])
      try {
        const result = await DBConnect.query({
          text,
          values: [...Object.values(newData), id],
        })
        if (!noChangeLog && anythingToUpdate)
          await DBConnect.addToChangelog(
            tableName,
            id,
            'UPDATE',
            oldData,
            newData,
            userId,
            orgId,
            applicationId,
            comment
          )
        return {
          success: true,
          [tableName]: result.rows[0],
          log: !anythingToUpdate ? `WARNING: No data changed (${tableName} id: ${id})` : '',
        }
      } catch (err) {
        console.log(errorMessage(err))
        throw err
      }
    },
    deleteRecord: async (tableName: string, id: number, changeLogOptions: ChangeLogOptions) => {
      const { userId, orgId, applicationId, noChangeLog, comment } = changeLogOptions

      let oldData: Record<string, any> = {}

      try {
        oldData = await getCurrentData(tableName, id, null)
      } catch (err) {
        console.log(errorMessage(err))
        throw err
      }

      const text = `
      DELETE FROM "${tableName}"
      WHERE id = $1
      RETURNING *
    `
      try {
        const result = await DBConnect.query({
          text,
          values: [id],
        })
        if (!noChangeLog)
          await DBConnect.addToChangelog(
            tableName,
            id,
            'DELETE',
            oldData,
            {},
            userId,
            orgId,
            applicationId,
            comment
          )
        return {
          success: true,
          [tableName]: result.rows[0],
        }
      } catch (err) {
        console.log(errorMessage(err))
        throw err
      }
    },
    createRecord,
    createTable: async (tableName: string, tableNameOriginal: string) => {
      const text = `CREATE TABLE "${tableName}" ( id serial PRIMARY KEY)`
      console.log('Creating table with statement: ', text)
      try {
        await DBConnect.query({ text })
        // Enable row-level security for table so its only accessible through
        // data-view endpoints
        await DBConnect.query({
          text: `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`,
        })
        // Also register new table in "data" table
        await DBConnect.query({
          text: `INSERT INTO data_table (table_name, display_name) VALUES($1, $2)`,
          values: [tableName.replace(DATA_TABLE_PREFIX, ''), tableNameOriginal],
        })
        // Enable any pre-existing data views for this table -- we're assuming
        // they're disabled because the table didn't exist yet
        await DBConnect.query({
          text: `UPDATE data_view SET enabled = TRUE
            WHERE table_name = $1
            OR table_name = $2
            OR table_name = $3;
            `,
          values: [tableName, tableNameOriginal, tableName.replace(DATA_TABLE_PREFIX, '')],
        })
      } catch (err) {
        console.log(errorMessage(err))
        throw new Error(`Failed to create table: ${tableName}`)
      }
    },
    createJoinTableAndRecord: async (
      tableName: string,
      applicationId: number,
      recordId: number
    ) => {
      // Create join table if one doesn't exist
      const joinTableName = `${tableName}_application_join`
      const text = `CREATE TABLE IF NOT EXISTS ${joinTableName}( 
                  id serial PRIMARY KEY, 
                  application_id integer references application(id) ON DELETE CASCADE NOT NULL,
                  ${tableName}_id integer references "${tableName}"(id) ON DELETE CASCADE NOT NULL);`

      console.log('creating join table with statement: ', text)
      try {
        await DBConnect.query({ text })
      } catch (err) {
        console.log(errorMessage(err))
        throw new Error(`Failed to create join table: ${joinTableName}`)
      }
      // Create entry in the join table
      const joinTableRecord = { application_id: applicationId, [`${tableName}_id`]: recordId }
      await createRecord(joinTableName, joinTableRecord, { noChangeLog: true })
    },
    createFields: async (
      tableName: string,
      fieldsToCreate: { fieldName: string; fieldType: string }[]
    ) => {
      const newColumns = fieldsToCreate.map(
        ({ fieldName, fieldType }) => `ADD COLUMN "${fieldName}" ${fieldType}`
      )
      const text = `ALTER TABLE "${tableName}" ${newColumns.join(',')};`
      console.log('creating new columns with statement: ', text)
      try {
        await DBConnect.query({
          text,
          value: [tableName],
        })
      } catch (err) {
        console.log(errorMessage(err))
        throw new Error(
          `Failed to create fields in table table: ${tableName} ${JSON.stringify(
            fieldsToCreate,
            null,
            ' '
          )}`
        )
      }
    },
  }
}

const getKeys = (record: { [key: string]: { value: any } }, update = false) => {
  const keys = Object.keys(record)
  const keyString = keys.map((key) => `"${key}"`).join(',')
  // UPDATE with only one field can't have brackets around key
  if (update && keys.length === 1) return keyString
  else return `(${keyString})`
}

export type DatabaseMethodsType = ReturnType<typeof databaseMethods>

export default databaseMethods
