import path from 'path'
import fsx from 'fs-extra'
import semverCompare from 'semver/functions/compare'
import { ApiError } from '../../../ApiError'
import db from '../databaseMethods'
import { filterModifiedData, getTemplateLinkedEntities } from '../utilities'
import { FILES_FOLDER, FILES_TEMP_FOLDER } from '../../../constants'
import config from '../../../config'
import {
  CombinedLinkedEntities,
  LinkedEntities,
  LinkedEntity,
  PgDataTable,
  PgDataView,
  PgDataViewColumn,
  PgFile,
  PgFilter,
  PgPermissionName,
  PgTemplateCategory,
  TemplateStructure,
} from '../types'
import { hashFile, replaceForeignKeyRef } from '../utilities'

interface InfoFile {
  timestamp: string
  version: string
}

export type PreserveExistingEntities = {
  filters?: Set<string>
  permissions?: Set<string>
  dataViews?: Set<string>
  dataViewColumns?: Set<string>
  dataTables?: Set<string>
  category?: string
  files?: Set<string>
}

export const entityDataMap = {
  filters: { table: 'filter', keyField: 'code' },
  permissions: { table: 'permission_name', keyField: 'name' },
  dataViews: { table: 'data_view', keyField: 'identifier' },
  dataViewColumns: {
    table: 'data_view_column_definition',
    keyField: ['table_name', 'column_name'],
  },
  category: { table: 'template_category', keyField: 'code' },
  dataTables: { table: 'data_table', keyField: 'table_name' },
  files: { table: 'file', keyField: 'unique_id' },
}

export const importTemplateUpload = async (folderName: string) => {
  console.log(`Analysing uploaded template...`)

  const fullTemplateFolderPath = path.join(FILES_TEMP_FOLDER, folderName)

  let info: InfoFile
  let template: TemplateStructure

  try {
    info = await fsx.readJSON(path.join(fullTemplateFolderPath, 'info.json'))
  } catch (_) {
    throw new ApiError('info.json file missing from upload', 400)
  }

  // if (semverCompare('1.4.0', info.version) === 1) {
  //   throw new ApiError(
  //     `Template was exported with Conforma version: ${info.version}\n. From Conforma v1.5.0 we use a new template import/export mechanism and can no longer import templates in the old format. Please use the v1.4.0 Docker image where you can import this version and export a version in the new format.`,
  //     400
  //   )
  // }

  if (semverCompare(info.version, config.version) === 1) {
    throw new ApiError(
      `Template was exported with Conforma version: ${info.version}\n You can't install a template created with a version newer than the current application version: ${config.version}`,
      400
    )
  }

  try {
    template = await fsx.readJSON(path.join(fullTemplateFolderPath, 'template.json'))
  } catch (_) {
    throw new ApiError('template.json file missing from upload', 400)
  }

  const existingVersion = await db.getRecord(
    'template',
    [template.code, template.version_id],
    ['code', 'version_id']
  )

  if (existingVersion)
    throw new ApiError(
      `Template code ${template.code} with versionID ${template.version_id} already installed`,
      400
    )

  const { filters, permissions, dataViews, dataViewColumns, category, dataTables, files } =
    template.shared

  const changedFilters = await getModifiedEntities(filters, 'filter', 'code')
  const changedPermissions = await getModifiedEntities(permissions, 'permission_name', 'name')
  const changedDataViews = await getModifiedEntities(dataViews, 'data_view', 'identifier')
  const changedDataViewColumns = await getModifiedEntities(
    dataViewColumns,
    'data_view_column_definition',
    ['table_name', 'column_name']
  )
  const changedFiles = await getModifiedEntities(files, 'file', 'unique_id')

  const categoryCode = category ? (category.data as PgTemplateCategory).code : ''
  const changedCategory = category
    ? await getModifiedEntities({ [categoryCode]: category }, 'template_category', 'code')
    : {}

  const changedDataTables: Record<string, unknown> = {}
  for (const dataTable of Object.keys(dataTables)) {
    const existing = await db.getRecord<PgDataTable>('data_table', dataTable, 'table_name')
    if (existing.checksum !== dataTables[dataTable].checksum) {
      const { lastModified, checksum } = dataTables[dataTable]
      const { last_modified, checksum: existingChecksum } = existing
      changedDataTables[dataTable] = {
        incoming: { lastModified, checksum },
        current: { lastModified: last_modified, checksum: existingChecksum },
      }
    }
  }

  return {
    filters: changedFilters,
    permissions: changedPermissions,
    dataViews: changedDataViews,
    dataViewColumns: changedDataViewColumns,
    category: changedCategory,
    dataTables: changedDataTables,
    files: changedFiles,
  }
}

export const getSingleEntityDiff = async (
  uid: string,
  type: keyof CombinedLinkedEntities,
  value: string
) => {
  const sourceFolder = path.join(FILES_TEMP_FOLDER, uid)
  if (!(await fsx.exists(sourceFolder)))
    throw new ApiError(`There is no uploaded template with UID ${uid}`, 400)

  const template: TemplateStructure = await fsx.readJSON(path.join(sourceFolder, 'template.json'))

  const group = template?.shared?.[type]
  if (!group) throw new ApiError(`Invalid entity type`, 400)

  if (!(value in group) && type !== 'category') throw new ApiError(`Invalid entity id/code`, 400)

  const templateData: any =
    type === 'category' ? group : (group as Record<string, unknown>)?.[value]

  const { table, keyField } = entityDataMap[type]

  const values = Array.isArray(keyField) ? value.split('__') : value
  const existing = await db.getRecord<ExistingRecord>(table, values, keyField)

  if (!existing) throw new ApiError('No matching entity in the system', 400)

  if (table === 'permission_name')
    await replaceForeignKeyRef(
      existing,
      'permission_policy',
      'permission_policy_id',
      'permission_policy'
    )

  const { checksum, last_modified, id, ...existingData } = existing

  if (table === 'file') {
    ;['user_id', 'application_response_id', 'application_note_id', 'application_serial'].forEach(
      (column) => {
        delete existingData[column]
      }
    )
  }

  return { incoming: matchPropertyOrder(templateData.data, existingData), current: existingData }
}

export const importTemplateInstall = async (
  uid: string,
  installDetails: PreserveExistingEntities
) => {
  const sourceFolder = path.join(FILES_TEMP_FOLDER, uid)
  if (!(await fsx.exists(sourceFolder)))
    throw new ApiError(`There is no uploaded template with UID ${uid}`, 400)

  const template: TemplateStructure = await fsx.readJSON(path.join(sourceFolder, 'template.json'))

  const existingVersion = await db.getRecord(
    'template',
    [template.code, template.version_id],
    ['code', 'version_id']
  )

  if (existingVersion)
    throw new ApiError(
      `Template code ${template.code} with versionID ${template.version_id} already installed`,
      400
    )

  // Process template, using installDetails
  try {
    const result = await installTemplate(template, installDetails, sourceFolder)
    fsx.remove(sourceFolder)
    return result
  } catch (err) {
    await db.cancelTransaction()
    throw err
  }
}

interface ExistingRecord extends Record<string, unknown> {
  last_modified: Date
  checksum: string
}

const getModifiedEntities = async (
  incomingEntities: LinkedEntities,
  sourceTable: string,
  keyField: string | string[]
) => {
  const changeEntities: Record<
    string,
    { incoming: LinkedEntity | null; current: LinkedEntity | null }
  > = ({} = {})

  for (const [key, { checksum, lastModified, data }] of Object.entries(incomingEntities)) {
    const values = Array.isArray(keyField) ? key.split('__') : key
    const existing = await db.getRecord<ExistingRecord>(sourceTable, values, keyField)
    if (!existing) continue

    if (sourceTable === 'permission_name')
      await replaceForeignKeyRef(
        existing,
        'permission_policy',
        'permission_policy_id',
        'permission_policy'
      )

    if (existing.checksum !== checksum) {
      const {
        checksum: existingChecksum,
        last_modified: existingLastModified,
        id,
        ...existingData
      } = existing
      if (existingLastModified === null || existingChecksum === null)
        throw new ApiError('Some existing entities have missing checksums/dates', 500)
      const [incomingDiff, existingDiff] = filterModifiedData(data, existingData)

      changeEntities[key] = {
        incoming: { checksum, lastModified, data: incomingDiff },
        current: {
          checksum,
          lastModified: existingLastModified,
          data: existingDiff,
          // id: id as number,
        },
      }
    }
  }
  return changeEntities
}

export const installTemplate = async (
  template: TemplateStructure,
  installDetails: PreserveExistingEntities = {},
  sourceFolder: string | null = null
) => {
  try {
    const {
      sections,
      actions,
      stages,
      permissionJoins,
      shared: {
        filters = {},
        permissions = {},
        category,
        dataViews = {},
        dataViewColumns = {},
        dataTables = {},
        files = {},
      },
      ...templateRecord
    } = template

    const {
      filters: preserveFilters,
      permissions: preservePermissions,
      dataViews: preserveDataViews,
      dataViewColumns: preserveDataViewColumns,
      dataTables: preserveDataTables,
      category: preserveCategory,
      files: preserveFiles,
    } = installDetails

    await db.beginTransaction()

    let categoryId: number | null = null

    if (category) {
      const { checksum, data } = category
      const existing = await db.getRecord<PgTemplateCategory>(
        'template_category',
        category.data.code,
        'code'
      )
      if (existing) {
        categoryId = existing.id
        if (!(preserveCategory === data.code))
          if (existing.checksum !== checksum)
            await db.updateRecord('template_category', { ...data, id: existing.id })
      } else {
        categoryId = (await db.insertRecord('template_category', category.data)).id
      }
    }

    const newTemplateId: number = await db.insertRecord('template', {
      ...templateRecord,
      template_category_id: categoryId,
    })

    for (const section of sections) {
      const { elements, ...sectionRecord } = section
      const newSectionId = await db.insertRecord('template_section', {
        ...sectionRecord,
        template_id: newTemplateId,
      })

      for (const element of elements) {
        await db.insertRecord('template_element', { ...element, section_id: newSectionId })
      }
    }

    for (const stage of stages) {
      const { review_levels, ...stageRecord } = stage
      const newStageId = await db.insertRecord('template_stage', {
        ...stageRecord,
        template_id: newTemplateId,
      })

      for (const level of review_levels) {
        await db.insertRecord('template_stage_review_level', { ...level, stage_id: newStageId })
      }
    }

    for (const action of actions) {
      await db.insertRecord('template_action', {
        ...action,
        template_id: newTemplateId,
      })
    }

    for (const filterCode of Object.keys(filters)) {
      const { checksum, data } = filters[filterCode]
      let filter_id: number | null = null

      const existing = await db.getRecord<PgFilter>('filter', filterCode, 'code')
      if (existing) {
        filter_id = existing?.id
        if (!preserveFilters?.has(filterCode))
          if (existing.checksum !== checksum)
            await db.updateRecord('filter', { ...data, id: filter_id })
      } else {
        filter_id = (await db.insertRecord('filter', data)).id
      }

      const filterJoinRecord = { filter_id, template_id: newTemplateId }
      await db.insertRecord('template_filter_join', filterJoinRecord)
    }

    const permissionNameIds: Record<string, number> = {}

    for (const permissionName of Object.keys(permissions)) {
      const {
        checksum,
        data: { permission_policy, ...permissionNameRecord },
      } = permissions[permissionName]
      let permission_name_id: number | null = null

      const existing = await db.getRecord<PgPermissionName>(
        'permission_name',
        permissionName,
        'name'
      )
      if (existing) {
        permission_name_id = existing.id
        if (!preservePermissions?.has(permissionName))
          if (existing.checksum !== checksum)
            await db.updateRecord('permission_name', {
              ...permissionNameRecord,
              id: permission_name_id,
            })
      } else {
        permission_name_id = (await db.insertRecord('permission_name', permissionNameRecord)).id
      }

      permissionNameIds[permissionName] = permission_name_id as number
    }

    for (const { permissionName, ...permissionsJoin } of permissionJoins) {
      await db.insertRecord('template_permission', {
        ...permissionsJoin,
        permission_name_id: permissionNameIds[permissionName],
        template_id: newTemplateId,
      })
    }

    for (const identifier of Object.keys(dataViews)) {
      const { checksum, data } = dataViews[identifier]
      let data_view_id: number | null = null

      const existing = await db.getRecord<PgDataView>('data_view', identifier, 'identifier')
      if (existing) {
        data_view_id = existing?.id
        if (!preserveDataViews?.has(identifier))
          if (existing.checksum !== checksum)
            await db.updateRecord('data_view', { ...data, id: data_view_id })
      } else {
        data_view_id = (await db.insertRecord('data_view', data)).id
      }

      const dataViewJoinRecord = { data_view_id, template_id: newTemplateId }
      await db.insertRecord('template_data_view_join', dataViewJoinRecord)
    }

    for (const compositeKey of Object.keys(dataViewColumns)) {
      const [tableName, columnName] = compositeKey.split('__')
      const { checksum, data } = dataViewColumns[compositeKey]

      const existing = await db.getRecord<PgDataViewColumn>(
        'data_view_column_definition',
        [tableName, columnName],
        ['table_name', 'column_name']
      )
      if (existing) {
        if (!preserveDataViewColumns?.has(compositeKey))
          if (existing.checksum !== checksum)
            await db.updateRecord('data_view_column_definition', {
              ...data,
              id: existing?.id,
            })
      } else await db.insertRecord('data_view_column_definition', data)
    }

    for (const tableName of Object.keys(dataTables)) {
      const { checksum, data } = dataTables[tableName]
      const existing = await db.getRecord<PgDataTable>('data_table', tableName, 'table_name')
      if (existing) {
        if (!preserveDataTables?.has(tableName))
          if (existing.checksum !== checksum)
            await db.updateRecord('data_table', {
              ...data,
              id: existing?.id,
            })
      } else {
        await db.insertRecord('data_table', data)
      }
    }

    for (const uniqueId of Object.keys(files)) {
      const { checksum, data } = files[uniqueId]
      let file_id: number | null = null

      const existing = await db.getRecord<PgDataView>('file', uniqueId, 'unique_id')
      if (existing) {
        file_id = existing?.id
        if (!preserveFiles?.has(uniqueId))
          if (existing.checksum !== checksum)
            await db.updateRecord('file', { ...data, id: file_id })
      } else {
        file_id = (await db.insertRecord('file', data)).id
      }

      const fileJoinRecord = { file_id, template_id: newTemplateId }
      await db.insertRecord('template_file_join', fileJoinRecord)
    }

    // When duplicating, we don't need to copy any files, so sourceFolder is not
    // provided
    if (sourceFolder) {
      const fileArray = Object.values(files).map(({ data }) => data)
      for (const file of fileArray) {
        const { unique_id, archive_path, file_path } = file
        const existing = await db.getRecord<PgFile>('file', unique_id, 'unique_id')
        if (!existing) {
          await db.insertRecord('file', file)
        } else {
          if (preserveFiles?.has(unique_id)) {
            continue
          }
          await db.updateRecord('file', file, 'unique_id')
        }
        const existingFilePath = path.join(FILES_FOLDER, archive_path ?? '', file_path)
        const incomingFileSourcePath = path.join(sourceFolder, 'files', file_path)
        if (!(await fsx.exists(existingFilePath))) {
          let destination: string
          if (
            archive_path &&
            (await fsx.exists(path.join(FILES_FOLDER, archive_path, file_path)))
          ) {
            destination = path.join(FILES_FOLDER, archive_path, file_path)
          } else {
            destination = path.join(FILES_FOLDER, file_path)
            await db.updateRecord('file', { unique_id, archive_path: null }, 'unique_id')
          }
          await fsx.copy(incomingFileSourcePath, destination)
        } else {
          const existingFileHash = await hashFile(existingFilePath)
          const newFileHash = await hashFile(incomingFileSourcePath)
          if (existingFileHash !== newFileHash)
            throw new ApiError(
              'This would replace an existing file with a different file. Files should never be changed once in the system.',
              500
            )
        }
      }
    }

    // Finally, update the linked_entity_data field for the new template record
    const linked_entity_data = await getTemplateLinkedEntities(newTemplateId)
    await db.updateRecord('template', { linked_entity_data, id: newTemplateId })

    await db.commitTransaction()

    return {
      newTemplateId,
      code: template.code,
      versionId: template.version_id,
      versionNo: ((template.version_history as string[]) ?? []).length + 1,
      status: template.status,
    }
  } catch (err) {
    await db.cancelTransaction()
    throw err
  }
}

// Returns a copy of the first object with the keys ordered to correspond with
// the second object
const matchPropertyOrder = (
  input: Record<string, unknown>,
  comparison: Record<string, unknown>
) => {
  const inputKeys = Object.keys(input)
  const comparisonKeys = Object.keys(comparison)

  const done = new Set<string>()

  const result: Record<string, unknown> = {}

  comparisonKeys.forEach((key) => {
    if (!inputKeys.includes(key)) return
    result[key] = input[key]
    done.add(key)
  })

  const remainingKeys = inputKeys.filter((key) => !done.has(key))

  remainingKeys.forEach((key) => (result[key] = input[key]))

  return result
}
