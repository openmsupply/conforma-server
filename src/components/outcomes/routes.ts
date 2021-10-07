import DBConnect from '../databaseConnect'
import { getDistinctObjects, objectKeysToCamelCase } from '../utilityFunctions'
import {
  getPermissionNamesFromJWT,
  buildAllColumnDefinitions,
  constructTableResponse,
  constructDetailsResponse,
} from './helpers'
import {
  queryOutcomeTable,
  queryOutcomeTableSingleItem,
  queryLinkedApplications,
} from './gqlDynamicQueries'
import { camelCase } from 'lodash'
import { ColumnDefinition, LinkedApplication, OutcomesResponse } from './types'

const routeOutcomes = async (request: any, reply: any) => {
  const { permissionNames } = await getPermissionNamesFromJWT(request)
  const outcomes = await DBConnect.getAllowedOutcomeDisplays(permissionNames)
  const distinctOutcomes = getDistinctObjects(outcomes, 'table_name', 'priority')
  const outcomeResponse: OutcomesResponse = distinctOutcomes.map(({ table_name, title, code }) => ({
    tableName: camelCase(table_name),
    title,
    code,
  }))
  return reply.send(outcomeResponse)
}

const routeOutcomesTable = async (request: any, reply: any) => {
  const authHeaders = request?.headers?.authorization
  const tableName = camelCase(request.params.tableName)
  const { userId, orgId, permissionNames } = await getPermissionNamesFromJWT(request)
  const query = objectKeysToCamelCase(request.query)

  // GraphQL pagination parameters
  const first = query?.first ? Number(query.first) : 20
  const offset = query?.offset ? Number(query.offset) : 0
  const orderBy = query?.orderBy ?? 'id'
  const ascending = query?.ascending ? query?.ascending === 'true' : true

  const { columnDefinitionMasterList, fieldNames, gqlFilters, title, code } =
    await buildAllColumnDefinitions({
      permissionNames,
      tableName,
      type: 'TABLE',
      userId,
      orgId,
    })

  // GraphQL query -- get ALL fields (passing JWT), with pagination
  const { fetchedRecords, totalCount, error } = await queryOutcomeTable(
    tableName,
    fieldNames,
    gqlFilters,
    first,
    offset,
    orderBy,
    ascending,
    authHeaders
  )
  if (error) return error

  const response = await constructTableResponse(
    tableName,
    title,
    code,
    columnDefinitionMasterList,
    fetchedRecords,
    totalCount
  )

  return reply.send(response)
}

const routeOutcomesDetail = async (request: any, reply: any) => {
  const authHeaders = request?.headers?.authorization
  const tableName = camelCase(request.params.tableName)
  const recordId = Number(request.params.id)
  const { userId, orgId, permissionNames } = await getPermissionNamesFromJWT(request)

  const {
    columnDefinitionMasterList,
    title,
    fieldNames,
    gqlFilters,
    headerDefinition,
    showLinkedApplications,
  } = await buildAllColumnDefinitions({ permissionNames, tableName, type: 'DETAIL', userId, orgId })

  // GraphQL query -- get ALL fields (passing JWT), with pagination
  const fetchedRecord = await queryOutcomeTableSingleItem(
    tableName,
    fieldNames,
    gqlFilters,
    recordId,
    authHeaders
  )

  if (fetchedRecord?.error) return fetchedRecord

  // GraphQL query to get linked applications -- this one with Admin JWT!
  const linkedApplications = showLinkedApplications
    ? await queryLinkedApplications(recordId, tableName)
    : undefined

  const response = await constructDetailsResponse(
    tableName,
    title,
    columnDefinitionMasterList,
    headerDefinition as ColumnDefinition,
    fetchedRecord,
    linkedApplications as LinkedApplication[]
  )

  return reply.send(response)
}

export { routeOutcomes, routeOutcomesTable, routeOutcomesDetail }
