type LookupTableBase = {
  tableName: string
  fieldMap: FieldMapType[]
}

interface LookupTableStructure extends LookupTableBase {
  displayName: string
  dataViewCode: string
}

interface LookupTableStructureFull extends LookupTableStructure {
  id: number
}

interface GqlQueryResult<T = any> {
  [tableName: string]: T
}

type FieldMapType = {
  label: string
  fieldname: string
  dataType: string
  gqlName: string
}

export {
  LookupTableBase,
  LookupTableStructure,
  LookupTableStructureFull,
  FieldMapType,
  GqlQueryResult,
}
