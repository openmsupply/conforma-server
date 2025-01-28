import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import databaseConnect from '../database/databaseConnect'
import config from '../../config'
import { Config } from '../../types'
import { WebSocket } from '@fastify/websocket'

const notifyClients = async (message: string, server: FastifyInstance) => {
  server.websocketServer.clients.forEach((client) => client.send(message))
}

export const updateMaintenanceModeInConfig = async (config: Config) => {
  const storedValue = await databaseConnect.getSystemInfo('maintenanceMode')
  config.maintenanceMode = storedValue?.enabled ?? false
}

export const routeSetMaintenanceMode = (
  request: FastifyRequest<{ Body: { enabled: boolean } }>,
  reply: FastifyReply,
  server: FastifyInstance
) => {
  const { enabled } = request.body
  if (typeof enabled !== 'boolean') {
    reply.send({ success: false, message: 'Invalid parameter' })
    return
  }

  if (enabled !== config.maintenanceMode) {
    config.maintenanceMode = enabled
    console.log(`System Maintenance Mode ${enabled ? 'ON' : 'OFF'}\n`)
    databaseConnect.setSystemInfo('maintenanceMode', { enabled })
    notifyClients(
      JSON.stringify({
        maintenanceMode: config.maintenanceMode,
        redirect: config.maintenanceSite ?? config.defaultUnderMaintenanceSite,
      }),
      server
    )
  }
  reply.send({ success: true, enabled })
}

export const routeServerStatusWebsocket = (socket: WebSocket, server: FastifyInstance) => {
  console.log(`New client connected, ${server.websocketServer.clients.size} current connections`)
  socket.send(JSON.stringify({ version: config.version }))
  if (config.maintenanceMode)
    socket.send(
      JSON.stringify({
        maintenanceMode: config.maintenanceMode,
        force: true,
        redirect: config.maintenanceSite ?? config.defaultUnderMaintenanceSite,
      })
    )

  // Keeps connection alive, otherwise disconnects after 1 min of idle time
  const timerId = setInterval(() => {
    socket.ping()
  }, 50_000)

  socket.on('close', () => {
    console.log(`Client disconnected, ${server.websocketServer.clients.size} connections remaining`)
    clearInterval(timerId)
  })
}
