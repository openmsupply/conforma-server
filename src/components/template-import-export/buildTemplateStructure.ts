import {
  Template as PgTemplate,
  TemplateSection as PgTemplateSection,
  TemplateElement as PgTemplateElement,
  TemplateStageReviewLevel as PgTemplateStageReviewLevel,
  TemplateStage as PgTemplateStage,
  TemplateAction as PgTemplateAction,
  File as PgFile,
} from '../../generated/postgres'
import { ApiError } from './ApiError'
import db from './databaseMethods'
import { getTemplateLinkedEntities } from './getTemplateLinkedEntities'
import { FullLinkedEntities, TemplateSection, TemplateStage, TemplateStructure } from './types'

export const buildTemplateStructure = async (template: PgTemplate) => {
  const { id: templateId, linked_entity_data, template_category_id, ...structure } = template

  const templateStructure: TemplateStructure = {
    ...structure,
    sections: [],
    stages: [],
    actions: [],
    files: [],
    shared:
      linked_entity_data === null
        ? await getTemplateLinkedEntities(templateId)
        : { ...(linked_entity_data as FullLinkedEntities) },
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

  // Files
  const files = await db.getRecordsByField<PgFile>('file', 'template_id', templateId)
  for (const { id, template_id, ...file } of files) {
    templateStructure.files.push(file)
  }

  return templateStructure
}
