// Route methods to get lookup table structure data:
// - "list": all lookup table structures
// - "table": single lookup table structure

import { errorMessage } from '../components/utilityFunctions'
import db from './databaseMethods'
import { FastifyReply, FastifyRequest } from 'fastify'

export const routeLookupTableStructuresList = async (_: FastifyRequest, reply: FastifyReply) => {
  try {
    const list = await db.getAllLookupTableStructures()
    return reply.send(list)
  } catch (err) {
    reply.status(500)
    return reply.send(errorMessage(err))
  }
}

interface TableStructureRequest {
  Params: { id: string }
}

export const routeLookupTableStructure = async (
  req: FastifyRequest<TableStructureRequest>,
  reply: FastifyReply
) => {
  const id = Number(req.params?.id)
  if (Number.isNaN(id)) {
    reply.status(500)
    return reply.send('No table ID provided')
  }

  try {
    const structure = await db.getLookupTableStructure(id)
    return reply.send(structure)
  } catch (err) {
    reply.status(500)
    return reply.send(errorMessage(err))
  }
}
