import { singular } from 'pluralize'
import { LookupTableModel } from '../models'
import { FieldMapType, LookupTableStructureFull } from '../types'
import { setDataTypes, toCamelCase, toSnakeCase } from '../utils'
import { LookupTableHeadersValidator, LookupTableNameValidator } from '../utils/validations'
import { ValidationErrors } from '../utils/validations/error'
import { ILookupTableNameValidator, IValidator } from '../utils/validations/types'
import { getHash, hashLookupTable } from '../../components/template-import-export'

type LookupTableServiceProps = {
  tableId?: number
  name?: string
  dataViewCode: string
}

const LookupTableService = async (props: LookupTableServiceProps) => {
  let name = ''
  let tableId = 0
  let fieldMaps: FieldMapType[] = []
  let rows: object[] = []
  let dbFieldMap: any = []
  let dataViewCode = props.dataViewCode
  let structure: LookupTableStructureFull
  let rowHashes: string[] = []

  // Initialisation
  const lookupTableModel = LookupTableModel()
  if (props.tableId) {
    tableId = props.tableId
    structure = await lookupTableModel.getStructureById(tableId)
  }
  if (props.name) {
    name = props.name
  }

  // Exported Methods
  const getAllRowsForTable = async () => await lookupTableModel.getAllRowsForTable(structure)

  let tableName = ''

  const createTable = async () => {
    tableName = toSnakeCase(singular(name))

    const lookupTableNameValidator: ILookupTableNameValidator = new LookupTableNameValidator({
      model: lookupTableModel,
      tableName,
    })

    await lookupTableNameValidator.validate()

    if (!lookupTableNameValidator.isValid)
      throw new ValidationErrors(lookupTableNameValidator.errors)

    try {
      const results = await compareFieldMaps()

      const idField = {
        label: 'id',
        fieldname: 'id',
        gqlName: 'id',
        dataType: 'serial PRIMARY KEY',
      }

      // Mutate field maps and rows *in-place* with the correct Postgres data
      // types
      setDataTypes(fieldMaps, rows)

      const newTableFieldMap = [
        idField,
        ...fieldMaps
          // Ignore if incoming CSV already has "id" field
          .filter((field) => field.label !== 'id'),
      ]

      await lookupTableModel.createTable({
        tableName,
        fieldMap: newTableFieldMap,
      })

      tableId = await lookupTableModel.createStructure({
        tableName,
        displayName: name,
        fieldMap: newTableFieldMap,
        dataViewCode,
      })

      await createUpdateRows()
      await createOrUpdateDataView()
      await hashLookupTable(tableId)

      return buildSuccessMessage(results)
    } catch (err) {
      throw err
    }
  }

  const addRow = (row: object): void => {
    rows.push(row)
  }

  const updateTable = async () => {
    tableName = structure.tableName
    tableId = structure.id
    dbFieldMap = structure.fieldMap

    try {
      const results = await compareFieldMaps()

      // Mutate field maps and rows *in-place* with the correct Postgres data
      // types
      setDataTypes(fieldMaps, rows)

      await createNewColumns()
      await createUpdateRows()
      await createOrUpdateDataView()
      await hashLookupTable(tableId)

      return buildSuccessMessage(results)
    } catch (err) {
      throw err
    }
  }

  const parseCsvHeaders = (headers: any) => {
    const lookupTableHeadersValidator: IValidator = new LookupTableHeadersValidator({
      headers,
      isImport: tableId === 0,
    })

    if (!lookupTableHeadersValidator.isValid) {
      throw new ValidationErrors(lookupTableHeadersValidator.errors)
    }

    return headers.map((header: string) => {
      const fieldName = toSnakeCase(header)
      const gqlName = toCamelCase(header)

      const fieldMap: FieldMapType = {
        label: header,
        fieldname: fieldName,
        gqlName,
        dataType: 'citext',
      }

      fieldMaps.push(fieldMap)

      return fieldMap.fieldname
    })
  }

  // Helpers

  const buildSuccessMessage = ({
    onlyInDb,
    onlyInCsv,
    inBoth,
    finalFieldMap,
  }: {
    onlyInDb: any
    onlyInCsv: FieldMapType[]
    inBoth: any
    finalFieldMap: FieldMapType[]
  }) => {
    const message: string[] = []
    if (inBoth.length)
      message.push(
        `Table rows' fields ${inBoth.map((fieldMap: any) => fieldMap.label).join(', ')} are updated`
      )

    if (onlyInCsv.length)
      message.push(
        `Table rows' fields ${onlyInCsv
          .map((fieldMap: any) => fieldMap.label)
          .join(', ')} are newly added`
      )

    if (onlyInDb.length)
      message.push(
        `Table rows' fields ${onlyInDb
          .map((fieldMap: any) => fieldMap.label)
          .join(', ')} are left unchanged`
      )

    if (finalFieldMap.length)
      message.push(
        `Final Table fields are ${finalFieldMap.map((fieldMap: any) => fieldMap.label).join(', ')}.`
      )

    return message
  }

  const createNewColumns = async () => {
    const fieldsToAdd = fieldMaps.filter(
      (obj: any) => dbFieldMap.filter((otherObj: any) => otherObj.label == obj.label).length === 0
    )

    await lookupTableModel.updateStructureFieldMaps(tableName, name, fieldMaps, dataViewCode)
    for (let fieldMap of fieldsToAdd) {
      await lookupTableModel.addTableColumns(tableName, fieldMap)
    }
  }

  const compareFieldMaps = () => {
    fieldMaps = [...dbFieldMap, ...fieldMaps].filter(
      (
        (set) => (obj: any) =>
          set.has(obj.label) ? false : set.add(obj.label)
      )(new Set())
    )

    return {
      onlyInDb: dbFieldMap.filter(comparer(fieldMaps)),
      onlyInCsv: fieldMaps.filter(comparer(dbFieldMap)),
      inBoth: dbFieldMap.filter((current: any) =>
        fieldMaps.filter((csvMap: any) => csvMap.label === current.label)
      ),
      finalFieldMap: fieldMaps,
    }
  }

  const createOrUpdateDataView = async () => {
    const existingDataViews = await lookupTableModel.getDataViews(
      tableName,
      structure?.dataViewCode ?? dataViewCode
    )

    if (existingDataViews.length > 0) {
      for (const dataView of existingDataViews) {
        await lookupTableModel.updateDataView(dataView.id, name, dataViewCode)
      }
    } else {
      await lookupTableModel.createDataView(name, tableName, dataViewCode)
    }
  }

  function comparer(otherArray: any[]) {
    return function (current: any) {
      return (
        otherArray.filter(function (other) {
          return other.label == current.label
        }).length == 0
      )
    }
  }

  const createUpdateRows = async () => {
    for (const row of rows) {
      rowHashes.push(getHash(row))
      await lookupTableModel.createOrUpdateRow(tableName, row)
    }
    await lookupTableModel.deleteRemovedRows(tableName, rows)
  }

  return {
    getAllRowsForTable,
    createTable,
    updateTable,
    parseCsvHeaders,
    addRow,
  }
}

export default LookupTableService
