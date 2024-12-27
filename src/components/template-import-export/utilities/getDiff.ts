/**
 * Compares two sets of linked template entities and returns the difference. Use
 * when importing a template to compare the imported entities against matching
 * ones already in the database. The diff is returned to the user so they can
 * choose which version to preserve.
 */

import { isEqual } from 'lodash'
import { CombinedLinkedEntities, LinkedEntities, LinkedEntity } from '../types'

export const getDiff = (
  templateData: CombinedLinkedEntities,
  comparisonData: CombinedLinkedEntities
) => {
  const { filters, permissions, dataViews, dataViewColumns, category, dataTables, files } =
    templateData

  const {
    filters: filterCompare,
    permissions: permissionCompare,
    dataViews: dataViewCompare,
    dataViewColumns: dataViewColumnCompare,
    category: categoryCompare,
    dataTables: dataTablesCompare,
    files: filesCompare,
  } = comparisonData

  return {
    filters: compare(filters, filterCompare),
    permissions: compare(permissions, permissionCompare),
    dataViews: compare(dataViews, dataViewCompare),
    dataViewColumns: compare(dataViewColumns, dataViewColumnCompare),
    category:
      category && categoryCompare ? compare({ category }, { category: categoryCompare }) : {},
    dataTables: compare(dataTables, dataTablesCompare),
    files: compare(files, filesCompare),
  }
}

const compare = (templateEntities: LinkedEntities = {}, compareEntities: LinkedEntities = {}) => {
  const diff: Record<string, { template: LinkedEntity | null; other: LinkedEntity | null }> = {}

  Object.entries(templateEntities).forEach(([key, { checksum, lastModified, data }]) => {
    if (!compareEntities[key]) {
      diff[key] = { template: { checksum, lastModified, data }, other: null }
      return
    }
    if (checksum !== compareEntities[key].checksum) {
      const {
        checksum: checksumOther,
        lastModified: lastModifiedOther,
        data: dataOther,
      } = compareEntities[key]
      const [dataModified, dataOtherModified] = filterModifiedData(data, dataOther)
      diff[key] = {
        template: { checksum, lastModified, data: dataModified },
        other: {
          checksum: checksumOther,
          lastModified: lastModifiedOther,
          data: dataOtherModified,
        },
      }
    }
  })

  // Check the compare values for any that are missing in the original
  Object.entries(compareEntities).forEach(([key, { checksum, lastModified, data }]) => {
    if (!templateEntities[key]) {
      diff[key] = { template: null, other: { checksum, lastModified, data } }
      return
    }
  })

  return diff
}

export const filterModifiedData = (
  data1: Record<string, unknown>,
  data2: Record<string, unknown>
) => {
  const returnData1: Record<string, unknown> = {}
  const returnData2: Record<string, unknown> = {}

  // Assume both objects have the same keys
  Object.keys(data1).forEach((key) => {
    if (!isEqual(data1[key], data2[key])) {
      returnData1[key] = data1[key]
      returnData2[key] = data2[key]
    }
  })

  return [returnData1, returnData2]
}
