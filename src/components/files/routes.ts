// An endpoint for providing lists of files, but only ones the user should have
// permission to access. Namely:
// - files associated with an application user has permission to view
// - files marked "external_reference_doc" can be accessed by anyone
// - files marked "internal_reference_doc" can be accessed by internal users
//
// The actual files themselves can still be accessed by anyone who has the
// correct file ID via the public /file endpoint

import DBConnect from '../database/databaseConnect'
import { File } from '../../generated/graphql'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getUserInfo } from '../permissions/loginHelpers'

type FileData = Pick<
  File,
  | 'uniqueId'
  | 'description'
  | 'filePath'
  | 'originalFilename'
  | 'thumbnailPath'
  | 'timestamp'
  | 'isExternalReferenceDoc'
  | 'isInternalReferenceDoc'
  | 'isOutputDoc'
>

export type FilesRequest = {
  Querystring: { applicationId?: string; outputOnly?: 'true'; external?: 'true'; internal?: 'true' }
}

export const routeFileLists = async (
  request: FastifyRequest<FilesRequest>,
  reply: FastifyReply
) => {
  let files: Set<FileData> = new Set()

  const { applicationId: applicationIdString, outputOnly, external, internal } = request.query

  const applicationId = Number(applicationIdString)

  if (!isNaN(applicationId)) {
    const userAuth = request?.headers?.authorization ?? ''
    const appData = await DBConnect.gqlQuery(
      `
        query getApplicationSerial($applicationId: Int!) {
            application(id: $applicationId) { serial }}`,
      { applicationId },
      userAuth
    )
    const applicationSerial = appData?.application?.serial
    if (applicationSerial) {
      // If there's an application returned, then user is allowed to see the
      // files
    }
    const applicationFiles: File[] = await DBConnect.getApplicationFiles(
      applicationSerial,
      outputOnly === 'true' ? true : undefined
    )
    files = new Set(applicationFiles)
  }

  if (external === 'true' || internal === 'true') {
    const refDocs: File[] = await DBConnect.getReferenceDocs()
    if (external === 'true')
      files = new Set([...files, ...refDocs.filter((file) => file.isExternalReferenceDoc)])

    if (internal === 'true') {
      const { userId, orgId } = (
        request as FastifyRequest & { auth: { userId: number; orgId: number } }
      ).auth
      const userInfo = await getUserInfo({ userId, orgId })
      if (userInfo.user.organisation?.isSystemOrg)
        files = new Set([...files, ...refDocs.filter((file) => file.isInternalReferenceDoc)])
    }
  }

  return reply.send(Array.from(files))
}
