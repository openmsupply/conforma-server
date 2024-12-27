import DBConnect from '../database/databaseConnect'
import { errorMessage, isObject } from '../../components/utilityFunctions'
import { CombinedLinkedEntities, PgDataTable, PgDataView } from './types'
import { ApiError } from '../../ApiError'

const databaseMethods = {
  beginTransaction: async () => {
    try {
      await DBConnect.query({ text: 'BEGIN TRANSACTION;' })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  commitTransaction: async () => {
    try {
      await DBConnect.query({ text: 'COMMIT TRANSACTION;' })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  cancelTransaction: async () => {
    try {
      await DBConnect.query({ text: 'ROLLBACK TRANSACTION;' })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getRecord: async <T>(
    tableName: string,
    value: number | string | (number | string)[],
    field: string | string[] = 'id'
  ): Promise<T> => {
    return await DBConnect.getRecord(tableName, value, field)
  },
  getRecordsByField: async <T>(tableName: string, field: string, value: unknown): Promise<T[]> => {
    return await DBConnect.getRecordsByField(tableName, field, value)
  },
  updateChecksum: async (tableName: string, id: number, checksum: string) => {
    try {
      const text = `
        UPDATE ${tableName}
            SET checksum = $2,
            last_modified = NOW()
            WHERE id = $1`
      await DBConnect.query({ text, values: [id, checksum] })
      return
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Gets full records of items linked to a template via a join table
  getJoinedEntities: async <T>(input: {
    templateId: number
    table: string
    joinTable: string
  }): Promise<T[]> => {
    const { templateId, table, joinTable } = input
    const text = `
      SELECT *
      FROM ${table} WHERE id IN (
        SELECT ${table}_id FROM ${joinTable}
        WHERE template_id = $1
      )
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Get the ID of a file-to-template join record
  getFileJoinId: async (templateId: number, fileId: number) => {
    const text = `
      SELECT id FROM template_file_join
      WHERE template_id = $1
      AND file_id = $2
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId, fileId] })
      return result.rows[0].id
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Gets a list of file UIDs that are used by the "generateDoc" action for a
  // specific template
  getFilesFromDocAction: async (templateId: number): Promise<string[]> => {
    const text = `
      SELECT DISTINCT parameter_queries->>'docTemplateId' AS file_id
      FROM template_action
      WHERE template_id = $1
      AND action_code = 'generateDoc'
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId], rowMode: 'array' })
      return extractFileIdsFromExpressions(result.rows.flat())
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Gets a list of data tables used by "modifyRecord" actions
  getDataTablesFromModifyRecord: async (templateId: number): Promise<string[]> => {
    const text = `
      SELECT DISTINCT parameter_queries->>'tableName' as data_table
      FROM public.template_action
      WHERE template_id = $1
      AND 
        (action_code = 'modifyRecord'
         OR action_code = 'modifyMultipleRecords')
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId], rowMode: 'array' })
      return result.rows.flat()
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getLinkedDataTables: async (tableNames: string[]): Promise<PgDataTable[]> => {
    const text = `
      SELECT table_name, checksum, last_modified
        FROM data_table
        WHERE table_name = ANY($1)
        AND is_lookup_table = TRUE;
    `
    try {
      const result = await DBConnect.query({ text, values: [tableNames] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getDataViewColumns: async (tableName: string) => {
    const text = `
      SELECT *
      FROM data_view_column_definition
      WHERE table_name = $1
    `
    try {
      const result = await DBConnect.query({ text, values: [tableName] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  commitTemplate: async (
    templateId: number,
    versionId: string,
    comment: string | null,
    entityData: CombinedLinkedEntities
  ) => {
    const text = `
      UPDATE template SET
        version_id = $2,
        version_comment = $3,
        linked_entity_data = $4
        WHERE id = $1;`

    try {
      await DBConnect.query({ text, values: [templateId, versionId, comment, entityData] })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  insertRecord: async <T>(tableName: string, data: T) => {
    if (!isObject(data)) throw new ApiError("Cannot insert data that isn't an Object", 500)
    const fields = Object.keys(data)
    const fieldsString = fields.join(', ')
    const values = Object.values(data).map((value, index) =>
      DBConnect.isJsonColumn(tableName, fields[index]) ? JSON.stringify(value) : value
    )
    try {
      const text = `
        INSERT INTO ${tableName}
          (${fieldsString})
        VALUES (${DBConnect.getValuesPlaceholders(values)})
        RETURNING id;`
      const result = await DBConnect.query({ text, values })
      return result.rows[0].id
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  updateRecord: async (
    tableName: string,
    patch: Record<string, unknown>,
    matchField: string = 'id'
  ) => {
    const fields: string[] = []
    const values: unknown[] = []
    Object.entries(patch).forEach(([key, value], index) => {
      fields.push(`"${key}" = $${index + 1}`)

      if (DBConnect.isJsonColumn(tableName, key)) values.push(JSON.stringify(value))
      else values.push(value)
    })
    const matchValueText =
      typeof patch[matchField] === 'number' ? patch[matchField] : `'${patch[matchField]}'`

    const text = `UPDATE ${tableName} SET ${fields.join(
      ', '
    )} WHERE ${matchField} = ${matchValueText}`
    await DBConnect.query({ text, values })
  },
  // Gets the value to use as the next template draft version ID. This would
  // almost always just be "*", but if other drafts already exist, they get an
  // additional sequential number, e.g. "*_1", "*_2", etc
  getNextDraftVersionId: async (code: string) => {
    const text = `
      SELECT version_id FROM template
        WHERE code = $1
        AND version_id LIKE '*%'
    `
    try {
      const draftVersions = (
        await DBConnect.query({ text, values: [code], rowMode: 'array' })
      ).rows.flat()
      if (!draftVersions.includes('*')) return '*'
      let i = 1
      let nextDraftVersionId: string | null = null
      while (nextDraftVersionId === null) {
        if (draftVersions.includes(`*_${i}`)) {
          i++
          continue
        }
        nextDraftVersionId = `*_${i}`
      }
      return nextDraftVersionId
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getAllDataViews: async (): Promise<PgDataView[]> => {
    const text = `
      SELECT *
      FROM data_view
      ORDER BY table_name;
    `
    try {
      const result = await DBConnect.query({ text })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Data views that can be accessed with the specified permissions. Used to
  // determine if an applicant would be able to see a particular data view based
  // on the template permissions
  getAllAccessibleDataViews: async (permissions: string[]): Promise<PgDataView[]> => {
    const text = `
      SELECT *
      FROM data_view
      WHERE $1 && permission_names
      OR array_length(permission_names, 1) IS NULL;
    `
    try {
      const result = await DBConnect.query({ text, values: [permissions] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getDataViewsUsingTables: async (tables: string[]): Promise<PgDataView[]> => {
    const text = `
        SELECT *
          FROM data_view
          WHERE table_name = ANY($1);
    `
    try {
      const result = await DBConnect.query({ text, values: [tables] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getApplyPermissionsForTemplate: async (templateId: number): Promise<string[]> => {
    const text = `
      SELECT DISTINCT "permissionName" FROM public.permissions_all
        WHERE "templateId" = $1
        AND "permissionType" = 'APPLY'
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId], rowMode: 'array' })
      return result.rows.flat()
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getTemplateElementCountUsingDataView: async (templateId: number, dataViewCode: string) => {
    const text = `
      WITH a AS (SELECT '%/data-views/${dataViewCode}%' as val)
        SELECT COUNT(*) FROM public.template_element
          WHERE (parameters::text LIKE (SELECT val FROM a)
          OR visibility_condition::text LIKE (SELECT val FROM a)
          OR is_required::text LIKE (SELECT val FROM a)
          OR is_editable::text LIKE (SELECT val FROM a))
          AND section_id IN (
            SELECT id FROM template_section
            WHERE template_id = $1
          )
    `
    try {
      const result = await DBConnect.query({ text, values: [templateId] })
      return result.rows[0].count
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
}

export default databaseMethods

const MIN_STRING_LENGTH = 20
const MAX_STRING_LENGTH = 24

// Used by db.getFilesFromDocAction -- if the value of the `docTemplateId`
// property is an evaluator expression rather than a straight string, we want to
// pull out any appropriate strings from within. This recursively searches for
// strings between 20-24 chars in the JSON structure and returns them as an
// array (of file IDs)

const extractFileIdsFromExpressions = (values: string[]) => {
  const output: string[] = []
  for (const val of values) {
    try {
      const parsed: JsonData = JSON.parse(val)
      output.push(...extractData(parsed))
    } catch {
      output.push(val)
    }
  }
  return output
}

type JsonPrimitive = string | number | boolean | null
type JsonBaseObject = Record<string, JsonPrimitive>
type JsonData = Record<string, JsonPrimitive | JsonBaseObject> | (JsonData | JsonPrimitive)[]

const extractData = (data: JsonData | JsonPrimitive): string[] => {
  if (
    typeof data === 'string' &&
    data.length >= MIN_STRING_LENGTH &&
    data.length <= MAX_STRING_LENGTH
  )
    return [data]

  if (typeof data !== 'object' || data === null) return []

  const values = Object.values(data)

  return values.map((val) => extractData(val)).flat()
}
