import { actionLibrary } from '../../pluginsConnect'
import { getApplicationData } from '.././getApplicationData'
import { combineRequestParams } from '../../utilityFunctions'
import DBConnect from '../../database/databaseConnect'
import { testTrigger, RequestProps } from './testTrigger'

// These routes should only be used for testing in development. They should
// NEVER be used in the app.

export const routeRunAction = async (request: any, reply: any) => {
  const { actionCode, applicationId, reviewId, parameters } = combineRequestParams(request, 'camel')
  const applicationData = applicationId ? await getApplicationData({ applicationId, reviewId }) : {}
  const actionResult = await actionLibrary[actionCode]({
    parameters,
    applicationData,
    DBConnect,
  })
  return reply.send(actionResult)
}

// Wrapper for "testTrigger". Use routeTestTrigger provides the REST endpoint,
// "testTrigger" is the actual function.
export const routeTestTrigger = async (request: any, reply: any) => {
  const params: RequestProps = combineRequestParams(request, 'camel')

  reply.send(await testTrigger(params))
}
