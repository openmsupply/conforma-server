import DBConnect from '../databaseConnect'
import { plural } from 'pluralize'
import { snakeCase } from 'lodash'

export const queryOutcomeTable = async (
  tableName: string,
  fieldNames: string[],
  first: number,
  offset: number,
  orderBy: string,
  ascending: boolean,
  authHeaders: string
) => {
  const tableNamePlural = plural(tableName)
  const graphQLquery = `query getOutcomeRecords { ${tableNamePlural}(first: ${first}, offset: ${offset}, orderBy: ${snakeCase(
    orderBy
  ).toUpperCase()}_${ascending ? 'ASC' : 'DESC'}) { nodes { ${fieldNames.join(
    ', '
  )} }, totalCount}}`

  const queryResult = await DBConnect.gqlQuery(graphQLquery, {}, authHeaders)
  const fetchedRecords = queryResult?.[tableNamePlural]?.nodes
  const totalCount = queryResult?.[tableNamePlural]?.totalCount
  return { fetchedRecords, totalCount }
}

export const queryOutcomeTableSingleItem = async (
  tableName: string,
  fieldNames: string[],
  id: number,
  authHeaders: string
) => {
  const graphQLquery = `query getOutcomeRecord($id:Int!){ ${tableName}(id: $id) {${fieldNames.join(
    ', '
  )}}}`
  const queryResult = await DBConnect.gqlQuery(graphQLquery, { id }, authHeaders)
  const fetchedRecord = queryResult?.[tableName]
  return fetchedRecord
}

export const queryLinkedApplications = async (id: number, tableName: string) => {
  const joinTableName = `${tableName}ApplicationJoins`
  const idField = `${tableName}Id`
  const graphQLquery = `query getLinkedApplications($id: Int!) { ${joinTableName}(filter: {${idField}: {equalTo: $id}}) { nodes { application { name, serial, stage, template { name, code }, applicationStageHistories(filter: {isCurrent: {equalTo: true}}) { nodes { stage { number, title }, applicationStatusHistories(filter: {isCurrent: {equalTo: true}}) { nodes { status, timeCreated }}}}}}}}`

  const queryResult = await DBConnect.gqlQuery(graphQLquery, { id })

  const linkedApplications = queryResult?.[joinTableName]?.nodes.map(({ application }: any) => ({
    name: application?.name,
    serial: application?.serial,
    templateName: application?.template?.name,
    templateCode: application?.template?.code,
    dateCompleted:
      application?.applicationStageHistories?.nodes[0]?.applicationStatusHistories?.nodes[0]
        ?.timeCreated,
  }))
  return linkedApplications
}
