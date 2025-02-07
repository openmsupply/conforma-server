import { EvaluatorNode } from '../../modules/expression-evaluator'

type ApiAuthentication =
  | { type: 'Basic'; username: string; password: string }
  | { type: 'Bearer'; token: string }

type QueryParameters = { [key: string]: EvaluatorNode }

interface RouteCommon {
  url: string
  permissions?: string[]
  queryParams?: QueryParameters
  allowedClientQueryParams?: string[]
  additionalAxiosProperties?: { [key: string]: any }
  returnProperty?: string
  validationExpression?: EvaluatorNode
}

interface GetRoute extends RouteCommon {
  method: 'get'
}

interface PostRoute extends RouteCommon {
  method: 'post'
  bodyJson?: QueryParameters
  allowedClientBodyFields?: string[]
}

type RouteConfig = GetRoute | PostRoute

interface ExternalApiConfigs {
  [key: string]: {
    baseUrl: string
    authentication: ApiAuthentication
    routes: {
      [key: string]: RouteConfig
    }
  }
}

export { ApiAuthentication, QueryParameters, RouteConfig, PostRoute, ExternalApiConfigs }
