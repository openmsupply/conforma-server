import path from 'path'
import fsx from 'fs-extra'
import semverCompare from 'semver/functions/compare'
import {
  DataTable as PgDataTable,
  TemplateCategory as PgTemplateCategory,
  Template as PgTemplate,
  TemplateFilterJoin as PgTemplateFilterJoin,
  TemplatePermission as PgTemplatePermission,
  TemplateDataViewJoin as PgTemplateDataViewJoin,
  Filter as PgFilter,
  PermissionName as PgPermissionName,
  DataView as PgDataView,
  DataViewColumnDefinition as PgDataViewColumnDefinition,
} from '../../generated/postgres'
import { ApiError } from './ApiError'
import db from './databaseMethods'
import { filterModifiedData } from './getDiff'
import { FILES_FOLDER } from '../../constants'
import config from '../../config'
import { LinkedEntities, LinkedEntity, TemplateStructure } from './types'
import { replaceForeignKeyRef } from './updateHashes'

interface InfoFile {
  timestamp: string
  version: string
}

export type InstallDetails = {
  filters?: Record<string, number>
  permissions?: Record<string, number>
  dataViews?: Record<string, number>
  dataViewColumns?: Record<string, number>
  dataTables?: Record<string, number>
  category?: number
}

export const importTemplateUpload = async (folderName: string) => {
  console.log(`Analysing uploaded template...`)

  const fullTemplateFolderPath = path.join(FILES_FOLDER, folderName)

  let info: InfoFile
  let template: TemplateStructure

  try {
    info = await fsx.readJSON(path.join(fullTemplateFolderPath, 'info.json'))
  } catch (_) {
    throw new ApiError('info.json file missing from upload', 400)
  }

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

  const { filters, permissions, dataViews, dataViewColumns, category, dataTables } = template.shared

  const changedFilters = await getModifiedEntities(filters, 'filter', 'code')
  const changedPermissions = await getModifiedEntities(permissions, 'permission_name', 'name')
  const changedDataViews = await getModifiedEntities(dataViews, 'data_view', 'identifier')
  const changedDataViewColumns = await getModifiedEntities(
    dataViewColumns,
    'data_view_column_definition',
    ['table_name', 'column_name']
  )

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
  }
}

export const importTemplateInstall = async (uid: string, installDetails: InstallDetails) => {
  if (!(await fsx.exists(path.join(FILES_FOLDER, uid))))
    throw new ApiError(`There is no uploaded template with UID ${uid}`, 400)

  const template: TemplateStructure = await fsx.readJSON(
    path.join(FILES_FOLDER, uid, 'template.json')
  )

  const existingVersion = await db.getRecord(
    'template',
    [template.code, template.version_id],
    ['code', 'version_id']
  )

  if (existingVersion)
    throw new ApiError(
      `Template of code ${template.code} and versionID ${template.version_id} already installed`,
      400
    )

  // Process template, using installDetails
  try {
    const result = await installTemplate(template, installDetails)
    return result
  } catch (err) {
    await db.cancelTransaction()
    throw err
  }

  // Delete folder

  return template
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
    { incoming: LinkedEntity | null; current: (LinkedEntity & { id: number }) | null }
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
          id: id as number,
        },
      }
    }
  }
  return changeEntities
}

export const installTemplate = async (
  template: TemplateStructure,
  installDetails: InstallDetails = {}
) => {
  try {
    const {
      sections,
      actions,
      stages,
      permissionJoins,
      files,
      shared: { filters, permissions, category, dataViews, dataViewColumns, dataTables },
      ...templateRecord
    } = template

    const {
      filters: preserveFilters,
      permissions: preservePermissions,
      dataViews: preserveDataViews,
      dataViewColumns: preserveDataViewColumns,
      dataTables: preserveDataTables,
      category: preserveCategory,
    } = installDetails

    await db.beginTransaction()

    let categoryId: number | null = null
    if (category) {
      if (preserveCategory) categoryId = preserveCategory
      else {
        const existing = await db.getRecord<PgTemplateCategory>(
          'template_category',
          category.data.code,
          'code'
        )
        if (existing) {
          categoryId = existing?.id
          await db.updateRecord('template_category', { ...category.data, id: existing.id })
        } else categoryId = (await db.insertRecord('template_category', category.data)).id
      }
    }

    const newTemplateId = await db.insertRecord('template', {
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
      const filter = filters[filterCode].data
      let filter_id: number | null = null

      const existing = await db.getRecord<PgFilter>('filter', filterCode, 'code')
      if (existing) {
        filter_id = existing?.id
        if (!preserveFilters?.[filterCode])
          await db.updateRecord('filter', { ...filter, id: filter_id })
      } else {
        filter_id = (await db.insertRecord('filter', filter)).id
      }

      const filterJoinRecord = { filter_id, template_id: newTemplateId }
      await db.insertRecord('template_filter_join', filterJoinRecord)
    }

    const permissionNameIds: Record<string, number> = {}

    for (const permissionName of Object.keys(permissions)) {
      const { permission_policy, ...permissionNameRecord } = permissions[permissionName].data
      let permission_name_id: number | null = null

      const existing = await db.getRecord<PgPermissionName>(
        'permission_name',
        permissionName,
        'name'
      )
      if (existing) {
        permission_name_id = existing.id
        if (!preservePermissions?.[permissionName])
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
      const dataView = dataViews[identifier].data
      let data_view_id: number | null = null

      const existing = await db.getRecord<PgDataView>('data_view', identifier, 'identifier')
      if (existing) {
        data_view_id = existing?.id
        if (!preserveDataViews?.[identifier])
          await db.updateRecord('data_view', { ...dataView, id: data_view_id })
      } else {
        data_view_id = (await db.insertRecord('data_view', dataView)).id
      }

      const dataViewJoinRecord = { data_view_id, template_id: newTemplateId }
      await db.insertRecord('template_data_view_join', dataViewJoinRecord)
    }

    for (const compositeKey of Object.keys(dataViewColumns)) {
      const [tableName, columnName] = compositeKey.split('__')
      const dataViewColumn = dataViewColumns[compositeKey].data

      const existing = await db.getRecord<PgDataViewColumnDefinition>(
        'data_view_column_definition',
        [tableName, columnName],
        ['table_name', 'column_name']
      )
      if (existing) {
        if (!preserveDataViewColumns?.[compositeKey])
          await db.updateRecord('data_view_column_definition', {
            ...dataViewColumn,
            id: existing?.id,
          })
      } else await db.insertRecord('data_view_column_definition', dataViewColumn)
    }

    for (const tableName of Object.keys(dataTables)) {
      const dataTable = dataTables[tableName].data

      const existing = await db.getRecord<PgDataTable>('data_table', tableName, 'table_name')
      if (existing) {
        if (!preserveDataTables?.[tableName])
          await db.updateRecord('data_table', {
            ...dataTable,
            id: existing?.id,
          })
      } else {
        await db.insertRecord('data_table', dataTable)
      }
    }

    // COPY FILES

    // INSERT FILES

    await db.commitTransaction()

    return newTemplateId
  } catch (err) {
    await db.cancelTransaction()
    throw err
  }
}
