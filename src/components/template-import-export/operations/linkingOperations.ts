/**
 * Provides linked data view and linked file data to the respective routes
 */

import path from 'path'
import db from '../databaseMethods'
import { filterObject } from '../../utilityFunctions'
import { DataView } from '../../../generated/graphql'
import { PgFile } from '../types'

const returnColumns = [
  'id',
  'table_name',
  'title',
  'code',
  // 'permission_names',
  'priority',
  'identifier',
] as const

type PgDataViewField = (typeof returnColumns)[number]

/**
 * Provides a list of data views connected to a template. Contains metadata
 * about the dataview itself, as well as how it's used in the template:
 * - applicantAccessible (applicant has permission to access data view, so safe
 *   to use in template elements)
 * - inTemplateElements,
 * - inOutputTables
 */

export const getDataViewDetails = async (templateId: number) => {
  const allDataViews = await db.getAllDataViews()

  const permissions = await db.getApplyPermissionsForTemplate(templateId)
  const applicantAccessibleDataViews = await db.getAllAccessibleDataViews(permissions)
  const accessibleIdentifiers = applicantAccessibleDataViews.map(({ identifier }) => identifier)

  const distinctCodes = new Set(applicantAccessibleDataViews.map((dv) => dv.code))
  const dataViewCodesUsed: string[] = []
  for (const code of distinctCodes) {
    const elementCount = await db.getTemplateElementCountUsingDataView(templateId, code)
    if (elementCount > 0) dataViewCodesUsed.push(code)
  }

  const dataTablesReferencedInModifyRecord = await db.getDataTablesFromModifyRecord(templateId)
  const dataViewsInOutcomeTables = await db.getDataViewsUsingTables(
    dataTablesReferencedInModifyRecord
  )

  const fullData = allDataViews.map((data) => {
    const applicantAccessible = accessibleIdentifiers.includes(data.identifier)
    const { table_name, ...rest } = filterObject(data, (key) =>
      returnColumns.includes(key as PgDataViewField)
    )
    return {
      data: { tableName: table_name, ...rest } as DataView,
      applicantAccessible,
      inTemplateElements: applicantAccessible && dataViewCodesUsed.includes(data.code),
      inOutputTables: dataViewsInOutcomeTables.some((dv) => dv.id === data.id),
    }
  })
  return fullData
}

export const getSuggestedDataViews = async (templateId: number) =>
  (await getDataViewDetails(templateId))
    .filter((dv) => dv.inTemplateElements || dv.inOutputTables)
    .map(({ data }) => data)

interface LinkedFile {
  unique_id: string
  id?: number
  joinId?: number
  original_filename?: string
  subfolder?: string
  description?: string | null
  timestamp?: Date
  file_size?: number | null
  linkedInDatabase: boolean
  usedInAction: boolean
  missingFromDatabase?: boolean
}

/**
 * Provides a list of files connected to a template. Contains standard file
 * metadata, as well as:
 * - linkedInDatabase (is the file linked via the file join table, as opposed to
 *   used in an action but not yet linked)
 * - usedInAction (file is in use in one of the generateDocument actions)
 * - missingFromDatabase (file is not present in the database, but is referenced
 *   in an action)
 */

export const getLinkedFiles = async (templateId: number) => {
  const files: LinkedFile[] = (
    await db.getJoinedEntities<PgFile>({
      templateId,
      table: 'file',
      joinTable: 'template_file_join',
    })
  ).map(({ id, unique_id, original_filename, description, timestamp, file_size, file_path }) => {
    return {
      id,
      unique_id,
      original_filename,
      description,
      timestamp,
      file_size,
      subfolder: path.dirname(file_path),
      linkedInDatabase: true,
      usedInAction: false,
    }
  })

  for (const file of files) {
    file.joinId = await db.getFileJoinId(templateId, file?.id ?? 0)
  }

  const fileUidsUsedInActions = await db.getFilesFromDocAction(templateId)
  for (const fileId of fileUidsUsedInActions) {
    const file = await db.getRecord<PgFile>('file', fileId, 'unique_id')
    if (!file) {
      files.push({
        unique_id: fileId,
        linkedInDatabase: false,
        usedInAction: true,
        missingFromDatabase: true,
      })
      continue
    }

    const existing = files.find((f) => f.unique_id === fileId)
    if (existing) existing.usedInAction = true
    else {
      const { id, unique_id, original_filename, description, timestamp, file_size, file_path } =
        file
      files.push({
        id,
        unique_id,
        original_filename,
        description,
        timestamp,
        file_size,
        subfolder: path.dirname(file_path),
        linkedInDatabase: false,
        usedInAction: true,
      })
    }
  }

  return files
}
