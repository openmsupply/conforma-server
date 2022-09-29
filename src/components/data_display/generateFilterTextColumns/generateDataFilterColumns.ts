import databaseMethods from './databaseMethods'
import DBConnect from '../../databaseConnect'
import evaluateExpression from '@openmsupply/expression-evaluator'
import { queryDataTable, updateRecord } from '../gqlDynamicQueries'
import config from '../../../config'
import { getValidTableName } from '../../utilityFunctions'
import fetch from 'node-fetch'
import { camelCase, snakeCase } from 'lodash'
// @ts-ignore
import delay from 'delay-sync'

const graphQLEndpoint = config.graphQLendpoint
const blockSize = 10 // How many database records to process at once

interface Column {
  name: string
  dataType: string
}

interface FilterTextColumnDefinition {
  column: string
  expression: object
  dataType: string
}

export const routeGenerateDataFilterFields = async (request: any, reply: any) => {
  const authHeaders = request?.headers?.authorization
  const { table } = request.query

  const result = await generateFilterTextColumns(table, authHeaders)

  return reply.send(result)
}

const generateFilterTextColumns = async (table: string, authHeaders: string) => {
  try {
    const db = databaseMethods(DBConnect)
    const tableNameFull = snakeCase(getValidTableName(table))

    // Get all filter-data-generating columns for table from
    // data_view_column_definitions (must have "filter_expression defined" and
    // have "Filter" as the column name suffix)
    const filterTextColumnDefinitions: FilterTextColumnDefinition[] = (
      await db.getFilterColumnDefintions(table)
    ).map(({ column, expression, dataType }: FilterTextColumnDefinition) => ({
      column: snakeCase(column),
      expression,
      dataType: dataType ?? 'character varying',
    }))

    // Get all current columns from data table with "_filter" suffix
    let currentColumns: Column[] = await db.getCurrentFilterColumns(tableNameFull)

    // Create or update database columns
    for (const { column, dataType } of filterTextColumnDefinitions) {
      if (!currentColumns.find((col) => column === col.name && dataType === col.dataType)) {
        await db.addOrUpdateColumn(tableNameFull, column, dataType)
      }
      // Remove from current columns list
      currentColumns = currentColumns.filter(({ name }) => name !== column)
    }

    // Delete unused (no filter definitions) columns
    for (const { name } of currentColumns) {
      await db.dropColumn(tableNameFull, name)
    }

    // Iterate over all data table records and update their filter field values
    const allFields = (await DBConnect.getDataTableColumns(tableNameFull)).map(({ name }) =>
      camelCase(name)
    )

    // Pause to allow postgraphile "watch" to detect changed schema
    delay(1000)

    let fetchedCount = 0
    let total = Infinity

    while (fetchedCount < total) {
      const { fetchedRecords, totalCount, error } = await queryDataTable(
        camelCase(tableNameFull),
        allFields,
        {},
        blockSize,
        fetchedCount,
        'id',
        true,
        authHeaders
      )

      if (error) return error

      total = totalCount
      fetchedCount += fetchedRecords.length

      for (const record of fetchedRecords) {
        const patch: any = {}
        for (const { column, expression } of filterTextColumnDefinitions) {
          const evaluatedResult = await evaluateExpression(expression, {
            objects: record,
            // pgConnection: DBConnect, probably don't want to allow SQL
            APIfetch: fetch,
            // TO-DO: Need to pass Auth headers to evaluator API calls
            graphQLConnection: { fetch, endpoint: graphQLEndpoint },
          })
          // console.log('evaluatedResult', evaluatedResult)
          patch[camelCase(column)] = evaluatedResult
        }
        const result = await updateRecord(camelCase(tableNameFull), record.id, patch, authHeaders)

        if (result?.error) return result.error
      }
    }

    return {
      success: true,
      updatedDatabaseColumns: filterTextColumnDefinitions.map(({ column }) => column),
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
