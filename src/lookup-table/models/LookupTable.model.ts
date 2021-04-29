import { QueryResult } from 'pg'
import DBConnect from '../../components/databaseConnect'
import { FieldMapType, GqlQueryResult, LookupTableStructureType } from '../types'

const LookupTableModel = () => {
  const createStructure = async ({
    name: tableName,
    label,
    fieldMap,
  }: LookupTableStructureType): Promise<number> => {
    try {
      const text = `INSERT INTO lookup_table (name,label,field_map) VALUES ($1,$2,$3) RETURNING id`

      const result: QueryResult<{ id: number }> = await DBConnect.query({
        text,
        values: [tableName, label, JSON.stringify(fieldMap)],
      })

      if (result.rows[0].id) return result.rows[0].id

      throw new Error(`Lookup table structure '${label}' could not be created.`)
    } catch (error) {
      throw error
    }
  }

  const getStructureById = async (
    lookupTableId: number
  ): Promise<Required<LookupTableStructureType>> => {
    try {
      const result: GqlQueryResult<Required<LookupTableStructureType>> = await DBConnect.gqlQuery(
        `
          query getLookupTableStructure($id: Int!) {
            lookupTable(id: $id) {
              id
              label
              name
              fieldMap
            }
          }
        `,
        { id: lookupTableId }
      )

      if (!result || !result.lookupTable)
        throw new Error(`Lookup table structure with id '${lookupTableId}' does not exist.`)

      return result.lookupTable
    } catch (error) {
      throw error
    }
  }

  const createTable = async ({
    name: tableName,
    fieldMap: fieldMaps,
  }: LookupTableStructureType): Promise<boolean> => {
    try {
      const text = `CREATE TABLE lookup_table_${tableName}
      (
        ${fieldMaps.map((fieldMap) => `${fieldMap.fieldname} ${fieldMap.dataType}`).join(', ')}
      )`

      await DBConnect.query({ text })
      return true
    } catch (error) {
      throw error
    }
  }

  const createRow = async ({
    tableName,
    row,
  }: {
    tableName: string
    row: any
  }): Promise<{ id: string }[]> => {
    try {
      const setText = Object.keys(row)
        .map((key, index) => `$${index + 1}`)
        .join(', ')

      const text = `INSERT INTO lookup_table_${tableName}(${Object.keys(row)}) VALUES (${setText}
          ) RETURNING id`

      const result: QueryResult<{ id: number }> = await DBConnect.query({
        text,
        values: Object.values(row),
      })

      return result.rows.map((row: any) => row.id)
    } catch (error) {
      throw error
    }
  }

  const updateRow = async ({
    tableName,
    row,
  }: {
    tableName: string
    row: any
  }): Promise<{ id: string }[]> => {
    try {
      const keys = Object.keys(row)
      const primaryKeyIndex = keys.indexOf('id') + 1
      const setText = keys.map((key, index) => `${key} = $${index + 1}`).join(', ')

      const text = `UPDATE lookup_table_${tableName} SET ${setText} WHERE id = $${primaryKeyIndex} RETURNING id`

      const result: QueryResult<{ id: number }> = await DBConnect.query({
        text,
        values: Object.values(row),
      })

      return result.rows.map((row: any) => row.id)
    } catch (error) {
      throw error
    }
  }

  const updateStructureFieldMaps = async (
    tableName: string,
    fieldMaps: FieldMapType[]
  ): Promise<boolean> => {
    const text = `UPDATE lookup_table SET field_map = $1 WHERE name = $2`
    try {
      await DBConnect.query({ text, values: [JSON.stringify(fieldMaps), tableName] })
      return true
    } catch (err) {
      throw err
    }
  }

  const addTableColumns = async (tableName: string, fieldMap: FieldMapType): Promise<boolean> => {
    try {
      const text = `ALTER TABLE lookup_table_${tableName} ADD COLUMN ${fieldMap.fieldname} ${fieldMap.dataType}`
      await DBConnect.query({ text })
      return true
    } catch (err) {
      throw err
    }
  }

  return {
    createStructure,
    getStructureById,
    createTable,
    createRow,
    updateRow,
    updateStructureFieldMaps,
    addTableColumns,
  }
}
export default LookupTableModel
