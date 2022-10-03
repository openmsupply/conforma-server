import fs from 'fs'
import path from 'path'
const fsPromises = fs.promises
import config from '../../config'
import { getAppEntryPointDir } from '../utilityFunctions'

const { filesFolder, genericThumbnailsFolderName } = config

export const filesPath = path.join(getAppEntryPointDir(), filesFolder)

export interface FileDetail {
  id: number
  uniqueId: string
  originalFilename: string
  filePath: string
  thumbnailPath: string
}

export const deleteFile = async (file: FileDetail) => {
  const { filePath, thumbnailPath, originalFilename } = file
  try {
    console.log(path.join(filesPath, filePath))
    await fsPromises.unlink(path.join(filesPath, filePath))
    // Don't delete generic (shared) thumbnail files
    if (!thumbnailPath.match(genericThumbnailsFolderName))
      await fsPromises.unlink(path.join(filesPath, thumbnailPath))
    console.log(`File deleted: ${originalFilename}`)

    // Also delete folder if it's now empty
    const dir = path.dirname(filePath)
    if ((await fsPromises.readdir(path.join(filesPath, dir))).length === 0)
      await fsPromises.rmdir(path.join(filesPath, dir))
  } catch (err) {
    console.log(err)
  }
}
