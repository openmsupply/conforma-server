import { FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'
import {
  SNAPSHOT_ARCHIVES_FOLDER_NAME,
  SNAPSHOT_FILE_NAME,
  SNAPSHOT_FOLDER,
} from '../../../constants'
import fs from 'fs'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { timestampStringExpression } from './helpers'
import { DateTime } from 'luxon'
import StreamZip from 'node-stream-zip'
import config from '../../../config'
const pump = promisify(pipeline)

const errorMessageBase = {
  success: false,
  message: 'failed to upload snapshot',
}

const TEMP_ZIP_FILE = 'tempUpload.zip'

type Query = {
  template?: 'true'
}

const routeUploadSnapshot = async (request: FastifyRequest, reply: FastifyReply) => {
  let upload
  try {
    upload = await request.file()
    if (!upload) throw new Error('No file attached')
  } catch (err) {
    throw new Error('No file attached')
  }

  // const data = await request.files()
  const isTemplate = (request.query as Query)?.template === 'true'

  let snapshotName: string = ''
  try {
    snapshotName = upload.filename
      // Remove ".zip" file extension
      .replace(/\.zip$/g, '')
      // Remove "ARCHIVE_" prefix
      .replace(/^ARCHIVE_/gi, '')
      // Remove (1) from end (added due to multiple downloads of same file)
      .replace(/(\(\d+\))$/g, '')
      // Restrict filename to alpha-numeric chars (and "-"/"_")
      .replace(/[^\w\d-]/g, '_')

    const tempZipLocation = path.join(SNAPSHOT_FOLDER, TEMP_ZIP_FILE)

    await pump(upload.file, fs.createWriteStream(tempZipLocation))

    if (upload.file.truncated)
      return reply.send({
        ...errorMessageBase,
        error: `Uploaded file too big (Limit ${config.fileUploadLimit} bytes)`,
      })

    const zip = new StreamZip.async({ file: tempZipLocation })

    const zipEntries = Object.values(await zip.entries())
    const files = zipEntries.map(({ name }) => name)

    if (!files.includes('info.json')) {
      return reply.send({
        ...errorMessageBase,
        error: 'Invalid Snapshot or Archive .zip',
      })
    }

    const zipEntryData = await zip.entryData('info.json')
    const info = JSON.parse(zipEntryData?.toString() || '{}')

    // Add timestamp suffix to upload name if it doesn't already have it. But
    // we don't want this on template uploads as the front-end needs to refer
    // to them by name, and we delete them immediately after anyway
    if (!timestampStringExpression.test(snapshotName) && !isTemplate)
      snapshotName =
        snapshotName + DateTime.fromISO(info.timestamp).toFormat('_yyyy-LL-dd_HH-mm-ss')

    const isArchive =
      !files.includes('database.dump') &&
      // i.e. "Template" uploads
      !files.includes(`${SNAPSHOT_FILE_NAME}.json`)

    const destination = isArchive
      ? path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, snapshotName)
      : path.join(SNAPSHOT_FOLDER, snapshotName)

    // Make sure snapshot doesn't already exist
    if (fs.existsSync(destination)) {
      fs.unlink(path.join(SNAPSHOT_FOLDER, TEMP_ZIP_FILE), () => {})
      {
        return reply.send({
          ...errorMessageBase,
          error: `Snapshot already exists: ${snapshotName}`,
        })
      }
    }

    // zip.extract can error if destination dir doesn't already exist
    fs.mkdirSync(destination)
    await zip.extract(null, destination)
    await zip.close()

    // Move/rename original zip if filename has changed, or if it's an archive
    fs.rename(
      tempZipLocation,
      isArchive
        ? path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, snapshotName + '.zip')
        : path.join(SNAPSHOT_FOLDER, snapshotName + '.zip'),
      () => {}
    )
  } catch (e) {
    console.log(e)
    return reply.send({ ...errorMessageBase, error: 'check server logs' })
  }

  reply.send({
    success: true,
    message: `uploaded snapshot ${snapshotName}`,
    snapshot: snapshotName,
  })
}

export default routeUploadSnapshot
