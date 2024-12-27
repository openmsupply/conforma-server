import db from './databaseMethods'
import { errorMessage } from '../components/utilityFunctions'
import { FastifyReply, FastifyRequest } from 'fastify'

export type ExportRequest = {
  Querystring: { applicationId?: string }
  Params: { id: number }
  auth: { userId: number; orgId: number }
}

export const routeExportLookupTable = async (
  request: FastifyRequest<ExportRequest>,
  reply: FastifyReply
) => {
  try {
    const id = Number(request.params?.id)
    console.log(id, typeof id)
    const data = await db.getLookupTable(id)
    return reply.send(data)
  } catch (err) {
    reply.status(500)
    return reply.send(errorMessage(err))
  }
}

// For server use (re-hashing lookup tables)
export const getLookupTableData = async (id: number) => await db.getLookupTable(id)
