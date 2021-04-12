import DBConnect from '../../components/databaseConnect'
import { LookupTableStructurePropType } from '../types'

const LookupTableStructureModel = () => {
  const getByID = async (lookupTableId: number) => {
    try {
      const data = await DBConnect.gqlQuery(
        `
          query getLookupTableStructure($id: Int!) {
            lookupTable(id: $id) {
              label
              name
              fieldMap
            }
          }
        `,
        { id: lookupTableId }
      )
      if (data.lookupTable) return data.lookupTable
      throw new Error(`Table structure with id "${lookupTableId}" not found.`)
    } catch (error) {
      throw error
    }
  }

  const updateFieldMaps = async (tableName: string, fieldMaps: any) => {
    const text = `UPDATE lookup_table SET field_map = $1 WHERE name = $2`
    try {
      const result = await DBConnect.query({ text, values: [JSON.stringify(fieldMaps), tableName] })
      return result
    } catch (err) {
      throw err
    }
  }

  const create = async ({ tableName, label, fieldMap }: LookupTableStructurePropType) => {
    const text = `INSERT INTO lookup_table (name,label,field_map) VALUES ($1,$2,$3) RETURNING id`

    const result = await DBConnect.query({
      text,
      values: [tableName, label, JSON.stringify(fieldMap)],
    })
    return result.rows.map((row: any) => row.id)
  }
  return {
    getByID,
    create,
    updateFieldMaps,
  }
}

export default LookupTableStructureModel
