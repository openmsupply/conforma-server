import {
  Template as PgTemplate,
  TemplateSection as PgTemplateSection,
  TemplateElement as PgTemplateElement,
  TemplateStageReviewLevel as PgTemplateStageReviewLevel,
  TemplateStage as PgTemplateStage,
  TemplateAction as PgTemplateAction,
  File as PgFile,
  TemplateCategory as PgTemplateCategory,
  TemplatePermission as PgTemplatePermission,
  PermissionName as PgPermissionName,
  Filter as PgFilter,
  DataView as PgDataView,
  DataViewColumnDefinition as PgDataViewColumn,
  DataTable as PgDataTable,
} from '../../generated/postgres'

export interface LinkedEntity<T = unknown> {
  checksum: string
  lastModified: Date
  data: LinkedEntityData<T>
}

export type LinkedEntities<T = unknown> = Record<string, LinkedEntity<T>>

export interface CombinedLinkedEntities {
  filters: LinkedEntities<Omit<PgFilter, 'id'>>
  permissions: LinkedEntities<
    Omit<PgPermissionName, 'id' | 'permission_policy_id'> & { permission_policy: object }
  >
  dataViews: LinkedEntities<Omit<PgDataView, 'id'>>
  dataViewColumns: LinkedEntities<Omit<PgDataViewColumn, 'id'>>
  category: LinkedEntity<TemplateCategory> | null
  dataTables: LinkedEntities<Omit<PgDataTable, 'id'>>
  files: LinkedEntities<TemplateFile>
}

export type LinkedEntityInput = {
  checksum: string | null
  last_modified: Date | null
}

export type LinkedEntityNoId = Omit<LinkedEntityInput, 'id'>
export type LinkedEntityData<T> = Omit<LinkedEntityNoId, 'checksum' | 'last_modified'> & T

export type TemplateStructure = Omit<
  PgTemplate,
  'id' | 'template_category_id' | 'linked_entity_data'
> & {
  sections: TemplateSection[]
  stages: TemplateStage[]
  actions: TemplateAction[]
  permissionJoins: TemplatePermission[]
  shared: CombinedLinkedEntities
}

export type TemplateCategory = Omit<PgTemplateCategory, 'id'>

export type TemplateSection = Omit<PgTemplateSection, 'id' | 'template_id'> & {
  elements: TemplateElement[]
}

export type TemplateElement = Omit<
  PgTemplateElement,
  'id' | 'section_id' | 'template_code' | 'template_version'
>

export type TemplateStage = Omit<PgTemplateStage, 'id' | 'template_id'> & {
  review_levels: TemplateStageReviewLevel[]
}

export type TemplateStageReviewLevel = Omit<PgTemplateStageReviewLevel, 'id' | 'stage_id'>

export type TemplatePermission = Omit<
  PgTemplatePermission,
  'id' | 'template_id' | 'permission_name_id'
> & { permissionName: string }

export type TemplateAction = Omit<PgTemplateAction, 'id' | 'template_id'>

export type TemplateFile = Omit<
  PgFile,
  'id' | 'user_id' | 'application_serial' | 'application_response_id' | 'application_note_id'
>

// Re-export PG types so they're all in one place
export {
  PgTemplate,
  PgTemplateSection,
  PgTemplateElement,
  PgTemplateStageReviewLevel,
  PgTemplateStage,
  PgTemplateAction,
  PgFile,
  PgTemplateCategory,
  PgTemplatePermission,
  PgPermissionName,
  PgFilter,
  PgDataView,
  PgDataViewColumn,
  PgDataTable,
}
