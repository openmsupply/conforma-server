import { FastifyRequest, FastifyReply } from 'fastify'
import db from '../database/databaseConnect'
import path from 'path'
import config from '../../config'
import { get as extractProperty } from 'lodash'
import { getPermissionNamesFromJWT } from '../data_display/helpers'
import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import { constructAuthHeader, constructQueryObject, validateResult } from './helpers'
import { ExternalApiConfigs, QueryParameters } from './types'
import { getApplicationData } from '../actions'
import { getUserInfo } from '../permissions/loginHelpers'
import { ActionApplicationData } from '../../types'
import functions from '../actions/evaluatorFunctions'
import { errorMessage } from '../utilityFunctions'

export type AccessExternalApiQuery = {
  Querystring: { applicationId?: string }
  Params: { name: string; route: string }
  auth: { userId: number; orgId: number }
}

export const routeAccessExternalApi = async (
  request: FastifyRequest<AccessExternalApiQuery>,
  reply: FastifyReply
) => {
  const { name, route } = request.params

  const apiConfigs: ExternalApiConfigs = config?.externalApiConfigs ?? {}

  const { baseUrl, routes, authentication } = apiConfigs?.[name]
  if (!baseUrl) {
    throw new Error('No baseUrl defined for API: ' + name)
  }

  const routeConfig = routes?.[route]
  if (!routeConfig) {
    throw new Error('No config definition for Route: ' + route)
  }

  const {
    method,
    url,
    permissions,
    queryParams,
    allowedClientQueryParams,
    returnProperty,
    additionalAxiosProperties,
    validationExpression,
  } = routeConfig

  if (permissions) {
    const { permissionNames } = await getPermissionNamesFromJWT(request)
    const validPermissions = permissions.filter((permission) =>
      permissionNames.includes(permission)
    )

    if (validPermissions.length === 0) {
      reply.status(403)
      return reply.send('Not authorized to view this resource')
    }
  }

  // Construct data object for subsequent expression evaluator
  const { userId, orgId } =
    (
      request as FastifyRequest<AccessExternalApiQuery> & {
        auth: { userId: number; orgId: number }
      }
    ).auth ?? {}
  const { user } = await getUserInfo({ userId, orgId })
  const evaluatorData: {
    user: typeof user
    applicationData?: ActionApplicationData
    functions: typeof functions
  } = { user, functions }

  // ApplicationData only available if an applicationId is provided as a query
  // parameter, and only if user has permission to view that application
  const applicationId = Number(request.query?.applicationId)
  if (applicationId) {
    const { application } = await db.gqlQuery(
      `query getApplication($applicationId: Int!) {
      application(id: $applicationId) { id } }`,
      { applicationId },
      request?.headers?.authorization
    )
    if (application) evaluatorData.applicationData = await getApplicationData({ applicationId })
  }

  const axiosRequest = {
    method,
    url: path.join(baseUrl, url),
    ...additionalAxiosProperties,
  } as AxiosRequestConfig

  axiosRequest.params = await constructQueryObject(
    request.query as QueryParameters,
    queryParams,
    allowedClientQueryParams,
    evaluatorData
  )

  if (method === 'post') {
    const { bodyJson, allowedClientBodyFields } = routeConfig
    if (request.body || bodyJson) {
      axiosRequest.data = await constructQueryObject(
        request.body as QueryParameters,
        bodyJson,
        allowedClientBodyFields,
        evaluatorData
      )
    }
  }

  constructAuthHeader(authentication, axiosRequest)

  console.log(`Making ${method.toUpperCase()} request to: ${axiosRequest.url}`)
  try {
    const result = (await axios(axiosRequest)).data
    const returnValue = returnProperty ? extractProperty(result, returnProperty, result) : result

    if (
      await validateResult(
        validationExpression,
        returnValue,
        request.query as QueryParameters,
        evaluatorData
      )
    ) {
      console.log('Request successful')
      return reply.send(returnValue)
    } else {
      console.log('Request not authorized, not returning result')
      reply.status(403)
      return reply.send('Not authorized to view result')
    }
  } catch (err) {
    if (err instanceof AxiosError) {
      reply.status(err.response?.status ?? 500)
      return reply.send(`External API error: ${err.message}`)
    }
    const errMessage = errorMessage(err)
    console.log('Request error', errMessage)
    reply.status(500)
    return reply.send(`Server error: ${errMessage}`)
  }
}
