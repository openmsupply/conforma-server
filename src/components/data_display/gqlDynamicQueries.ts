import DBConnect from '../database/databaseConnect'
import { plural } from 'pluralize'
import { camelCase, snakeCase, upperFirst } from 'lodash'
import { LinkedApplication } from './types'
import { capitaliseFirstLetter, errorMessage } from '../utilityFunctions'

export const queryDataTable = async (
  tableName: string,
  fieldNames: string[],
  gqlFilters: object,
  first: number,
  offset: number,
  orderBy: string,
  ascending: boolean
) => {
  const tableNamePlural = plural(tableName)
  const filterType = upperFirst(camelCase(tableName)) + 'Filter'
  const fieldNameString = fieldNames.join(', ')
  const orderByType = orderBy.endsWith('_DESC')
    ? snakeCase(orderBy).toUpperCase()
    : `${snakeCase(orderBy).toUpperCase()}_${ascending ? 'ASC' : 'DESC'}`
  const variables = { first, offset, filter: gqlFilters }
  const graphQLquery = `query getDataRecords($first: Int!, $offset: Int!, $filter: ${filterType}) { ${tableNamePlural}(first: $first, offset: $offset, orderBy: ${orderByType}, filter: $filter) { nodes { ${fieldNameString} }, totalCount}}`

  let queryResult
  try {
    queryResult = await DBConnect.gqlQuery(graphQLquery, variables)
  } catch (err) {
    return {
      error: { error: true, message: 'Problem with Data Table query', detail: errorMessage(err) },
    }
  }
  const fetchedRecords = queryResult?.[tableNamePlural]?.nodes
  const totalCount = queryResult?.[tableNamePlural]?.totalCount
  return { fetchedRecords, totalCount }
}

export const queryDataTableSingleItem = async (
  tableName: string,
  fieldNames: string[],
  gqlFilters: object,
  id: number
) => {
  const tableNamePlural = plural(tableName)
  const filterType = upperFirst(camelCase(tableName)) + 'Filter'
  const fieldNameString = fieldNames.join(', ')
  const variables = { id, filter: gqlFilters }
  const graphQLquery = `query getDataRecord($id:Int!, $filter:${filterType}){ ${tableNamePlural}(condition: {id: $id}, filter: $filter) { nodes {${fieldNameString}}}}`
  let queryResult
  try {
    queryResult = await DBConnect.gqlQuery(graphQLquery, variables)
  } catch (err) {
    return { error: true, message: 'Problem with Data Item query', detail: errorMessage(err) }
  }
  const fetchedRecords = queryResult?.[tableNamePlural]?.nodes
  if (fetchedRecords === undefined)
    return {
      error: true,
      message: 'Problem parsing query result',
      detail: 'Invalid object property',
    }
  if (fetchedRecords.length === 0)
    return {
      error: true,
      message: 'Item not available',
      detail: "Either this record doesn't exist, or you are not authorized to view it.",
    }
  return fetchedRecords[0]
}

export const queryLinkedApplications = async (id: number, tableName: string) => {
  // NB: Uses Admin authorization
  const joinTableName = `${tableName}ApplicationJoins`
  const idField = `${tableName}Id`
  const graphQLquery = `query getLinkedApplications($id: Int!) { ${joinTableName}(filter: {${idField}: {equalTo: $id}}) { nodes { application { id, name, serial, stage, template { name, code }, applicationStageHistories(filter: {isCurrent: {equalTo: true}}) { nodes { stage { number, title }, applicationStatusHistories(filter: {isCurrent: {equalTo: true}}) { nodes { status, timeCreated }}}}}}}}`

  let queryResult
  try {
    queryResult = await DBConnect.gqlQuery(graphQLquery, { id })
  } catch (err) {
    return [
      { error: true, message: 'Problem with Linked Applications query', detail: errorMessage(err) },
    ]
  }

  const linkedApplications: LinkedApplication[] = queryResult?.[joinTableName]?.nodes.map(
    ({ application }: any) => ({
      id: application?.id,
      name: application?.name,
      serial: application?.serial,
      templateName: application?.template?.name,
      templateCode: application?.template?.code,
      dateCompleted:
        application?.applicationStageHistories?.nodes[0]?.applicationStatusHistories?.nodes[0]
          ?.timeCreated,
    })
  )
  return linkedApplications
}

export const queryFilterList = async (
  tableName: string,
  columns: string[],
  gqlFilters: object,
  first: number,
  offset: number
) => {
  const tableNamePlural = plural(tableName)
  const filterType = upperFirst(camelCase(tableName)) + 'Filter'
  const variables = { filter: gqlFilters, first, offset }
  const graphQLquery = `query getFilterList($first: Int!, $offset: Int!, $filter: ${filterType}) { ${tableNamePlural}(first: $first, offset: $offset, filter: $filter) { nodes { ${columns.join(
    ','
  )} }, totalCount}}`

  let queryResult
  try {
    queryResult = await DBConnect.gqlQuery(graphQLquery, variables)
  } catch (err) {
    return {
      error: { error: true, message: 'Problem with Filter List query', detail: errorMessage(err) },
    }
  }

  const fetchedRecords = queryResult?.[tableNamePlural]?.nodes
  const totalCount = queryResult?.[tableNamePlural]?.totalCount

  return { fetchedRecords, totalCount }
}

export const updateRecord = async (
  tableName: string,
  id: number,
  patch: unknown,
  authHeaders: string
) => {
  const tableTypeName = capitaliseFirstLetter(tableName)
  const graphQLquery = `mutation UpdateRecord($id: Int!, $patch: ${tableTypeName}Patch!) {update${tableTypeName}(input: { patch: $patch, id: $id }) {${tableName} {id}}}`
  const variables = { id, patch }

  let queryResult
  try {
    queryResult = await DBConnect.gqlQuery(graphQLquery, variables, authHeaders)
  } catch (err) {
    return {
      error: { error: true, message: 'Problem with Filter List query', detail: errorMessage(err) },
    }
  }
}
