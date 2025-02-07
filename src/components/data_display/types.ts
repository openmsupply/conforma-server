import { DataViewColumnDefinition } from '../../generated/graphql'

// Response value of /data-views endpoint
export type DataViewDetail = {
  tableName: string
  title: string
  code: string
  urlSlug: string
  submenu: string | null
  defaultFilter: string | null
}

interface FormatOptions {
  elementTypePluginCode: string
  elementParameters: object
  markdown?: boolean
  dateFormat?: string
  // Add more as required
}

export interface DisplayDefinition {
  title: string
  isBasicField: boolean
  dataType?: string
  formatting: FormatOptions
  hideIfNull?: boolean
}
interface HeaderRow extends DisplayDefinition {
  columnName: string
}

interface TableRow {
  id: number
  rowValues: any[]
  item: { [key: string]: any }
}

// Response object of /data-views/table endpoint
export interface DataViewsTableResponse {
  tableName: string
  title: string
  code: string
  headerRow: HeaderRow[]
  tableRows: TableRow[]
  searchFields: string[]
  filterDefinitions: FilterDefinition[]
  defaultFilterString: string | null
  totalCount: number
  message?: string
}

export type ColumnDisplayDefinitions = {
  [key: string]: DataViewColumnDefinition
}

export interface ColumnDefinition {
  columnName: string
  isBasicField: boolean
  dataType?: string
  sortColumn?: string
  columnDefinition: DataViewColumnDefinition | undefined
}
export type ColumnDefinitionMasterList = ColumnDefinition[]

export interface ColumnDetailOutput {
  tableName: string
  title: string
  code: string
  columnDefinitionMasterList: ColumnDefinitionMasterList
  gqlFilters: GraphQLFilter
  fieldNames: string[]
  searchFields: string[]
  filterDefinitions: FilterDefinition[]
  headerDefinition: ColumnDefinition | undefined
  defaultSortColumn: string | null
  defaultFilterString: string | null
  showLinkedApplications: boolean
}

export interface FilterDefinition {
  column: string
  title: string
  dataType: string
  showFilterList: boolean
  searchFields: string[]
  delimiter?: string
  valueMap?: { [key: string]: string }
}

export interface LinkedApplication {
  id: number
  name: string
  serial: string
  templateName: string
  templateCode: string
  dateCompleted: Date
}

export interface DetailsHeader {
  value: any
  columnName: string
  isBasicField: boolean
  dataType: string | undefined
  formatting: FormatOptions
}

// Response object of /data-views/table/.../item endpoint
export interface DataViewsDetailResponse {
  tableName: string
  tableTitle: string
  id: number
  header: DetailsHeader
  columns: string[]
  item: { [key: string]: any }
  displayDefinitions: { [key: string]: DisplayDefinition }
  linkedApplications?: LinkedApplication[] | GraphQLQueryError
}

export interface SingleItemDetailResponse {
  item: { [key: string]: any }
}

export interface GraphQLQueryError {
  error: true
  message: string
  detail: string
}

// The 'postgraphile-plugin-connection-filter' package doesn't include types.
// This is far from a complete definition of the Filter object, but covers our
// current use cases -- can be extended as required.
export type GraphQLFilter = Omit<Record<string, Filters>, 'or' | 'and'> & {
  or?: GraphQLFilter[]
  and?: GraphQLFilter[]
}

type Filters = { equalTo?: unknown; includesInsensitive?: string }
