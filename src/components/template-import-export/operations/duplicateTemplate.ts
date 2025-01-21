import { ApiError } from '../../../ApiError'
import db from '../databaseMethods'
import { buildTemplateStructure } from '../utilities'
import { installTemplate } from './importTemplate'
import { PgTemplate } from '../types'
import { TemplateStatus } from '../../../generated/graphql'

export const duplicateTemplate = async (templateId: number, newCode?: string) => {
  console.log(`Duplicating template: ${templateId}...`)
  const template = await db.getRecord<PgTemplate>('template', templateId)

  if (!template) throw new ApiError(`Template ${templateId} does not exist`, 400)

  if (template.version_id.startsWith('*') && !newCode)
    throw new ApiError(`Current template version must be committed before duplicating`, 400)

  console.log('Building structure...')
  const templateStructure = await buildTemplateStructure(template)

  if (!newCode) {
    // Making a new version
    ;(templateStructure.version_history as Record<string, unknown>[]).push({
      timestamp: templateStructure.version_timestamp,
      versionId: templateStructure.version_id,
      parentVersionId: templateStructure.parent_version_id,
      comment: templateStructure.version_comment,
    })
    templateStructure.parent_version_id = templateStructure.version_id
    templateStructure.version_id = await db.getNextDraftVersionId(templateStructure.code)
  } else {
    // New template type
    const nextWouldBe = await db.getNextDraftVersionId(newCode)
    if (nextWouldBe !== '*') throw new ApiError(`Template with code ${newCode} already exists`, 400)
    templateStructure.code = newCode
    templateStructure.version_history = []
    templateStructure.name = `NEW template based from: ${template.name}`
    templateStructure.name_plural = null
    templateStructure.version_id = '*'
    templateStructure.parent_version_id = null
  }

  templateStructure.version_comment = null
  templateStructure.version_timestamp = new Date()
  templateStructure.status = TemplateStatus.Draft

  const newTemplateId = await installTemplate(templateStructure)

  return newTemplateId
}
