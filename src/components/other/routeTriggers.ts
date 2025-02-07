import databaseConnect from '../database/databaseConnect'
import { Trigger } from '../../generated/graphql'
import { errorMessage } from '../utilityFunctions'

interface TriggerError {
  type: 'trigger' | 'timeout' | 'apollo'
  result: TriggerData[]
}

type TriggerStatus = 'ready' | 'processing' | 'error'

interface TriggerData {
  table?: string
  id: number
  trigger: Trigger
}

interface TriggerState {
  status: TriggerStatus
  errors?: TriggerData[]
}

export const routeTriggers = async (request: any, reply: any) => {
  const { serial } = request.query
  if (!serial) return reply.send({ success: false, message: 'No application serial provided' })
  try {
    const { reviewAssignments, reviews, verifications, applicationId, applicationTrigger } =
      await databaseConnect.getAllApplicationTriggers(serial)
    if (!applicationId) return reply.send({ success: false, message: 'No results' })

    const triggerState = checkTriggers(
      reviewAssignments.nodes,
      reviews.nodes,
      verifications.nodes,
      applicationId,
      applicationTrigger
    )

    return reply.send(triggerState)
  } catch (err) {
    return reply.send({ success: false, message: errorMessage(err) })
  }
}

const checkTriggers = (
  reviewAssignments: TriggerData[],
  reviews: TriggerData[],
  verifications: TriggerData[],
  applicationId: number,
  applicationTrigger: Trigger
): TriggerState => {
  const flattenedTriggers = [
    ...reviewAssignments.map((elem) => ({ table: 'reviewAssignment', ...elem })),
    ...reviews.map((elem) => ({ table: 'review', ...elem })),
    ...verifications.map((elem) => ({ table: 'verification', ...elem })),
    { table: 'application', id: applicationId, trigger: applicationTrigger },
  ]
  const triggersProcessing = flattenedTriggers.filter((t) => t.trigger === 'PROCESSING')
  const triggersError = flattenedTriggers.filter((t) => t.trigger === 'ERROR')
  const triggersReady = flattenedTriggers.filter((t) => t.trigger === null)

  if (triggersError.length > 0) return { status: 'error', errors: triggersError }
  if (triggersProcessing.length > 0) return { status: 'processing' }

  // This can happen if the trigger is still the actual initial value (e.g.
  // "ON_APPLICATION_SUBMIT" and hasn't been updated by the trigger_queue
  // process yet)
  if (triggersReady.length !== flattenedTriggers.length) return { status: 'processing', errors: [] }
  // Good to go!
  return { status: 'ready' }
}
