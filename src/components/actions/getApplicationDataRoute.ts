import { getApplicationData } from './getApplicationData'
import { combineRequestParams } from '../utilityFunctions'

export const routeGetApplicationData = async (request: any, reply: any) => {
  const { applicationId, reviewId, reviewAssignmentId } = combineRequestParams(request, 'camel')
  const appDataParams: { applicationId: number; reviewId?: number; reviewAssignmentId?: number } = {
    applicationId: Number(applicationId),
  }
  if (reviewId) appDataParams.reviewId = Number(reviewId)
  if (reviewAssignmentId) appDataParams.reviewAssignmentId = Number(reviewAssignmentId)
  reply.send(await getApplicationData(appDataParams))
}
