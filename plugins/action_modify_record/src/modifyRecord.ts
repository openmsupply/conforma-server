import { ActionQueueStatus } from '../../../src/generated/graphql'
import { ActionPluginType } from '../../types'
import databaseMethods, { DatabaseMethodsType } from './databaseMethods'
import { DBConnectType } from '../../../src/components/databaseConnect'
import { mapValues, get } from 'lodash'

const modifyRecord: ActionPluginType = async ({ parameters, applicationData, DBConnect }) => {
  const db = databaseMethods(DBConnect)
  const {
    tableName,
    matchField,
    matchValue,
    shouldCreateJoinTable = true,
    data,
    ...record
  } = parameters

  const fieldToMatch = matchField ?? 'id'
  const valueToMatch = matchValue ?? record[fieldToMatch]
  const applicationId = applicationData?.applicationId || 0

  // Don't update fields with NULL
  for (const key in record) {
    if (record[key] === null) delete record[key]
  }

  // Build full record
  const fullRecord = {
    ...record,
    ...mapValues(data, (property) => get(applicationData, property, null)),
  }

  try {
    await createOrUpdateTable(DBConnect, db, tableName, fullRecord)

    let recordId = await db.getRecordId(tableName, fieldToMatch, valueToMatch)
    const isUpdate = recordId !== 0

    let result: any = {}
    if (isUpdate) {
      // UPDATE
      console.log(`Updating ${tableName} record: ${JSON.stringify(fullRecord, null, 2)}`)
      result = await db.updateRecord(tableName, recordId, fullRecord)
    } else {
      // CREATE NEW
      console.log(`Creating ${tableName} record: ${JSON.stringify(fullRecord, null, 2)}`)
      result = await db.createRecord(tableName, fullRecord)
      recordId = result.recordId
    }

    if (shouldCreateJoinTable) await db.createJoinTableAndRecord(tableName, applicationId, recordId)

    if (!result.success) throw new Error('Problem creating or updating record')

    console.log(`${isUpdate ? 'Updated' : 'Created'} ${tableName} record, ID: `, recordId)
    return {
      status: ActionQueueStatus.Success,
      error_log: '',
      output: { [tableName]: result[tableName] },
    }
  } catch (error) {
    console.log(error.message)
    return {
      status: ActionQueueStatus.Fail,
      error_log: error.message,
    }
  }
}

const createOrUpdateTable = async (
  DBConnect: DBConnectType,
  db: DatabaseMethodsType,
  tableName: string,
  record: { [key: string]: object | string }
) => {
  const tableAndFields = await DBConnect.getDatabaseInfo(tableName)

  if (tableAndFields.length === 0) await db.createTable(tableName)

  const fieldsToCreate = Object.entries(record)
    .filter(([fieldName]) => !tableAndFields.find(({ column_name }) => column_name === fieldName))
    .map(([fieldName, value]) => ({ fieldName, fieldType: getPostgresType(value) }))

  if (fieldsToCreate.length > 0) await db.createFields(tableName, fieldsToCreate)
}

export default modifyRecord

const getPostgresType = (value: any): string => {
  if (value instanceof Date) return 'timestamptz'
  if (Array.isArray(value)) {
    const elementType = value.length > 0 ? getPostgresType(value[0]) : 'varchar'
    return `${elementType}[]`
  }
  if (isDateString(value)) return 'date'
  if (isTimeString(value)) return 'time with timezone'
  if (isDateTimeString(value)) return 'timestamptz'
  if (value instanceof Object) return 'jsonb'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'double precision'
  return 'varchar'
}

const isDateString = (value: any) => {
  // This is the date format (ISO Date) stored in DatePicker responses
  if (typeof value !== 'string') return false
  const datePattern = /^\d{4}-(0\d|1[0-2])-([0-2]\d|3[0-1])$/
  return datePattern.test(value)
}

// We don't yet have plugins that store time or dateTime responses, so these
// won't really be used yet. Added for completeness.

const isTimeString = (value: any) => {
  if (typeof value !== 'string') return false
  const timePattern =
    /^(0\d|1\d|2\d):([0-5]\d):([0-5]\d)(\.\d{1,6})?([\+,-](0\d|1\d|2\d)(:([0-5]\d))?)?$/
  return timePattern.test(value)
}

const isDateTimeString = (value: any) => {
  if (typeof value !== 'string') return false
  const dateTimePattern =
    /^\d{4}-(0\d|1[0-2])-([0-2]\d|3[0-1]) (0\d|1\d|2\d):([0-5]\d):([0-5]\d)(\.\d{1,6})?([\+,-](0\d|1\d|2\d)(:([0-5]\d))?)?$/
  return dateTimePattern.test(value)
}
