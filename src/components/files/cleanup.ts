/*
Script to handle overall system file clean up:
- Identifies any files in the "files" folder that are not registered in the
  database ("file" table) and deletes them. 
- Removes file records from "file" table that are no longer present in the file
  system.
- Deletes file records and files that have been marked "to_be_deleted" (by
  template actions)
*/

const BATCH_SIZE = 100 // How many file records to scan at a time

import DBConnect from '../database/databaseConnect'
import { DateTime } from 'luxon'
import fs from 'fs'
import path from 'path'
import { clearEmptyDirectories, crawlFileSystem, errorMessage } from '../utilityFunctions'
import { deleteFile } from '../files/deleteFiles'
import { ARCHIVE_FOLDER, FILES_FOLDER, GENERIC_THUMBNAILS_FOLDER } from '../../constants'

const isManualCleanup: Boolean = process.argv[2] === '--cleanup'

interface FilePathData {
  id: number
  filePath: string
}
const processMissingFileLinks = async () => {
  const fileIdsToBeDeleted: number[] = []
  let offset = 0
  let filePaths: FilePathData[] = await DBConnect.getFilePaths(BATCH_SIZE, offset)

  while (filePaths.length > 0) {
    filePaths.forEach(({ id, filePath }) => {
      if (!fs.existsSync(path.join(FILES_FOLDER, filePath))) fileIdsToBeDeleted.push(id)
    })
    offset += BATCH_SIZE
    filePaths = await DBConnect.getFilePaths(BATCH_SIZE, offset)
  }

  await DBConnect.deleteMissingFileRecords(fileIdsToBeDeleted)
  return fileIdsToBeDeleted.length
}

export const cleanUpFiles = async () => {
  try {
    let filesMissingRecords = 0

    // Check if file in database and delete if not
    const checkFile = async (filePath: string) => {
      if (path.dirname(filePath) === GENERIC_THUMBNAILS_FOLDER) return
      if (path.dirname(filePath).startsWith(ARCHIVE_FOLDER)) return

      const relativeFilePath = filePath.replace(FILES_FOLDER + '/', '')
      const isFileInDatabase = await DBConnect.checkIfInFileTable(relativeFilePath)
      if (!isFileInDatabase) {
        deleteFile({ filePath: relativeFilePath })
        filesMissingRecords++
      }
    }
    console.log(
      DateTime.now().toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS),
      'Cleaning up files and file records...'
    )
    await crawlFileSystem(FILES_FOLDER, checkFile)
    await clearEmptyDirectories(FILES_FOLDER)
    const recordsMissingFiles = await processMissingFileLinks()
    const filesCleanedUp = await DBConnect.cleanUpFiles()

    console.log(`\nFiles deleted that weren't in database: ${filesMissingRecords}`)
    console.log(`File records removed due to missing files: ${recordsMissingFiles}`)
    console.log(`Additional files cleaned up (e.g. previews): ${filesCleanedUp}`)
  } catch (err) {
    console.log('ERROR', errorMessage(err))
  }
}

// Manually launch cleanup with command `yarn cleanup`
if (isManualCleanup) {
  cleanUpFiles().then(() => {
    console.log('File cleanup -- Done!\n')
    process.exit(0)
  })
}

export default cleanUpFiles
