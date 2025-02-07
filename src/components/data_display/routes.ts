import DBConnect from '../database/databaseConnect'
import { getDistinctObjects, getValidTableName, objectKeysToCamelCase } from '../utilityFunctions'
import {
  getPermissionNamesFromJWT,
  buildAllColumnDefinitions,
  constructTableResponse,
  constructDetailsResponse,
  getFilters,
} from './helpers'
import {
  queryDataTable,
  queryDataTableSingleItem,
  queryFilterList,
  queryLinkedApplications,
} from './gqlDynamicQueries'
import { camelCase, kebabCase } from 'lodash'
import { ColumnDefinition, LinkedApplication, DataViewDetail } from './types'
import { DataView } from '../../generated/graphql'
import config from '../../config'
import { FastifyReply, FastifyRequest } from 'fastify'
import { MAX_32_BIT_INT } from '../../constants'

// CONSTANTS
const LOOKUP_TABLE_PERMISSION_NAME = 'lookupTables'

const routeDataViews = async (request: FastifyRequest, reply: FastifyReply) => {
  const { permissionNames } = await getPermissionNamesFromJWT(request)
  const dataViews = (await DBConnect.getAllowedDataViews(permissionNames)).filter(
    (dv) => dv.menu_name !== null
  )
  const distinctDataViews = getDistinctObjects(dataViews, 'code', 'priority')
  const dataViewResponse: DataViewDetail[] = distinctDataViews.map(
    ({ table_name, title, code, submenu, menu_name, default_filter_string }) => ({
      tableName: camelCase(table_name),
      title,
      code,
      urlSlug: kebabCase(code),
      menuName: menu_name,
      submenu,
      defaultFilter: default_filter_string,
    })
  )
  return reply.send(dataViewResponse)
}

const routeDataViewTable = async (request: any, reply: any) => {
  const dataViewCode = camelCase(request.params.dataViewCode)
  const { userId, orgId, permissionNames } = await getPermissionNamesFromJWT(request)
  if (request.auth.isAdmin) permissionNames.push(LOOKUP_TABLE_PERMISSION_NAME)
  const query = objectKeysToCamelCase(request.query)
  const filter = request.body ?? {}

  // The `returnRawData` option is used in application form queries, where we
  // want the data in a simplified structure and no column/filter definition
  // metaData
  const returnRawData = query?.raw === 'true' ?? false

  // GraphQL pagination parameters
  const first = query?.first ? Number(query.first) : returnRawData ? MAX_32_BIT_INT : 20
  const offset = query?.offset ? Number(query.offset) : 0
  const orderBy = query?.orderBy
  const ascending = query?.ascending ? query?.ascending === 'true' : true
  const search = query?.search

  const {
    tableName,
    columnDefinitionMasterList,
    fieldNames,
    searchFields,
    filterDefinitions,
    defaultSortColumn,
    defaultFilterString,
    gqlFilters,
    title,
    code,
  } = await buildAllColumnDefinitions({
    permissionNames,
    dataViewCode,
    type: returnRawData ? 'RAW' : 'TABLE',
    filter,
    userId,
    orgId,
  })

  if (search !== '' && searchFields.length > 0) {
    // The "search" term may come in as a plain string rather than being
    // pre-baked into the "filter" object (this would normally be the case when
    // rawData is requested from application queries). In this case, we need to
    // build a filter and merge it with the existing filter.
    //
    // GQL Filter properties are all "AND" clauses. The additional filter is
    // applied as another "AND" clause (so just added to properties). If the
    // additional filter targets multiple (search) fields, they'll be added as
    // an "OR" array. And if the existing filter already has an "OR" clause,
    // this will be merged with it. In all other cases, the additional filter
    // will over-ride the existing filter if their properties conflict.
    const additionalSearchFilter =
      searchFields.length === 1
        ? { [searchFields[0]]: { includesInsensitive: search } }
        : { or: searchFields.map((field) => ({ [field]: { includesInsensitive: search } })) }

    const newFilterKey = Object.keys(
      additionalSearchFilter
    )[0] as keyof typeof additionalSearchFilter

    if (newFilterKey === 'or') {
      gqlFilters.or = [...(gqlFilters.or ?? []), ...(additionalSearchFilter.or ?? [])]
    } else {
      gqlFilters[newFilterKey] = additionalSearchFilter[newFilterKey]
    }
  }

  // GraphQL query -- get ALL fields (passing JWT), with pagination
  const { fetchedRecords, totalCount, error } = await queryDataTable(
    tableName,
    fieldNames,
    gqlFilters,
    first,
    offset,
    orderBy ?? defaultSortColumn ?? 'id',
    ascending
  )
  if (error) return error

  const response = await constructTableResponse(
    tableName,
    title,
    code,
    columnDefinitionMasterList,
    fetchedRecords,
    totalCount,
    searchFields,
    filterDefinitions,
    defaultFilterString
  )

  if (returnRawData) return reply.send(response.tableRows.map(({ id, item }) => ({ id, ...item })))

  return reply.send(response)
}

const routeDataViewDetail = async (request: any, reply: any) => {
  const dataViewCode = camelCase(request.params.dataViewCode)
  const recordId = Number(request.params.id)
  const { userId, orgId, permissionNames } = await getPermissionNamesFromJWT(request)
  if (request.auth.isAdmin) permissionNames.push(LOOKUP_TABLE_PERMISSION_NAME)

  const returnRawData = request.query?.raw === 'true' ?? false

  const {
    tableName,
    columnDefinitionMasterList,
    title,
    fieldNames,
    gqlFilters,
    headerDefinition,
    showLinkedApplications,
  } = await buildAllColumnDefinitions({
    permissionNames,
    dataViewCode,
    type: returnRawData ? 'RAW' : 'DETAIL',
    userId,
    orgId,
  })

  // GraphQL query -- get ALL fields (passing JWT), with pagination
  const fetchedRecord = await queryDataTableSingleItem(tableName, fieldNames, gqlFilters, recordId)

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

  if (returnRawData) return reply.send(response.item)

  return reply.send(response)
}

const routeDataViewFilterList = async (request: any, reply: any) => {
  const dataViewCode = camelCase(request.params.dataViewCode)
  const columnName = request.params.column
  const {
    searchFields = [columnName],
    searchText = '',
    delimiter,
    includeNull,
    filterList: filterListParameter,
  } = request.body ?? {}
  const { userId, orgId, permissionNames } = await getPermissionNamesFromJWT(request)
  if (request.auth.isAdmin) permissionNames.push(LOOKUP_TABLE_PERMISSION_NAME)

  const dataViews = (await DBConnect.getAllowedDataViews(permissionNames, dataViewCode))
    .map((dataView) => objectKeysToCamelCase(dataView))
    .sort((a, b) => b.priority - a.priority) as DataView[]

  if (dataViews.length === 0) throw new Error(`No matching data views: "${dataViewCode}"`)

  const dataView = dataViews[0]

  // Check for manually defined filter list in parameters
  if (filterListParameter)
    return reply.send({ list: filterListParameter, moreResultsAvailable: false })

  // TO-DO: Create search filters for types other than string (number, bool, array)
  const searchFilter =
    searchText === ''
      ? {}
      : {
          or: searchFields.map((col: string) => ({
            [col]: {
              includesInsensitive: searchText,
            },
          })),
        }

  const gqlFilters = { ...getFilters(dataView, userId, orgId), ...searchFilter }

  const filterList = new Set()

  const { filterListMaxLength = 10, filterListBatchSize = 1000 } = config

  let fetchedCount = 0
  let offset = 0
  let moreResultsAvailable = true

  while (filterList.size < filterListMaxLength) {
    const { fetchedRecords, totalCount, error } = await queryFilterList(
      camelCase(getValidTableName(dataView.tableName)),
      searchFields,
      gqlFilters,
      filterListBatchSize,
      offset
    )

    if (error) return reply.send(error)

    fetchedCount += fetchedRecords.length

    fetchedRecords.forEach((record: { [key: string]: unknown }) => {
      // For some reason, if a single field value is `null`, Postgraphile
      // returns null instead of an object with a null value on one field, like
      // the rest of the results
      if (record === null) {
        filterList.add(null)
        return
      }
      const values = Object.values(record)
      values.forEach((value) => {
        if (delimiter && typeof value === 'string') {
          const splitString = value.split(delimiter).map((e) => e.trim())
          splitString.forEach((substring) => {
            // Once split, we need to exclude substrings that don't match the
            // search text
            if (new RegExp(searchText, 'i').test(substring)) filterList.add(substring)
          })
        } else filterList.add(value)
      })
    })

    if (fetchedCount >= totalCount) {
      moreResultsAvailable = false
      break
    }

    offset += fetchedRecords.length
  }

  let results = [...filterList].sort()

  // If searching multiple fields, then we'll also get back the *other* values
  // in the record matching the search text. We need to filter those out:
  if (searchFields.length > 1)
    results = results.filter(
      (value) =>
        (typeof value === 'string' &&
          new RegExp(searchText.toLowerCase()).test(value.toLowerCase())) ||
        value === null
    )

  if (results.length > filterListMaxLength) moreResultsAvailable = true

  const list = results.slice(0, filterListMaxLength)

  if (includeNull) list.push(null)

  return reply.send({ list, moreResultsAvailable })
}

export { routeDataViews, routeDataViewTable, routeDataViewDetail, routeDataViewFilterList }
