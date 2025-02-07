import DBConnect from '../components/database/databaseConnect'
import { errorMessage } from '../components/utilityFunctions'
import config from '../config'

const databaseMethods = {
  getLookupTable: async (id: number) => {
    try {
      // Get table details
      const result = await DBConnect.query({
        text: 'SELECT table_name, field_map FROM data_table WHERE id = $1',
        values: [id],
      })
      const tableName = `${config.dataTablePrefix}${result.rows[0].table_name}`

      // Get table
      const data = await DBConnect.query({ text: `SELECT * FROM ${tableName} ORDER BY id;` })
      return data.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getAllLookupTableStructures: async () => {
    const result = await DBConnect.gqlQuery(
      `query getAllLookupTableStructures {
        dataTables(condition: {isLookupTable: true}) {
          nodes {
            id
            tableName
            displayName
            fieldMap
            __typename
            dataViewCode
          }
          __typename
        }
      }
    `
    )
    return result?.dataTables?.nodes
  },
  getLookupTableStructure: async (id: number) => {
    const result = await DBConnect.gqlQuery(
      `query getTableStructure($id: Int!) {
        dataTable(id: $id) {
          dataViewCode
          displayName
          fieldMap
          id
          tableName
        }
      }
    `,
      { id }
    )
    return result?.dataTable
  },
  getAllDataTableRecords: async () => {
    try {
      const result = await DBConnect.query({
        text: `SELECT id, table_name FROM public.data_table`,
      })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getAllDataTableNames: async () => {
    try {
      const result = await DBConnect.query({
        text: `
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name LIKE '${config.dataTablePrefix}%'
          AND table_name NOT LIKE '%_application_join'
        `,
        rowMode: 'array',
      })
      return result.rows.flat()
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  dropDataTable: async (tableName: string) => {
    try {
      await DBConnect.query({
        text: `
          DROP TABLE IF EXISTS ${tableName} CASCADE;
          DROP TABLE IF EXISTS ${tableName}_application_join CASCADE;
        `,
      })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  deleteDataTableRecord: async (id: number) => {
    try {
      await DBConnect.query({
        text: `
          DELETE from public.data_table
          WHERE id = $1;
        `,
        values: [id],
      })
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
}

export default databaseMethods
