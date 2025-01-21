import fs from 'fs'
import fsx from 'fs-extra'
import archiver from 'archiver'
import {
  ArchiveInfo,
  ArchiveOption,
  SnapshotInfo,
  SnapshotOperation,
} from '../exportAndImport/types'
import path from 'path'
import { execSync } from 'child_process'
import {
  DEFAULT_SNAPSHOT_NAME,
  INFO_FILE_NAME,
  SNAPSHOT_FOLDER,
  FILES_FOLDER,
  LOCALISATION_FOLDER,
  PREFERENCES_FILE,
  ARCHIVE_SUBFOLDER_NAME,
  GENERIC_THUMBNAILS_FOLDER,
  ARCHIVE_FOLDER,
  SNAPSHOT_ARCHIVES_FOLDER_NAME,
} from '../../constants'
import DBConnect from '../../../src/components/database/databaseConnect'
import config from '../../config'
import { DateTime } from 'luxon'
import { createDefaultDataFolders } from '../files/createDefaultFolders'
import { getArchiveFolders } from '../files/helpers'
import { errorMessage } from '../utilityFunctions'
import { cleanupDataTables } from '../../lookup-table/utils/cleanupDataTables'

const TEMP_SNAPSHOT_FOLDER_NAME = '__tempSnapshot'
const TEMP_ARCHIVE_FOLDER_NAME = '__tempArchive'

const takeSnapshot: SnapshotOperation = async ({
  snapshotName = DEFAULT_SNAPSHOT_NAME,
  snapshotType = 'normal',
  archive,
}) => {
  // Ensure relevant folders exist
  createDefaultDataFolders()

  await cleanupDataTables()

  let archiveInfo: ArchiveInfo = null

  const isArchiveSnapshot = snapshotType === 'archive'

  try {
    console.log(`Taking ${isArchiveSnapshot ? 'Archive ' : ''}snapshot, name: ${snapshotName}`)

    const tempFolder = path.join(SNAPSHOT_FOLDER, TEMP_SNAPSHOT_FOLDER_NAME)
    const tempArchiveFolder = path.join(SNAPSHOT_FOLDER, TEMP_ARCHIVE_FOLDER_NAME)
    await fsx.emptyDir(tempFolder)

    // Write snapshot/database to folder
    if (!isArchiveSnapshot) {
      console.log('Dumping database...')
      execSync(`pg_dump -U postgres tmf_app_manager --format=custom -f ${tempFolder}/database.dump`)
      // This plain-text .sql script is NOT used for re-import, but could be
      // useful for debugging when dealing with troublesome snapshots
      // execSync(
      //   `pg_dump -U postgres tmf_app_manager --format=plain --inserts --clean --if-exists -f ${tempFolder}/database.sql`
      // )
      console.log('Dumping database...done')

      // Copy ALL files
      await copyFiles(tempFolder)
      archiveInfo = await copyArchiveFiles(tempFolder, archive)
    } else {
      // Archive snapshot
      archiveInfo = await copyArchiveFiles(tempFolder, archive)

      // Move archive files to archive temp folder
      await fsx.move(path.join(tempFolder, 'files', ARCHIVE_SUBFOLDER_NAME), tempArchiveFolder)
    }

    // Copy localisation
    if (!isArchiveSnapshot) execSync(`cp -r '${LOCALISATION_FOLDER}/' '${tempFolder}/localisation'`)

    // Copy prefs
    if (!isArchiveSnapshot) execSync(`cp '${PREFERENCES_FILE}' '${tempFolder}'`)

    const sourceFolder = isArchiveSnapshot ? tempArchiveFolder : tempFolder

    // Save snapshot info (version, timestamp, etc)
    const info = getSnapshotInfo(archiveInfo)
    await fs.promises.writeFile(
      path.join(sourceFolder, `${INFO_FILE_NAME}.json`),
      JSON.stringify(info, null, ' ')
    )

    // Snapshot folder to include timestamp
    const timestampString = DateTime.fromISO(info.timestamp).toFormat('yyyy-LL-dd_HH-mm-ss')
    const newFolderName = `${snapshotName}_${timestampString}`

    const fullFolderPath = path.join(
      SNAPSHOT_FOLDER,
      isArchiveSnapshot ? SNAPSHOT_ARCHIVES_FOLDER_NAME : '',
      newFolderName
    )

    const isBackup = snapshotType === 'backup'

    if (!isBackup) await zipSnapshot(sourceFolder, newFolderName)

    await fs.promises.rename(sourceFolder, fullFolderPath)
    if (isArchiveSnapshot && !isBackup)
      await fs.promises.rename(
        path.join(SNAPSHOT_FOLDER, `${newFolderName}.zip`),
        path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, `${newFolderName}.zip`)
      )

    await fsx.remove(tempArchiveFolder)
    await fsx.remove(tempFolder)

    // Store snapshot name in database (for full exports only, but not backups)
    if (!isBackup) {
      await DBConnect.setSystemInfo('snapshot', newFolderName)
    }

    console.log('Taking snapshot...complete!')

    return { success: true, message: `created snapshot ${snapshotName}`, snapshot: newFolderName }
  } catch (e) {
    return { success: false, message: 'error while taking snapshot', error: errorMessage(e) }
  }
}

export const zipSnapshot = async (
  snapshotFolder: string,
  snapshotName: string,
  destination = SNAPSHOT_FOLDER
) => {
  console.log('Zipping snapshot...')
  const output = await fs.createWriteStream(path.join(destination, `${snapshotName}.zip`))
  const archive = archiver('zip', { zlib: { level: 9 } })

  await archive.pipe(output)
  await archive.directory(snapshotFolder, false)
  await archive.finalize()
  console.log('Zipping snapshot...done')
}

const getSnapshotInfo = (archiveInfo: ArchiveInfo = null) => {
  const snapshotInfo: SnapshotInfo = {
    timestamp: DateTime.now().toISO(),
    version: config.version,
  }
  if (archiveInfo === null) return snapshotInfo

  snapshotInfo.archive = archiveInfo
  return snapshotInfo
}

const copyFiles = async (newSnapshotFolder: string) => {
  const archiveRegex = new RegExp(`.+${config.filesFolder}\/${ARCHIVE_SUBFOLDER_NAME}.*`)

  console.log('Exporting files...')

  // Copy files but not archive
  await fsx.copy(FILES_FOLDER, path.join(newSnapshotFolder, 'files'), {
    filter: (src) => {
      if (src === FILES_FOLDER) return true
      if (src === GENERIC_THUMBNAILS_FOLDER) return false
      return !archiveRegex.test(src)
    },
  })

  console.log('Exporting files...done')
}

const copyArchiveFiles = async (
  newSnapshotFolder: string,
  archiveOption: ArchiveOption = 'full'
): Promise<ArchiveInfo> => {
  console.log('Exporting archive data & files...')

  // Figure out which archive folders we want
  let archiveFolders: string[]
  if (archiveOption === 'none') archiveFolders = []
  else if (archiveOption === 'full') archiveFolders = await getArchiveFolders()
  else archiveFolders = await getArchiveFolders(archiveOption)

  let archiveFrom = Infinity
  let archiveTo = 0

  // Copy the archive folders
  for (const folder of archiveFolders) {
    await fsx.copy(
      path.join(ARCHIVE_FOLDER, folder),
      path.join(newSnapshotFolder, 'files', ARCHIVE_SUBFOLDER_NAME, folder)
    )
    const info = await fsx.readJson(path.join(ARCHIVE_FOLDER, folder, 'info.json'))
    if (info.timestamp < archiveFrom) archiveFrom = info.timestamp
    if (info.timestamp > archiveTo) archiveTo = info.timestamp
  }

  console.log('Exporting archive data & files...done')

  // And copy the archive meta-data
  try {
    await fsx.copy(
      path.join(ARCHIVE_FOLDER, 'archive.json'),
      path.join(newSnapshotFolder, 'files', ARCHIVE_SUBFOLDER_NAME, 'archive.json')
    )
  } catch {
    // No archive.json yet
    return null
  }

  if (archiveOption === 'none') return { type: 'none' }
  if (archiveOption === 'full')
    return {
      type: 'full',
      from: DateTime.fromMillis(archiveFrom).toISO(),
      to: DateTime.fromMillis(archiveTo).toISO(),
    }
  return {
    type: 'partial',
    from: DateTime.fromMillis(archiveFrom).toISO(),
    to: DateTime.fromMillis(archiveTo).toISO(),
  }
}

export default takeSnapshot
