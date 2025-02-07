import DBConnect from '../database/databaseConnect'
import { errorMessage, objectKeysToCamelCase } from '../utilityFunctions'
import { snakeCase } from 'lodash'
import config from '../../config'
import { FastifyReply, FastifyRequest } from 'fastify'

// Available for Admin users to retrieve raw data from data tables, e.g. for
// editing. There is no "upload" endpoint, as data must be updated via
// "modifyRecord" action to ensure changelog is written.
export const routeRawData = async (request: FastifyRequest<any>, reply: FastifyReply) => {
  const dataTable = `${config.dataTablePrefix}${snakeCase((request.params as any).dataTable)}`
  const recordId = Number((request.params as any).id)

  const text = `
    SELECT * from ${dataTable}
    WHERE id = $1
  `
  try {
    const result = await DBConnect.query({ text, values: [recordId] })
    return reply.send(objectKeysToCamelCase(result.rows[0]))
  } catch (err) {
    reply.status(500)
    return reply.send(errorMessage(err))
  }
}
