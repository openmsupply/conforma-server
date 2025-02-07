import { ActionApplicationData, ActionPayload, BaseApplicationData, ReviewData } from '../../types'
import DBConnect from '../database/databaseConnect'
import { BasicObject } from '../../modules/expression-evaluator'
import { getAppEntryPointDir } from '../utilityFunctions'
import config from '../../config'
import { getUserInfo } from '../permissions/loginHelpers'

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

  const applicationData: BaseApplicationData = await DBConnect.getApplicationData(applicationId)
  if (!applicationData) throw new Error("Can't get application data")

  const {
    user: { firstName, lastName, username, dateOfBirth, email, permissionNames },
  } = await getUserInfo({
    userId: applicationData.userId,
    orgId: applicationData?.orgId || undefined,
  })

  const userData = {
    firstName,
    lastName,
    // Org data needs to come from application info (not "getUserInfo") as user
    // may no longer belong to the organisation that applied as.
    orgName: await DBConnect.getOrgName(applicationData?.orgId),
    orgId: applicationData?.orgId || null,
    username,
    dateOfBirth,
    email,
    permissionNames,
  }

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

  const reviewData: ReviewData = reviewId
    ? {
        reviewId,
        ...(await DBConnect.getReviewData(reviewId)),
      }
    : reviewAssignmentId
    ? {
        ...(await DBConnect.getReviewDataFromAssignment(reviewAssignmentId)),
      }
    : {}

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key, _]) => config.envVars?.includes(key))
  )
  const environmentData = {
    appRootFolder: getAppEntryPointDir(),
    filesFolder: config.filesFolder,
    webHostUrl: config.webHostUrl ?? 'MissingHost',
    SMTPConfig: config?.SMTPConfig,
    productionHost: config?.productionHost ?? null,
    isLiveServer: config.isLiveServer,
    emailMode: config?.emailMode,
    testingEmail: config?.testingEmail ?? null,
    env,
  }

  const sectionCodes = (await DBConnect.getApplicationSections(applicationId)).map(
    ({ code }: { code: string }) => code
  )

  const adminPermission = 'admin' // TODO: Should be added to preferences too
  const managementPrefName =
    config?.systemManagerPermissionName ?? config.defaultSystemManagerPermissionName

  return {
    action_payload: input?.payload,
    ...applicationData,
    ...userData,
    isAdmin: !!userData?.permissionNames.includes(adminPermission),
    isManager: !!userData?.permissionNames.includes(managementPrefName),
    responses: responseData,
    reviewData,
    environmentData,
    sectionCodes,
  }
}
