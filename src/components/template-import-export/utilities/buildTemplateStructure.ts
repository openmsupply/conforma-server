/**
 * Pulls all template data, including "linked" items (e.g. data views, files,
 * etc) from database and builds them into a single tree structure that is not
 * dependent at all on database IDs.
 *
 * This is the structure that gets exported to file as JSON when exporting a
 * template.
 */

import db from '../databaseMethods'
import { getTemplateLinkedEntities } from './getTemplateLinkedEntities'
import {
  CombinedLinkedEntities,
  PgPermissionName,
  PgTemplate,
  PgTemplateAction,
  PgTemplateElement,
  PgTemplatePermission,
  PgTemplateSection,
  PgTemplateStage,
  PgTemplateStageReviewLevel,
  TemplateSection,
  TemplateStage,
  TemplateStructure,
} from '../types'

export const buildTemplateStructure = async (template: PgTemplate) => {
  const { id: templateId, linked_entity_data, template_category_id, ...structure } = template

  const templateStructure: TemplateStructure = {
    ...structure,
    sections: [],
    stages: [],
    actions: [],
    permissionJoins: [],
    shared:
      linked_entity_data === null
        ? await getTemplateLinkedEntities(templateId)
        : { ...(linked_entity_data as CombinedLinkedEntities) },
  }

  // Template Sections
  const templateSections = await db.getRecordsByField<PgTemplateSection>(
    'template_section',
    'template_id',
    templateId
  )

  // - Template Elements
  for (const { id: sectionId, template_id, ...sec } of templateSections) {
    const section: TemplateSection = { ...sec, elements: [] }
    const templateElements = await db.getRecordsByField<PgTemplateElement>(
      'template_element',
      'section_id',
      sectionId
    )
    templateElements.forEach(({ id, section_id, template_code, template_version, ...element }) => {
      section.elements.push(element)
    })

    templateStructure.sections.push(section)
  }

  // Template Stages
  const templateStages = await db.getRecordsByField<PgTemplateStage>(
    'template_stage',
    'template_id',
    templateId
  )

  // - Template Stage Review Levels
  for (const { id: stageId, template_id, ...stg } of templateStages) {
    const stage: TemplateStage = { ...stg, review_levels: [] }
    const reviewLevels = await db.getRecordsByField<PgTemplateStageReviewLevel>(
      'template_stage_review_level',
      'stage_id',
      stageId
    )
    reviewLevels.forEach(({ id, stage_id, ...level }) => {
      stage.review_levels.push(level)
    })

    templateStructure.stages.push(stage)
  }

  // Template Actions
  const templateActions = await db.getRecordsByField<PgTemplateAction>(
    'template_action',
    'template_id',
    templateId
  )
  for (const { id, template_id, ...action } of templateActions) {
    templateStructure.actions.push(action)
  }

  // TemplatePermissions
  const templatePermissions = await db.getRecordsByField<PgTemplatePermission>(
    'template_permission',
    'template_id',
    templateId
  )
  for (const { id, template_id, permission_name_id, ...permission } of templatePermissions) {
    const permissionName = await db
      // TO-DO Remove "as" after making field non-nullable
      .getRecord<PgPermissionName>('permission_name', permission_name_id as number)
    templateStructure.permissionJoins.push({
      ...permission,
      permissionName: permissionName.name as string,
    })
  }

  return templateStructure
}
