import { merge } from 'lodash'
import { ActionInTemplate } from '../../types'
import evaluateExpression, { BasicObject, IParameters } from '../../modules/expression-evaluator'
import DBConnect from '../database/databaseConnect'
import { Trigger } from '../../generated/graphql'

export async function evaluateParameters(
  parameterQueries: BasicObject,
  evaluatorParameters: IParameters = {}
) {
  const parametersEvaluated: BasicObject = {}
  try {
    for (const key in parameterQueries) {
      parametersEvaluated[key] = await evaluateExpression(
        parameterQueries[key],
        evaluatorParameters
      )
    }
    return parametersEvaluated
  } catch (err) {
    throw err
  }
}

export const swapOutAliasedAction = async (templateId: number, action: ActionInTemplate) => {
  // Fetch aliased action from database
  const {
    condition,
    parameter_queries: { code, shouldOverrideCondition, ...overrideParams },
  } = action
  if (!code) throw new Error('Missing code in aliased action')

  const aliasedAction = await DBConnect.getSingleTemplateAction(templateId, code)

  if (!aliasedAction) throw new Error('No Action matching alias: ' + code)

  // Override condition if specified
  // The alias condition (if specified) will take priority over the original
  // action condition. However, the default condition is "true", and we don't
  // want that to ALWAYS override the original action condition. So we ignore it
  // if the alias condition = true. In the event that we actually *want* this to
  // override, the "shouldOverrideCondition" parameter should be set to "true"
  if (condition !== true || shouldOverrideCondition) aliasedAction.condition = condition

  // All docs generated as Previews should be never be kept, but we don't want
  // to have to remember to add these parameters to every preview doc alias
  if (aliasedAction.code === 'generateDoc' && action.trigger === Trigger.OnPreview) {
    overrideParams.toBeDeleted = true
    overrideParams.isOutputDoc = false
  }

  // Override parameters
  aliasedAction.parameter_queries = merge(aliasedAction.parameter_queries, overrideParams)

  return aliasedAction
}
