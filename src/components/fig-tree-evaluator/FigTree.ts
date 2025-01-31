import { FetchClient, FigTreeEvaluator, SQLNodePostgres } from 'fig-tree-evaluator'
import fetch from 'node-fetch'
import functions from './functions'
import { getAdminJWT } from '../permissions/loginHelpers'
import { Client } from 'pg'
import PostgresConfig from '../database/postgresConfig.json'
import config from '../../config'

const databaseConnection = new Client(PostgresConfig)

const FigTree = new FigTreeEvaluator({
  httpClient: FetchClient(fetch),
  sqlConnection: SQLNodePostgres(databaseConnection),
  graphQLConnection: { endpoint: config.graphQLendpoint },
  maxCacheSize: 100,
  maxCacheTime: 600,
  evaluateFullObject: true,
  // baseEndpoint:
  functions,

  // Undocumented property to support certain V1 expressions. Remove this once
  // we're sure all evaluator queries have been updated.
  supportDeprecatedValueNodes: true,
})

getAdminJWT().then((result) =>
  FigTree.updateOptions({
    headers: {
      Authorization: `Bearer ${result}`,
    },
  })
)

databaseConnection.connect().then(() =>
  FigTree.evaluate({
    operator: 'SQL',
    query: 'SELECT name, expression FROM evaluator_fragment WHERE back_end = TRUE;',
    fallback: [],
  }).then((result) => {
    const fragments = (result as any[]).reduce((acc, fragment) => {
      return { ...acc, [fragment.name]: fragment.expression }
    }, {})
    FigTree.updateOptions({ fragments })
  })
)

export default FigTree
