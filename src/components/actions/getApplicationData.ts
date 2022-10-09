import { ActionApplicationData, ActionPayload } from '../../types'
import DBConnect from '../databaseConnect'
import { BasicObject } from '@openmsupply/expression-evaluator/lib/types'
import { getAppEntryPointDir } from '../utilityFunctions'
import config from '../../config'

// Add more data (such as org/review, etc.) here as required
export const getApplicationData = async (input: {
  payload?: ActionPayload
  applicationId?: number
  reviewId?: number
  reviewAssignmentId?: number
}): Promise<ActionApplicationData> => {
  // Requires either application OR trigger_payload, so throw error if neither provided
  if (!input?.payload?.trigger_payload && !input?.applicationId)
    throw new Error('trigger_payload or applicationId required')
  const { trigger_payload } = (input?.payload as ActionPayload) ?? {}
  const applicationId =
    input?.applicationId ??
    (await DBConnect.getApplicationIdFromTrigger(
      trigger_payload?.table as string,
      trigger_payload?.record_id as number
    ))

  const applicationResult = await DBConnect.getApplicationData(applicationId)
  if (!applicationResult) throw new Error("Can't get application data")

  const applicationData = applicationResult ? applicationResult : { applicationId }

  const userData = applicationData?.userId
    ? await DBConnect.getUserData(applicationData?.userId, applicationData?.orgId)
    : null

  const responses = await DBConnect.getApplicationResponses(applicationId)

  const responseData: BasicObject = {}
  for (const response of responses) {
    responseData[response.code] = response.value
  }

  const reviewId =
    input?.reviewId ?? (trigger_payload?.table === 'review' ? trigger_payload?.record_id : null)

  const reviewAssignmentId =
    input?.reviewAssignmentId ??
    (trigger_payload?.table === 'review_assignment' ? trigger_payload?.record_id : null)

  const reviewData = reviewId
    ? {
        reviewId,
        ...(await DBConnect.getReviewData(reviewId)),
      }
    : reviewAssignmentId
    ? {
        ...(await DBConnect.getReviewDataFromAssignment(reviewAssignmentId)),
      }
    : {}

  const Emailconfig = {
    host: 'server.msupply.foundation',
    port: 465,
    secure: true,
    user: 'irims-dev@sussol.net',
    defaultFromName: 'Conforma',
  }

  // const Emailconfig = {
  //   host: 'server.msupply.foundation',
  //   port: 465,
  //   secure: true,
  //   user: 'irims-dev@sussol.net',
  //   defaultFromName: 'Conforma',
  //   defaultFromEmail: 'test-new-noreply@email.com',
  // }

  const environmentData = {
    appRootFolder: getAppEntryPointDir(),
    filesFolder: config.filesFolder,
    webHostUrl: process.env.WEB_HOST,
    config: Emailconfig,
  }

  const sectionCodes = (await DBConnect.getApplicationSections(applicationId)).map(
    ({ code }: { code: string }) => code
  )

  return {
    action_payload: input?.payload,
    ...applicationData,
    ...userData,
    responses: responseData,
    reviewData,
    environmentData,
    sectionCodes,
  }
}
