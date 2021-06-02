import fastify from 'fastify'
import fastifyStatic from 'fastify-static'
import fastifyMultipart from 'fastify-multipart'
import fastifyCors from 'fastify-cors'
import path from 'path'
import { loadActionPlugins } from './components/pluginsConnect'
import {
  routeUserInfo,
  routeLogin,
  routeLoginOrg,
  routeUpdateRowPolicies,
  routeCreateHash,
} from './components/permissions'
import {
  saveFiles,
  getFilePath,
  createFilesFolder,
  filesFolder,
} from './components/files/fileHandler'
import { getAppEntryPointDir } from './components/utilityFunctions'
import DBConnect from './components/databaseConnect'
import config from './config.json'
import lookupTableRoutes from './lookup-table/routes'

// Bare-bones Fastify server

const startServer = async () => {
  await loadActionPlugins() // Connects to Database and listens for Triggers

  createFilesFolder()

  const server = fastify()

  server.register(fastifyStatic, {
    root: path.join(getAppEntryPointDir(), filesFolder),
  })

  server.register(fastifyMultipart)

  server.register(fastifyCors, { origin: '*' }) // Allow all origin (TODO change in PROD)

  // File download endpoint (get by unique ID)
  server.get('/file', async function (request: any, reply: any) {
    const { uid, thumbnail } = request.query
    const { original_filename, file_path, thumbnail_path } = await getFilePath(
      uid,
      thumbnail === 'true'
    )
    // TO-DO Check for permission to access file
    try {
      // TO-DO: Rename file back to original for download
      return reply.sendFile(file_path ? file_path : thumbnail_path)
    } catch {
      return reply.send({ success: false, message: 'Unable to retrieve file' })
    }
  })

  server.get('/user-info', routeUserInfo)
  server.post('/login', routeLogin)
  server.post('/login-org', routeLoginOrg)
  server.get('/updateRowPolicies', routeUpdateRowPolicies)
  server.post('/create-hash', routeCreateHash)

  // File upload endpoint
  server.post('/upload', async function (request: any, reply) {
    // TO-DO: Authentication
    const data = await request.files()
    const fileData = await saveFiles(data, request.query)
    reply.send({ success: true, fileData })
  })

  server.register(lookupTableRoutes, { prefix: '/lookup-table' })

  server.get('/', async (request, reply) => {
    console.log('Request made')
    return 'This is the response\n'
  })

  // Unique name/email/organisation check
  server.get('/check-unique', async (request: any, reply) => {
    const { type, value, table, field } = request.query
    if (value === '' || value === undefined) {
      reply.send({
        unique: false,
        message: 'Value not provided',
      })
      return
    }
    let tableName, fieldName
    switch (type) {
      case 'username':
        tableName = 'user'
        fieldName = 'username'
        break
      case 'email':
        tableName = 'user'
        fieldName = 'email'
        break
      case 'organisation':
        tableName = 'organisation'
        fieldName = 'name'
        break
      case 'orgRegistration':
        tableName = 'organisation'
        fieldName = 'registration'
        break
      default:
        if (!table || !field) {
          reply.send({
            unique: false,
            message: 'Type, table, or field missing or invalid',
          })
          return
        } else {
          tableName = table
          fieldName = field
        }
    }
    try {
      const isUnique = await DBConnect.isUnique(tableName, fieldName, value)
      reply.send({
        unique: isUnique,
        message: '',
      })
    } catch (err) {
      reply.send({ unique: false, message: err.message })
    }
  })

  server.listen(config.RESTport, (err, address) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`Server listening at ${address}`)
  })

  // Fastify TO DO:
  //  - Serve actual bundled React App
  //  - Authentication endpoint
  //  - Endpoint for file serving
  //  - etc...
}

startServer()

// Just for testing
// setTimeout(() => console.log(actionLibrary, actionSchedule), 3000);
