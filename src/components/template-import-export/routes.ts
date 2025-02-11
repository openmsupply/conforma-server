import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify'
import fsx from 'fs-extra'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { returnApiError } from '../../ApiError'
import {
  exportTemplate,
  duplicateTemplate,
  checkTemplate,
  commitTemplate,
  getDataViewDetails,
  getLinkedFiles,
  getSingleEntityDiff,
  importTemplateInstall,
  importTemplateUpload,
  PreserveExistingEntities,
} from './operations'
import path from 'path'
import { FILES_FOLDER, FILES_TEMP_FOLDER } from '../../constants'
import StreamZip from 'node-stream-zip'
import { customAlphabet } from 'nanoid'
import { CombinedLinkedEntities } from './types'
import config from '../../config'

const pump = promisify(pipeline)

/** All the routes for template management */

export const templateRoutes: FastifyPluginCallback<{ prefix: string }> = (server, _, done) => {
  server.post('/commit/:id', routeCommitTemplate)
  server.post('/duplicate/new/:id', routeDuplicateTemplateNew)
  server.post('/duplicate/version/:id', routeDuplicateTemplateVersion)
  server.get('/export/:id', routeTemplateExport)
  server.get('/check/:id', routeTemplateCheck)
  server.post('/import/upload', routeImportTemplateUpload)
  server.get('/import/get-full-entity-diff/:uid', routeImportGetDiff)
  server.post('/import/install/:uid', routeImportTemplateInstall)
  server.get('/get-data-view-details/:id', routeGetDataViewDetails)
  server.get('/get-linked-files/:id', routeGetLinkedFiles)
  done()
}

const routeCommitTemplate = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { comment?: string } }>,
  reply: FastifyReply
) => {
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

const routeTemplateCheck = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  try {
    const result = await checkTemplate(templateId)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeTemplateExport = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  try {
    const filepath = await exportTemplate(templateId)
    // @ts-ignore -- "sendFile" method does exist on reply
    reply.sendFile(filepath)
    fsx.remove(path.join(FILES_FOLDER, filepath))
    return reply
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeDuplicateTemplateNew = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { code: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  const code = request.body?.code
  if (!code) {
    returnApiError('New template code missing', reply, 400)
  }

  try {
    const result = await duplicateTemplate(templateId, code)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeDuplicateTemplateVersion = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { code: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  try {
    const result = await duplicateTemplate(templateId)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeImportTemplateUpload = async (request: FastifyRequest, reply: FastifyReply) => {
  let upload
  try {
    // @ts-ignore
    upload = await request.file()
  } catch (err) {
    returnApiError('No file attached', reply, 400)
  }

  if (!upload) {
    returnApiError('No file attached', reply, 400)
    return
  }

  if (upload?.mimetype !== 'application/zip') returnApiError('File is not a ZIP file', reply, 400)

  const tempZipLocation = path.join(FILES_TEMP_FOLDER, 'templateUpload.zip')
  await fsx.ensureDir(FILES_TEMP_FOLDER)
  await pump(upload.file, fsx.createWriteStream(tempZipLocation))

  const folderName = getRandomTemplateFolderName()
  const unzippedTemplatePath = path.join(FILES_TEMP_FOLDER, folderName)

  try {
    const zip = new StreamZip.async({ file: tempZipLocation })
    await fsx.ensureDir(unzippedTemplatePath)
    await zip.extract(null, unzippedTemplatePath)
    await zip.close()
    await fsx.remove(tempZipLocation)
  } catch (err) {
    returnApiError(`Problem unzipping uploaded file: ${(err as Error).message}`, reply, 400)
  }

  const modifiedEntities = await importTemplateUpload(folderName)
  const ready =
    Object.values(modifiedEntities)
      .map((ob) => Object.values(ob))
      .flat().length === 0

  // Cleanup temp upload if not installed within next 10 mins
  config.scheduledJobs?.manuallySchedule('cleanup', 10)

  try {
    return reply.send({ uid: folderName, modifiedEntities, ready })
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeImportGetDiff = async (
  request: FastifyRequest<{
    Params: { uid: string }
    Querystring: { type: keyof CombinedLinkedEntities; value: string }
  }>,
  reply: FastifyReply
) => {
  const uid = request.params.uid
  if (!uid) {
    returnApiError('No UID specified for imported template', reply, 400)
  }

  const { type, value } = request.query

  try {
    const result = await getSingleEntityDiff(uid, type, value)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeImportTemplateInstall = async (
  request: FastifyRequest<{
    Params: { uid: string }
    Body: { [K in keyof PreserveExistingEntities]: string[] } & { category: string }
  }>,
  reply: FastifyReply
) => {
  const uid = request.params.uid
  if (!uid) {
    returnApiError('No UID specified for template install', reply, 400)
  }

  const preserveExistingEntities = request.body ?? {}

  const preserveExistingEntitySets = Object.fromEntries(
    Object.entries(preserveExistingEntities)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => [key, key === 'category' ? value : new Set(value)])
  )

  try {
    const result = await importTemplateInstall(uid, preserveExistingEntitySets)
    return reply.send(result)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const routeGetDataViewDetails = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  try {
    const dataViews = await getDataViewDetails(templateId)
    return reply.send(dataViews)
  } catch (err) {
    returnApiError(err, reply)
  }
}
const routeGetLinkedFiles = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const templateId = Number(request.params.id)
  if (!templateId || isNaN(templateId)) {
    returnApiError('Invalid template id', reply, 400)
  }

  try {
    const files = await getLinkedFiles(templateId)
    return reply.send(files)
  } catch (err) {
    returnApiError(err, reply)
  }
}

const getRandomTemplateFolderName = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24)
