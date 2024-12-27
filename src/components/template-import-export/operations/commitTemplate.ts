import { customAlphabet } from 'nanoid/non-secure'
import { ApiError } from '../../../ApiError'
import db from '../databaseMethods'
import { getTemplateLinkedEntities } from '../utilities'
import { PgTemplate } from '../types'

export const commitTemplate = async (templateId: number, comment: string | null) => {
  console.log(`Committing template: ${templateId}...`)
  console.log(`Comment: ${comment}`)
  const template = await db.getRecord<PgTemplate>('template', templateId)

  if (!template) {
    throw new ApiError(`Template ${templateId} does not exist`, 400)
  }

  // Check already committed?
  if (!template.version_id.startsWith('*')) {
    throw new ApiError(`Template ${templateId} has already been committed`, 400)
  }

  // Fetch entity data
  const linkedEntities = await getTemplateLinkedEntities(templateId)

  const versionId = getTemplateVersionId()

  await db.commitTemplate(templateId, versionId, comment, linkedEntities)

  console.log(`Template ${templateId} committed`)
  return { versionId }
}

// Use nanoid to generate unique template version IDs
const getTemplateVersionId = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6)
