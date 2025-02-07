import { ApiError } from '../../../ApiError'
import db from '../databaseMethods'
import { getDiff, buildLinkedEntityObject, getTemplateLinkedEntities } from '../utilities'
import { getSuggestedDataViews } from './linkingOperations'
import { CombinedLinkedEntities, PgDataView, PgTemplate } from '../types'

export const checkTemplate = async (templateId: number) => {
  console.log(`Checking template: ${templateId}...`)
  const template = await db.getRecord<PgTemplate>('template', templateId)

  if (!template) throw new ApiError(`Template ${templateId} does not exist`, 400)

  const committed = !template.version_id.startsWith('*')

  const suggestedDataViews = await getSuggestedDataViews(templateId)

  const linkedEntities = (
    committed
      ? await getTemplateLinkedEntities(templateId)
      : // A simplified structure with only Data Views as we can't
        // build a complete object if not committed
        {
          dataViews: buildLinkedEntityObject(
            await db.getJoinedEntities<PgDataView>({
              templateId,
              table: 'data_view',
              joinTable: 'template_data_view_join',
            }),
            'identifier'
          ),
        }
  ) as CombinedLinkedEntities

  const unconnectedDataViews = suggestedDataViews
    .filter(({ identifier }) => !(identifier in linkedEntities.dataViews))
    .map(({ id, code, identifier, title }) => ({ id, code, identifier, title }))

  if (!committed) {
    const ready = unconnectedDataViews.length === 0
    return { committed, unconnectedDataViews, ready }
  }

  const diff = getDiff(template.linked_entity_data as CombinedLinkedEntities, linkedEntities)

  const ready =
    unconnectedDataViews.length === 0 &&
    Object.values(diff)
      .map((ob) => Object.values(ob))
      .flat().length === 0
  return { committed, ready, unconnectedDataViews, diff }
}
