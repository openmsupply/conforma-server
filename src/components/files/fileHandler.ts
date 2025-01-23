import path from 'path'
import fs from 'fs'
import fsProm from 'fs/promises'
import util from 'util'
import { pipeline } from 'stream'
import { nanoid } from 'nanoid'
import {
  getAppEntryPointDir,
  makeFolder,
  filterObject,
  errorMessage,
  objectKeysToSnakeCase,
} from '../utilityFunctions'
import config from '../../config'
import DBConnect from '../database/databaseConnect'
import createThumbnail from './createThumbnails'
import { FilePayload } from '../../types'
import { File } from '../../generated/graphql'
import { FILES_FOLDER } from '../../constants'

export const { filesFolder, imagesFolder, genericThumbnailsFolderName } = config
export const filesPath = path.join(getAppEntryPointDir(), filesFolder)

interface HttpQueryParameters {
  [key: string]: string
}

export async function getFilePath(uid: string, thumbnail = false) {
  const fileData = await DBConnect.getFileDownloadInfo(uid)
  if (!fileData) throw new Error('Unable to retrieve file info')

  const isGenericThumbnail =
    thumbnail && fileData.thumbnail_path.startsWith(config.genericThumbnailsFolderName)

  const filePath = percentEncodeFilePath(path.join(fileData.archive_path ?? '', fileData.file_path))
  const thumbnailPath = percentEncodeFilePath(
    path.join(!isGenericThumbnail ? fileData.archive_path ?? '' : '', fileData.thumbnail_path)
  )
  return { filePath, thumbnailPath, originalFilename: fileData.original_filename }
}

const pump = util.promisify(pipeline)

export async function saveFiles(data: any, queryParams: HttpQueryParameters) {
  const filesInfo = []
  let fileCount = 0
  try {
    // data is a Promise, so we await it before looping
    for await (const file of data) {
      fileCount++
      const ext = path.extname(file.filename)
      const basename = path.basename(file.filename, ext)
      const unique_id = queryParams?.unique_id ?? nanoid()
      const subfolder =
        queryParams?.sub_folder ?? queryParams?.subfolder ?? queryParams?.application_serial ?? ''

      const file_path = path.join(subfolder, `${basename}_${unique_id}${ext}`)

      // Save file
      makeFolder(path.join(getAppEntryPointDir(), filesFolder, subfolder))
      await pump(file.file, fs.createWriteStream(path.join(filesPath, file_path)))

      const file_size = (await fsProm.stat(path.join(filesPath, file_path))).size

      // Create thumbnail from saved file
      const thumbnail_path = await createThumbnail({
        filesPath,
        unique_id,
        basename,
        ext,
        subfolder,
        mimetype: file.mimetype,
      })

      // Save file info to database
      const { id } = await saveToDB({
        unique_id,
        file,
        file_path,
        thumbnail_path,
        file_size,
        ...queryParams,
      })

      filesInfo.push({
        id,
        filename: file.filename,
        uniqueId: unique_id,
        fileUrl: `/file?uid=${unique_id}`,
        thumbnailUrl: `/file?uid=${unique_id}&thumbnail=true`,
        mimetype: file.mimetype,
      })
    }
    // For updating file description without re-uploading file
  } catch (err) {
    // If no file provided, we'll get this 406 error, so we continue.
    if (errorMessage(err, 'statusCode') !== 406) throw err
  }
  try {
    if (fileCount === 0) {
      const { unique_id, description } = queryParams
      if (!unique_id) throw new Error('No uniqueId provided')
      const result = await DBConnect.updateFileDescription(unique_id, description)
      filesInfo.push({
        filename: result.original_filename,
        uniqueId: unique_id,
        fileUrl: `/file?uid=${unique_id}`,
        thumbnailUrl: `/file?uid=${unique_id}&thumbnail=true`,
        mimetype: result.mimetype,
      })
    }
  } catch (err) {
    throw err
  }
  return filesInfo
}

// For registering a file that already exists on disk
export const registerFileInDB = async (
  fileData: Partial<File> & { filePath: string; mimetype: string }
) => {
  const normalisedFileData = objectKeysToSnakeCase(fileData)
  const { unique_id, file_size, mimetype, file_path } = normalisedFileData
  const filename = path.basename(file_path)

  normalisedFileData.file_path = file_path
  normalisedFileData.original_filename = filename
  if (!unique_id) normalisedFileData.unique_id = nanoid()
  normalisedFileData.thumbnail_path = await createThumbnail({
    unique_id: normalisedFileData.unique_id,
    filesPath,
    basename: filename,
    ext: path.extname(filename),
    subfolder: path.dirname(file_path),
    mimetype,
  })
  if (!file_size)
    normalisedFileData.file_size = (await fsProm.stat(path.join(FILES_FOLDER, file_path))).size

  await saveToDB(normalisedFileData)
}

export async function saveToDB({
  unique_id,
  original_filename,
  file,
  file_path,
  thumbnail_path,
  file_size,
  template_id,
  application_serial,
  user_id,
  application_response_id,
  description,
  application_note_id,
  is_output_doc = false,
  to_be_deleted = false,
  mimetype,
}: any) {
  try {
    const result = await DBConnect.addFile(
      filterObject({
        user_id,
        unique_id,
        original_filename: file ? file.filename : original_filename,
        template_id,
        application_serial,
        application_response_id,
        description,
        application_note_id,
        is_output_doc,
        to_be_deleted,
        file_path,
        thumbnail_path,
        file_size,
        mimetype: file ? file.mimetype : mimetype,
      }) as FilePayload
    )
    return result
  } catch (err) {
    throw err
  }
}

// If any of these characters are in a filename, they should be replaced with
// percent-encoded chars in the "filePath" parameter to Fastify `sendFile`
// method.
// Reference: https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding
const encodedCharMap = {
  ':': '%3A',
  // '/': '%2F', -- don't want slash in paths at all, asking for trouble!
  '?': '%3F',
  '#': '%23',
  '[': '%5B',
  ']': '%5D',
  '@': '%40',
  '!': '%21',
  $: '%24',
  '&': '%26',
  "'": '%27',
  '(': '%28',
  ')': '%29',
  '*': '%2A',
  '+': '%2B',
  ',': '%2C',
  ';': '%3B',
  '=': '%3D',
  '%': '%25',
  // ' ': '+',
} as Record<string, string>

const illegalCharacterDetect = /[:?#\[\]@!$&'()*+,;=%]/g
const percentEncodeFilePath = (path: string) =>
  path.replace(illegalCharacterDetect, (m) => encodedCharMap[m])
