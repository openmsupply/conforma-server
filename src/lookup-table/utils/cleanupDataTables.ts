/**
 * Keep data_table records in sync with actual data tables by deleting one if
 * the other no longer exists. Runs at startup and on snapshot load/save.
 */

import db from '../databaseMethods'
import config from '../../config'

interface DataTableRecord {
  id: number
  table_name: string
}

export const cleanupDataTables = async () => {
  console.log('Cleaning up data tables...')
  const dataTableRecords: DataTableRecord[] = await db.getAllDataTableRecords()
  const dataTableNames = dataTableRecords.map(
    ({ table_name }) => `${config.dataTablePrefix}${table_name}`
  )

  const dataTables = await db.getAllDataTableNames()

  const recordsToDelete = dataTableRecords.filter(
    (record) => !dataTables.includes(`${config.dataTablePrefix}${record.table_name}`)
  )

  const tablesToDelete = dataTables.filter((table) => !dataTableNames.includes(table))

  for (const record of recordsToDelete) {
    console.log(
      `Deleting dataTable record for table ${record.table_name} as the table no longer exists`
    )
    await db.deleteDataTableRecord(record.id)
  }

  for (const table of tablesToDelete) {
    console.log(`Dropping data table ${table} as the data_table record has been deleted`)
    await db.dropDataTable(table)
  }
}
