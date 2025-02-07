import { camelCase } from 'lodash'
import databaseConnect from '../database/databaseConnect'
import { DatabaseTables, DatabaseTable } from './types'

// method will query DB for column definiations and return an array in shape of DatabaseTable
// array will be ordered by correct creation order based on FK relationshuiip
const getDatabaseInfo = async () => {
  const databaseInfo = await databaseConnect.getDatabaseInfo()
  let result: DatabaseTables = []
  // isInserted is for sorting when inserting into result array
  const tableColumnsObject: { [key: string]: DatabaseTable & { isInserted: boolean } } = {}

  databaseInfo.forEach(
    ({
      table_name,
      table_type,
      column_name,
      is_nullable,
      is_generated,
      data_type,
      sub_data_type,
      constraint_type,
      fk_to_table_name,
      fk_to_column_name,
    }) => {
      const tableName = camelCase(table_name)
      if (!(tableName in tableColumnsObject))
        tableColumnsObject[tableName] = {
          tableName,
          columns: [],
          referenceTables: [],
          isView: table_type === 'VIEW',
          isInserted: false,
        }

      const { columns, referenceTables } = tableColumnsObject[tableName]

      const columnName = camelCase(column_name)
      const isPrimary = constraint_type === 'PRIMARY KEY'
      const isUnique = constraint_type === 'UNIQUE'
      const isReference = constraint_type === 'FOREIGN KEY'
      const isNullable = is_nullable === 'YES'
      const isGenerated = is_generated === 'ALWAYS'
      const isEnum = data_type === 'USER-DEFINED'
      const isJson = data_type === 'jsonb'
      const isJsonArray = data_type === 'ARRAY' && sub_data_type === 'jsonb'
      const isEnumArray = data_type === 'ARRAY' && sub_data_type === 'USER-DEFINED'

      const fkTableName = camelCase(fk_to_table_name || '')
      const fkColumnName = camelCase(fk_to_column_name || '')
      columns.push({
        columnName,
        isPrimary,
        isUnique,
        isNullable,
        isGenerated,
        isReference,
        isEnum,
        isJsonArray,
        isJson,
        isEnumArray,
        reference: !isReference
          ? { columnName: '', tableName: '' }
          : {
              tableName: fkTableName,
              columnName: fkColumnName,
            },
      })

      if (isReference && !referenceTables.includes(fkTableName)) referenceTables.push(fkTableName)
    }
  )

  // Below we order result by foreign key relationship
  const databaseColumnsAsArray = Object.values(tableColumnsObject)
  while (true) {
    const tablesToAdd = databaseColumnsAsArray
      .filter(({ isInserted }) => !isInserted)
      .filter(({ referenceTables, tableName }) =>
        areReferenceTablesInResult(referenceTables, tableName, result)
      )

    if (tablesToAdd.length === 0) {
      onError(databaseColumnsAsArray, result)
    }
    // this changes databaseColumnsAsArray
    tablesToAdd.forEach((table) => (table.isInserted = true))

    result = [...result, ...tablesToAdd.map((table) => ({ ...table, isInserted: undefined }))]

    if (result.length === databaseColumnsAsArray.length) break
  }

  return result
}

const onError = (
  remainder: (DatabaseTable & { isInserted: boolean })[],
  result: DatabaseTables
) => {
  const remainingFKtables = remainder
    .filter(({ isInserted }) => !isInserted)
    .map(({ referenceTables }) => referenceTables)

  const resultTables = result.map(({ tableName }) => tableName)
  throw new Error(
    `cannot find FK tables : ${JSON.stringify(remainingFKtables, null, ' ')} in ${JSON.stringify(
      resultTables,
      null,
      ' '
    )}`
  )
}

const areReferenceTablesInResult = (
  referenceTables: string[],
  currentTableName: string,
  precedingTables: DatabaseTables
) => {
  if (referenceTables.length === 0) return true

  return !referenceTables.find(
    (referencedTableName) =>
      !precedingTables.find(
        ({ tableName }) =>
          referencedTableName === tableName || currentTableName === referencedTableName
      )
  )
}

export default getDatabaseInfo
