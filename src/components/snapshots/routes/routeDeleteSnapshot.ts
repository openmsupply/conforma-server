import { FastifyRequest, FastifyReply } from 'fastify'
import { promisify } from 'util'
import rimraf from 'rimraf'
import path from 'path'
import { SNAPSHOT_ARCHIVES_FOLDER_NAME, SNAPSHOT_FOLDER } from '../../../constants'
import { errorMessage } from '../../utilityFunctions'

const asyncRimRaf = promisify(rimraf)

type Query = {
  name?: string
  archive?: 'true'
}

const routeDeleteSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
  const isArchive = (request.query as Query)?.archive === 'true'
  const snapshotName = (request.query as Query)?.name as string
  if (!snapshotName) reply.send({ success: false, message: 'No snapshot name provided' })

  const folderPath = isArchive
    ? path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME)
    : SNAPSHOT_FOLDER

  console.log('Deleting snapshot:', snapshotName)
  try {
    await asyncRimRaf(path.join(folderPath, snapshotName))
    // Also delete the .zip if it exists
    await asyncRimRaf(path.join(folderPath, `${snapshotName}.zip`))
    reply.send({ success: true })
  } catch (e) {
    reply.send({
      success: false,
      message: 'Problem deleting snapshot ' + snapshotName,
      error: errorMessage(e),
    })
  }
}

export default routeDeleteSnapshot
