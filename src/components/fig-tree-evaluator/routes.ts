import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'
import fsx from 'fs-extra'
import { pipeline } from 'stream'
import { promisify } from 'util'
import DBConnect from '../database/databaseConnect'
import { returnApiError } from '../../ApiError'
import path from 'path'
import { FILES_FOLDER, FILES_TEMP_FOLDER } from '../../constants'
import StreamZip from 'node-stream-zip'
import { customAlphabet } from 'nanoid'
import config from '../../config'
import {
  extractJWTfromHeader,
  getPermissionNamesFromJWT,
  getPublicTokenData,
  getTokenData,
} from '../permissions/loginHelpers'
import { values } from 'lodash'

/** Routes for providing and updating FigTree fragments */

// Public route, available fragments restricted by permissions
export const routeGetFragments = async (
  request: FastifyRequest<{ Querystring: { frontEnd?: 'true'; backEnd?: 'true' } }>,
  reply: FastifyReply
) => {
  try {
    const tokenData = await getPublicTokenData(request)
    const { permissionNames } = await getPermissionNamesFromJWT(tokenData)

    const { frontEnd, backEnd } = request.query

    if (!frontEnd && !backEnd)
      returnApiError('Either front-end or back-end must be specified', reply, 400)

    const getFrontEnd = request.query.frontEnd === 'true'
    const getBackEnd = request.query.backEnd === 'true' && permissionNames.includes('admin')
    const getBoth = getFrontEnd && getBackEnd

    if (!getFrontEnd && !getBackEnd)
      returnApiError('Must have Admin permissions to access back-end Fragments', reply, 403)

    const sqlClause = getBoth
      ? 'AND (front_end = TRUE OR back_end = TRUE)'
      : getBackEnd
      ? 'AND back_end = TRUE'
      : 'AND front_end = TRUE'

    const sqlQuery = `
      SELECT id, code, name, description, expression
      FROM evaluator_fragment
      WHERE (
             $1 && permission_names
             OR permission_names IS NULL
             OR cardinality(permission_names) = 0
           )
       ${sqlClause};`

    const fragments = (
      await DBConnect.query({
        text: sqlQuery,
        values: [permissionNames],
      })
    ).rows
    return reply.send(fragments)
  } catch (err) {
    returnApiError(err, reply)
  }
}
