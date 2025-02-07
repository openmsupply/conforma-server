import {
  ActionApplicationData,
  ActionLibrary,
  ActionPayload,
  ActionQueueExecutePayload,
} from '../../types'
import evaluateExpression, { EvaluatorNode } from '../../modules/expression-evaluator'
import { merge } from 'lodash'
import functions from './evaluatorFunctions'
import DBConnect from '../database/databaseConnect'
import fetch from 'node-fetch'
import { getApplicationData } from './getApplicationData'
import { ActionQueueStatus } from '../../generated/graphql'
import config from '../../config'
import { evaluateParameters } from './helpers'
import { getAdminJWT } from '../permissions/loginHelpers'
import { errorMessage } from '../utilityFunctions'

// Dev config
const showApplicationDataLog = false

const graphQLEndpoint = config.graphQLendpoint

export async function executeAction(
  payload: ActionPayload,
  actionLibrary: ActionLibrary,
  additionalObjects: any = {},
  applicationDataOverride?: Partial<ActionApplicationData>
): Promise<ActionQueueExecutePayload> {
  // Get fresh applicationData for each Action, and inject
  // applicationDataOverride if present
  const applicationData = merge(await getApplicationData({ payload }), applicationDataOverride)

  // Debug helper console.log to inspect applicationData:
  if (showApplicationDataLog) console.log('ApplicationData: ', applicationData)

  const evaluatorParams = {
    objects: { applicationData, functions, ...additionalObjects },
    pgConnection: DBConnect,
    APIfetch: fetch,
    graphQLConnection: { fetch, endpoint: graphQLEndpoint },
    headers: {
      Authorization: `Bearer ${await getAdminJWT()}`,
    },
  }

  // Evaluate condition
  let condition
  try {
    condition = await evaluateExpression(
      payload.condition_expression as EvaluatorNode,
      evaluatorParams
    )
  } catch (err) {
    console.log('>> Error evaluating condition for action:', payload.code)
    const actionResult = {
      status: ActionQueueStatus.Fail,
      error_log: 'Problem evaluating condition: ' + err,
      parameters_evaluated: null,
      output: null,
      id: payload.id,
    }
    await DBConnect.executedActionStatusUpdate(actionResult)
    return actionResult
  }

  if (!condition) {
    console.log(payload.code + ': Condition not met')
    return await DBConnect.executedActionStatusUpdate({
      status: ActionQueueStatus.ConditionNotMet,
      error_log: '',
      parameters_evaluated: null,
      output: null,
      id: payload.id,
    })
  }

  // Condition met -- executing now...
  try {
    // Evaluate parameters
    const parametersEvaluated = await evaluateParameters(payload.parameter_queries, evaluatorParams)
    // TO-DO: Check all required parameters are present

    // TO-DO: If Scheduled, create a Job instead
    const actionResult = await actionLibrary[payload.code]({
      parameters: parametersEvaluated,
      applicationData,
      outputCumulative: evaluatorParams.objects?.outputCumulative || {},
      DBConnect,
    })

    return await DBConnect.executedActionStatusUpdate({
      status: actionResult.status,
      error_log: actionResult.error_log,
      parameters_evaluated: parametersEvaluated,
      output: actionResult.output,
      id: payload.id,
    })
  } catch (err) {
    console.error('>> Error executing action:', payload.code)
    await DBConnect.executedActionStatusUpdate({
      status: ActionQueueStatus.Fail,
      error_log: "Couldn't execute Action: " + errorMessage(err),
      parameters_evaluated: null,
      output: null,
      id: payload.id,
    })
    throw err
  }
}
