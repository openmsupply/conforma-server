import { FastifyRequest, FastifyReply } from 'fastify'
import { ArchiveOption, SnapshotType } from '../../exportAndImport/types'
import takeSnapshot from '../takeSnapshot'

type Query = {
  name?: string
  type?: SnapshotType
}

const routeTakeSnapshot = async (
  request: FastifyRequest<{ Querystring: Query; Body?: { archive: ArchiveOption } }>,
  reply: FastifyReply
) => {
  const snapshotType = request.query.type
  const snapshotName = request.query.name
  const archive = request?.body?.archive

  if (!snapshotName) return reply.send({ success: false, message: 'error while loading snapshot' })

  reply.send(await takeSnapshot({ snapshotName, snapshotType, archive }))
}

export default routeTakeSnapshot
