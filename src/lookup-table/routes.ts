import { FastifyPluginCallback, FastifyReply } from 'fastify'
import { ImportCsvController, ImportCsvUpdateController, ExportCsvController } from './controllers'
import config from '../config'
import { routeExportLookupTable } from './export'

const lookupTableRoutes: FastifyPluginCallback<{ prefix: string }> = (server, _, done) => {
  server.addHook('preValidation', async (request: any, reply: FastifyReply) => {
    const { managerCanEditLookupTables = true } = config
    const { isAdmin = false, isManager = false } = request.auth

    if (managerCanEditLookupTables) {
      if (!(isAdmin || isManager)) {
        reply.statusCode = 401
        return reply.send({ success: false, message: 'Unauthorized: not admin or manager' })
      }
    }

    if (!managerCanEditLookupTables && !isAdmin) {
      reply.statusCode = 401
      return reply.send({ success: false, message: 'Unauthorized: not admin' })
    }
  })
  server.post('/import', ImportCsvController)
  server.get('/export/:id', routeExportLookupTable)
  server.post('/import/:lookupTableId', ImportCsvUpdateController)
  done()
}

export default lookupTableRoutes
