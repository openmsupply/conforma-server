import path from 'path'
import DBConnect from '../../src/components/database/databaseConnect'
import { getTemplateVersionId } from '../../src/components/exportAndImport/helpers'
import { FILES_FOLDER } from '../../src/constants'
import fs from 'fs/promises'
import { errorMessage } from '../../src/components/utilityFunctions'
import config from '../../src/config'
import { customAlphabet, nanoid } from 'nanoid'
import { camelCase } from 'lodash'

type SchemaQueryOptions = {
  silent: boolean
}

const databaseMethods = {
  // Use this method for schema changes, doesn't throw error, just prints
  // message to console (for when schema is already changed)
  changeSchema: async (query: string, options?: SchemaQueryOptions) => {
    try {
      await DBConnect.query({ text: query })
    } catch (err) {
      if (!options?.silent) console.log('Problem altering schema:', errorMessage(err), '\n')
    }
  },
  // Make base "query" method available unmodified
  query: DBConnect.query,
  getDatabaseVersion: async () => {
    const text = `SELECT name, value, timestamp
      FROM system_info
      WHERE timestamp =
        (SELECT MAX(timestamp) FROM system_info
        WHERE name='version')
       `
    try {
      const result = await DBConnect.query({ text })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  setDatabaseVersion: async (version: string) => {
    const text = `
      INSERT INTO system_info (name, value)
      VALUES('version', $1)
      `
    try {
      await DBConnect.query({ text, values: [`"${version}"`] })
    } catch (err) {
      throw err
    }
  },
  checkColumnExists: async (tableName: string, columnName: string) => {
    const text = `
      SELECT COUNT(*) FROM public.schema_columns 
      where table_name = $1
      AND column_name = $2;
    `
    const result = await DBConnect.query({ text, values: [tableName, columnName] })
    return result.rows[0].count > 0
  },
  addAssignedSectionsColumn: async () => {
    const text = `ALTER TABLE review_assignment
        ADD COLUMN assigned_sections varchar[] DEFAULT array[]::varchar[];`
    try {
      await DBConnect.query({ text })
    } catch (err) {
      throw err
    }
  },
  getIncompleteReviewAssignments: async () => {
    const text = `
      SELECT ra.id, status, assigned_sections, ts.code FROM review_assignment ra
      JOIN review_question_assignment rqa ON 
      ra.id = rqa.review_assignment_id
      JOIN template_element te ON rqa.template_element_id = te.id
      JOIN template_section ts ON te.section_id = ts.id
      WHERE status <> 'AVAILABLE'
      AND assigned_sections = '{}'
      ORDER BY ra.id
    `
    try {
      const result = await DBConnect.query({ text })
      return result.rows
    } catch (err) {
      throw err
    }
  },
  addAssignedSections: async (sectionAssignments: { id: number; assignedSections: string[] }[]) => {
    try {
      for (const sa of sectionAssignments) {
        const text = `
        UPDATE review_assignment
        SET assigned_sections = $1
        WHERE id = $2
        `
        await DBConnect.query({ text, values: [sa.assignedSections, sa.id] })
      }
    } catch (err) {
      throw err
    }
  },
  getLookupTableData: async () => {
    const text = `SELECT * FROM lookup_table`
    try {
      const result = await DBConnect.query({ text })
      return result.rows
    } catch (err) {
      // Lookup table probably already deleted
      console.log(errorMessage(err))
    }
  },
  insertDataTable: async (
    tableName: string,
    displayName: string,
    fieldMap: string,
    isLookupTable: boolean
  ) => {
    const text = `INSERT INTO data_table (table_name, display_name, field_map, is_lookup_table) VALUES($1, $2, $3, $4)`
    try {
      const result = await DBConnect.query({
        text,
        values: [tableName, displayName, fieldMap, isLookupTable],
      })
      return result.rows[0]
    } catch (err) {
      // Table record already exists, probably
      console.log(errorMessage(err))
    }
  },
  populateQueueApplicationIds: async (tableName: 'trigger_queue' | 'action_queue') => {
    const count = (await DBConnect.query({ text: `SELECT MAX(id) FROM ${tableName};` })).rows[0].max

    // This is duplicated in the later functions script, but we need it here
    // now, otherwise there'll be no application_id data in the review table.
    await DBConnect.query({
      text: `
      ALTER TABLE public.review
        DROP COLUMN IF EXISTS application_id CASCADE,
        ADD COLUMN IF NOT EXISTS application_id integer GENERATED ALWAYS AS (public.review_application_id (review_assignment_id)) STORED REFERENCES public.application (id) ON DELETE CASCADE;
      `,
    })

    for (let id = 1; id <= count; id++) {
      const trigger_data =
        tableName === 'trigger_queue'
          ? (
              await DBConnect.query({
                text: 'SELECT "table", record_id FROM trigger_queue WHERE id = $1',
                values: [id],
              })
            ).rows[0]
          : (
              await DBConnect.query({
                text: 'SELECT trigger_payload FROM action_queue WHERE id = $1',
                values: [id],
              })
            ).rows[0]?.trigger_payload

      if (!trigger_data) continue

      const { table, record_id } = trigger_data

      try {
        const application_id = await DBConnect.getApplicationIdFromTrigger(table, record_id)
        await DBConnect.query({
          text: `UPDATE ${tableName} SET application_id = $1 WHERE id = $2`,
          values: [application_id, id],
        })
      } catch {
        // Application no longer exists, so delete the queue record
        await DBConnect.query({
          text: `DELETE FROM ${tableName} WHERE id = $1`,
          values: [id],
        })
      }
    }
  },
  migrateTemplateVersions: async () => {
    // Get all templates
    let result
    try {
      result = await DBConnect.query({
        text: `SELECT id, code, version, version_timestamp, version_id FROM template`,
      })
    } catch {
      // This will fail if the "version" column has already been deleted in an
      // earlier migration run
      console.log('...Template versions already migrated')
      return
    }

    const allTemplates = result?.rows ?? []

    if (allTemplates.every((template) => template.version_id !== null)) {
      console.log('...Template versions already migrated')
      return
    }

    // Get unique codes
    const templateCodes = Array.from(new Set(allTemplates.map((t) => t.code)))

    // Iterate over codes
    for (const code of templateCodes) {
      const templates = allTemplates
        .filter((t) => t.code === code)
        .sort((a, b) => a.version - b.version)

      const versionHistory: {
        versionId: string
        timestamp: string
        parentVersionId: string | null
        comment: string | null
      }[] = []

      for (const template of templates) {
        const versionId = getTemplateVersionId()
        const timestamp = template.version_timestamp.toISOString()
        const parentVersionId = versionHistory.slice(-1)?.[0]?.versionId ?? null
        const comment = `New version: ${versionId}`
        const historyObject = { versionId, timestamp, parentVersionId, comment }

        const text = `UPDATE template SET version_id = $1,
          parent_version_id = $2,
          version_history = $3
          WHERE id = $4`

        await DBConnect.query({
          text,
          values: [versionId, parentVersionId, JSON.stringify(versionHistory), template.id],
        })
        versionHistory.push(historyObject)
      }
    }
  },
  updateFileSizes: async () => {
    const files = (
      await DBConnect.query({
        text: `SELECT id, archive_path, file_path FROM file
        WHERE file_size IS NULL;`,
      })
    ).rows

    for (const file of files) {
      const fileId = file.id
      const archivePath = file.archive_path ?? ''
      const filePath = file.file_path
      const fullPath = path.join(FILES_FOLDER, archivePath, filePath)
      try {
        const size = (await fs.stat(fullPath)).size

        await DBConnect.query({
          text: `UPDATE file SET file_size = $1
          WHERE id = $2`,
          values: [size, fileId],
        })
      } catch {
        console.log('Problem updating file size for:', fullPath)
      }
    }
  },
  convertDataTablesToCaseInsensitive: async () => {
    type FieldMap = { label: string; gqlName: string; dataType: string; fieldName: string }
    // Get list of data tables from "data_table"
    let result
    try {
      result = await DBConnect.query({
        text: `SELECT id, table_name, field_map, is_lookup_table
          FROM data_table;`,
      })
    } catch {
      console.log('ERROR: Problem getting list of data tables')
    }
    if (!result) return
    const dataTables = result.rows.map(({ id, table_name, field_map, is_lookup_table }) => ({
      id,
      table_name: `${config.dataTablePrefix}${table_name}`,
      field_map: is_lookup_table
        ? field_map.map(({ dataType, ...rest }: FieldMap) => ({
            dataType: dataType === 'varchar' ? 'citext' : dataType,
            ...rest,
          }))
        : null,
    }))

    // For each data table, get list of varchar columns
    for (const table of dataTables) {
      let result
      try {
        result = await DBConnect.query({
          text: `SELECT column_name FROM information_schema.columns
          WHERE table_name = $1
          AND data_type = 'character varying';
        `,
          values: [table.table_name],
          rowMode: 'array',
        })
      } catch {
        console.log('Problem getting column data for table: ', table.table_name)
      }
      if (!result) continue
      const columns = result.rows.flat()

      // Iterate over each column, converting to citext
      for (const col of columns) {
        try {
          await DBConnect.query({
            text: `ALTER TABLE ${table.table_name}   
            ALTER COLUMN ${col} TYPE citext;`,
          })
        } catch (err) {
          console.log(
            `ERROR: Problem converting column ${col} on table ${table.table_name} to case-insensitive`
          )
          console.log((err as any).message)
        }
      }

      // Write field maps back to data_table
      if (table.field_map) {
        try {
          await DBConnect.query({
            text: `UPDATE data_table SET field_map = $1
              WHERE id = $2`,
            values: [JSON.stringify(table.field_map), table.id],
          })
        } catch (err) {
          console.log('Problem writing field map to data_table')
          console.log((err as any).message)
        }
      }
    }
  },
  updateLevelIdInReviewAssignments: async () => {
    // Remove duplicate (same stage_id, number) review levels -- it's unclear
    // how these got created, but they should be unique
    const duplicates = await DBConnect.query({
      text: `
        SELECT t1.id, t1.stage_id, t1.name, t2.number,
        t1.description, t1.single_reviewer_all_sections
        FROM template_stage_review_level t1
        JOIN template_stage_review_level t2
        ON t1.stage_id = t2.stage_id AND t1.number = t2.number
        WHERE t1.id <> t2.id
        ORDER BY stage_id, number, id;
      `,
    })
    let current = { id: 0, stage_id: 0, number: 0 }
    const idsToDelete = [] as any
    duplicates.rows.forEach((row) => {
      if (row.stage_id === current.stage_id && row.number === current.number)
        idsToDelete.push(current.id)
      current = row
    })
    await DBConnect.query({
      text: `
        DELETE FROM template_stage_review_level
        WHERE id = ANY($1)
      `,
      values: [idsToDelete],
    })

    // Update existing review assignments with correct level_ids
    await DBConnect.query({
      text: `
        UPDATE review_assignment ra
        SET level_id = (
          SELECT id FROM template_stage_review_level
          WHERE stage_id = (
            SELECT id FROM template_stage
            WHERE id = (
              SELECT stage_id FROM review_assignment
              WHERE id = ra.id
            )
          )
          AND number = (
            SELECT level_number FROM review_assignment
            WHERE id = ra.id
          )
        )
        WHERE level_id IS null;
      `,
    })

    // Make stage_id/number unique for review_levels to prevent above duplicates
    // problem in future
    await DBConnect.query({
      text: `
        CREATE UNIQUE INDEX IF NOT EXISTS unique_review_level_stage_id_number
        ON template_stage_review_level (stage_id, number)
      `,
    })
  },
  createApplicationReviewerActionRecords: async () => {
    const totalActionCount = (
      await DBConnect.query({
        text: 'SELECT COUNT(*) FROM application_reviewer_action;',
      })
    ).rows[0].count

    // Most migrations are OK to re-execute over and over before the app version
    // is officially updated. However, this one can't be, as it needs the
    // *previous* version of the `application_list` database function. After the
    // initial migration, that function is replaced with a simpler (faster)
    // version, so attempting to run the following migration again will not
    // work. So we do an initial check -- if any `application_reviewer_action`
    // records exist, we assume this migration must have already taken place,
    // and so skip it.
    if (totalActionCount > 0) {
      console.log('  ...already done, skipping...')
      return
    }

    // Create lists of reviewers/assigners on application table
    await DBConnect.query({
      text: `
        WITH lists AS (
          SELECT * FROM application_list(0)
        )
        UPDATE public.application
          SET (reviewer_list, assigner_list)
          = (
              SELECT reviewers, assigners FROM lists WHERE lists.id = application.id
          );
      `,
    })

    // Get ids of internal users
    const intUsers = (
      await DBConnect.query({
        text: `
        SELECT DISTINCT(permissions_all."userId") FROM permissions_all
        WHERE "isSystemOrgPermission" = true;
      `,
        rowMode: 'array',
      })
    ).rows.flat()

    for (const userId of intUsers) {
      const applications = (
        await DBConnect.query({
          text: `
          SELECT id, reviewer_action, assigner_action
            FROM application_list($1);
        `,
          values: [userId],
        })
      ).rows
      for (const app of applications) {
        const { id, reviewer_action, assigner_action } = app
        if (reviewer_action === null && assigner_action === null) continue

        await DBConnect.query({
          text: `
            INSERT INTO public.application_reviewer_action
            (user_id, application_id, reviewer_action, assigner_action)
            VALUES ($1, $2, $3, $4);
          `,
          values: [userId, id, reviewer_action, assigner_action],
        })
      }
      console.log(`   - Records created for user ${userId}`)
    }
  },
  removeDuplicateIndexes: async (tableName?: string) => {
    // Matches any indexes that end in "keyXX" where XX is one or more numeric
    // characters
    const text = `
      SELECT tablename, indexname FROM pg_indexes
        WHERE indexname SIMILAR TO '%key\\d+'
        ${tableName ? ' AND tablename = $1' : ''};
      `
    const values = tableName ? [tableName] : []

    // Get indexes
    const indexes = (await DBConnect.query({ text, values })).rows

    for (const index of indexes) {
      const { tablename, indexname } = index
      await DBConnect.query({
        text: `
        ALTER TABLE ${tablename} DROP CONSTRAINT IF EXISTS ${indexname};`,
      })
    }
  },
  secureDataTables: async () => {
    const dataTables = (
      await DBConnect.query({ text: `SELECT table_name FROM data_table;`, rowMode: 'array' })
    ).rows.flat()

    for (const table of dataTables) {
      try {
        await DBConnect.query({
          text: `ALTER TABLE ${config.dataTablePrefix}${table} ENABLE ROW LEVEL SECURITY;`,
        })
      } catch {
        console.log(`ERROR: Problem securing data table "${table}"`)
      }
    }
  },
  disableDataTableSecurity: async () => {
    const dataTables = (
      await DBConnect.query({ text: `SELECT table_name FROM data_table;`, rowMode: 'array' })
    ).rows.flat()

    for (const table of dataTables) {
      try {
        await DBConnect.query({
          text: `ALTER TABLE ${config.dataTablePrefix}${table} DISABLE ROW LEVEL SECURITY;`,
        })
      } catch {
        console.log(`ERROR: Problem changing data table security: "${table}"`)
      }
    }
  },
  addDataViewsForLookupTables: async () => {
    try {
      await DBConnect.query({ text: `SELECT menu_name FROM data_view` })
      console.log('  ...already done, skipping...')
      // If this column exists, then we've done this before, so don't re-run the
      // migration in the `catch` block (otherwise it'll add menu names to
      // existing lookup table views)
    } catch {
      // Add new column to data views
      await DBConnect.query({
        text: `ALTER TABLE data_view
        ADD COLUMN IF NOT EXISTS menu_name varchar;`,
      })

      // Fill this column with default "title" value for existing
      await DBConnect.query({
        text: `UPDATE data_view
          SET menu_name = title;`,
      })
    }

    // Add dataView codes for lookup tables that don't have one
    const lookupTablesWithoutDataView = (
      await DBConnect.query({
        text: `
      SELECT id FROM data_table
        WHERE data_view_code IS NULL
        AND is_lookup_table = true;`,
        rowMode: 'array',
      })
    ).rows.flat()
    const randomId = customAlphabet('1234567890', 4)
    for (const id of lookupTablesWithoutDataView) {
      await DBConnect.query({
        text: `UPDATE data_table
          SET data_view_code = CONCAT(LEFT(table_name, 3), ${randomId()})
          WHERE id = $1;`,
        values: [id],
      })
    }
    // Then create data views for all lookup tables (if they don't have one)
    const lookupTables = (
      await DBConnect.query({
        text: `
      SELECT table_name, display_name,
      data_view_code FROM data_table
        WHERE is_lookup_table = true`,
      })
    ).rows
    for (const table of lookupTables) {
      const existingCount = (
        await DBConnect.query({
          text: `
        SELECT COUNT(*) FROM data_view
          WHERE table_name = $1
          AND code = $2
        `,
          values: [camelCase(table.table_name), table.data_view_code],
        })
      ).rows[0]
      if (existingCount.count === '0') {
        // Make a new one
        await DBConnect.query({
          text: `
          INSERT INTO data_view
            (table_name, title, code, permission_names,
            detail_view_header_column,
            show_linked_applications, identifier)
            VALUES($1, $2, $3, $4, 'id', false, $5);`,
          values: [
            camelCase(table.table_name),
            table.display_name,
            table.data_view_code,
            [
              'admin',
              config.systemManagerPermissionName ?? config.defaultSystemManagerPermissionName,
            ],
            `${table.table_name}_${nanoid(6)}`,
          ],
        })
      }
    }
  },
}

export default databaseMethods
