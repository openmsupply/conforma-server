import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'
import fsx from 'fs-extra'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { returnApiError } from '../../ApiError'
import path from 'path'
import { FILES_FOLDER, FILES_TEMP_FOLDER } from '../../constants'
import StreamZip from 'node-stream-zip'
import { customAlphabet } from 'nanoid'
import config from '../../config'

/** Routes for providing and updating FigTree fragments */

// Public route, available fragments restricted by permissions
const routeGetFragments = async (
  request: FastifyRequest<{ Querystring: { frontEnd?: 'true'; backEnd?: 'true' } }>,
  reply: FastifyReply
) => {
  // Get permission names

  // Query database based on permission names

  // Return fragments

  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }
  const comment = request.body?.comment ?? null

  try {
    const result = await commitTemplate(templateId, comment)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}
