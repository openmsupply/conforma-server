import { FastifyPluginCallback } from 'fastify'
import fastifyStatic from '@fastify/static'
import { SNAPSHOT_FOLDER } from '../../../constants'
import routeListSnapshots from './routeListSnapshots'
import routeTakeSnapshot from './routeTakeSnapshot'
import routeUseSnapshot from './routeUseSnapshot'
import routeUploadSnapshot from './routeUploadSnapshot'
import routeDeleteSnapshot from './routeDeleteSnapshot'

const snapshotRoutes: FastifyPluginCallback<{ prefix: string }> = (server, _, done) => {
  server.register(fastifyStatic, {
    root: SNAPSHOT_FOLDER,
    prefix: '/files/',
  })
  server.get('/list', routeListSnapshots)
  server.post('/take', routeTakeSnapshot)
  server.post('/use', routeUseSnapshot)
  server.post('/upload', routeUploadSnapshot)
  server.post('/delete', routeDeleteSnapshot)

  done()
}

export default snapshotRoutes
