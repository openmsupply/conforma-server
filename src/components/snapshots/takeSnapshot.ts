import fs from 'fs'
import fsx from 'fs-extra'
import archiver from 'archiver'
import {
  ArchiveInfo,
  ArchiveOption,
  ExportAndImportOptions,
  ObjectRecord,
  SnapshotInfo,
  SnapshotOperation,
} from '../exportAndImport/types'
import path from 'path'
import { execSync } from 'child_process'
import getRecordsAsObject from '../exportAndImport/exportToJson'
import pgDiffConfig from './pgDiffConfig.json'
import {
  DEFAULT_SNAPSHOT_NAME,
  DEFAULT_OPTIONS_NAME,
  SNAPSHOT_FILE_NAME,
  OPTIONS_FILE_NAME,
  INFO_FILE_NAME,
  PG_DIFF_CONFIG_FILE_NAME,
  PG_SCHEMA_DIFF_FILE_NAME,
  ROOT_FOLDER,
  SNAPSHOT_FOLDER,
  SNAPSHOT_OPTIONS_FOLDER,
  FILES_FOLDER,
  LOCALISATION_FOLDER,
  SCHEMA_FILE_NAME,
  PREFERENCES_FILE,
  PG_DFF_JS_LOCATION,
  DATABASE_FOLDER,
  ARCHIVE_SUBFOLDER_NAME,
  GENERIC_THUMBNAILS_FOLDER,
  ARCHIVE_FOLDER,
  SNAPSHOT_ARCHIVES_FOLDER_NAME,
} from '../../constants'
import { getDirectoryFromPath } from './useSnapshot'
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
  optionsName = DEFAULT_OPTIONS_NAME,
  options: inOptions,
  extraOptions = {},
  isArchiveSnapshot = false,
}) => {
  // Ensure relevant folders exist
  createDefaultDataFolders()

  await cleanupDataTables()

  let archiveInfo: ArchiveInfo = null

  const options = await getOptions(optionsName, inOptions, extraOptions)

  try {
    console.log(`Taking ${isArchiveSnapshot ? 'Archive ' : ''}snapshot, name: ${snapshotName}`)

    const tempFolder = path.join(SNAPSHOT_FOLDER, TEMP_SNAPSHOT_FOLDER_NAME)
    const tempArchiveFolder = path.join(SNAPSHOT_FOLDER, TEMP_ARCHIVE_FOLDER_NAME)
    await fsx.emptyDir(tempFolder)

    // Write snapshot/database to folder
    if (!isArchiveSnapshot) {
      if (options.usePgDump) {
        // The quick way, using pg_dump -- whole database only
        console.log('Dumping database...')
        execSync(
          `pg_dump -U postgres tmf_app_manager --format=custom -f ${tempFolder}/database.dump`
        )
        // This plain-text .sql script is NOT used for re-import, but could be
        // useful for debugging when dealing with troublesome snapshots
        // execSync(
        //   `pg_dump -U postgres tmf_app_manager --format=plain --inserts --clean --if-exists -f ${tempFolder}/database.sql`
        // )
        console.log('Dumping database...done')

        // Copy ALL files
        await copyFiles(tempFolder)
        archiveInfo = await copyArchiveFiles(tempFolder, options.archive)
      } else {
        // Do it the old way, using JSON database object export
        const snapshotObject = await getRecordsAsObject(options)
        await fs.promises.writeFile(
          path.join(tempFolder, `${SNAPSHOT_FILE_NAME}.json`),
          JSON.stringify(snapshotObject, null, 2)
        )
        await copyFilesPartial(tempFolder, snapshotObject.file ?? [])
      }
    } else {
      // Archive snapshot
      archiveInfo = await copyArchiveFiles(tempFolder, options.archive)

      // Move archive files to archive temp folder
      await fsx.move(path.join(tempFolder, 'files', ARCHIVE_SUBFOLDER_NAME), tempArchiveFolder)
    }

    // Export config
    await fs.promises.writeFile(
      path.join(tempFolder, `${OPTIONS_FILE_NAME}.json`),
      JSON.stringify(options, null, ' ')
    )

    if (options.shouldReInitialise && !options.usePgDump) {
      await getSchemaDiff(tempFolder)
      // Copy schema build script
      execSync(`cat ${DATABASE_FOLDER}/buildSchema/*.sql >> ${tempFolder}/${SCHEMA_FILE_NAME}.sql`)
    }

    // Copy localisation
    if (options?.includeLocalisation)
      execSync(`cp -r '${LOCALISATION_FOLDER}/' '${tempFolder}/localisation'`)

    // Copy prefs
    if (options?.includePrefs) execSync(`cp '${PREFERENCES_FILE}' '${tempFolder}'`)

    const sourceFolder = isArchiveSnapshot ? tempArchiveFolder : tempFolder

    // Save snapshot info (version, timestamp, etc)
    const info = getSnapshotInfo(archiveInfo)
    await fs.promises.writeFile(
      path.join(sourceFolder, `${INFO_FILE_NAME}.json`),
      JSON.stringify(info, null, ' ')
    )

    // Snapshot folder to include timestamp
    const timestampString = DateTime.fromISO(info.timestamp).toFormat('yyyy-LL-dd_HH-mm-ss')
    const newFolderName = options.usePgDump ? `${snapshotName}_${timestampString}` : snapshotName
    const fullName = options.usePgDump ? `${snapshotName}_${timestampString}` : snapshotName

    const fullFolderPath = path.join(
      SNAPSHOT_FOLDER,
      isArchiveSnapshot ? SNAPSHOT_ARCHIVES_FOLDER_NAME : '',
      newFolderName
    )

    if (!options.skipZip) await zipSnapshot(sourceFolder, fullName)

    await fs.promises.rename(sourceFolder, fullFolderPath)
    if (isArchiveSnapshot && !options.skipZip)
      await fs.promises.rename(
        path.join(SNAPSHOT_FOLDER, `${fullName}.zip`),
        path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, `${fullName}.zip`)
      )

    await fsx.remove(tempArchiveFolder)
    await fsx.remove(tempFolder)

    // Store snapshot name in database (for full exports only, but not backups)
    if (options.shouldReInitialise && !options.skipZip) {
      await DBConnect.setSystemInfo('snapshot', fullName)
    }

    console.log('Taking snapshot...complete!')

    return { success: true, message: `created snapshot ${snapshotName}`, snapshot: fullName }
  } catch (e) {
    return { success: false, message: 'error while taking snapshot', error: errorMessage(e) }
  }
}

const getOptions = async (
  optionsName?: string,
  options?: ExportAndImportOptions,
  extraOptions: Partial<ExportAndImportOptions> = {}
) => {
  if (options) {
    console.log('use options passed as a parameter')
    return { ...options, ...extraOptions }
  }

  const optionsFile = path.join(SNAPSHOT_OPTIONS_FOLDER, `${optionsName}.json`)

  console.log(`using options from: ${optionsFile}`)
  const optionsRaw = await fs.promises.readFile(optionsFile, {
    encoding: 'utf-8',
  })

  const parsedOptions = JSON.parse(optionsRaw) as ExportAndImportOptions

  return { ...parsedOptions, ...extraOptions }
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

const getSchemaDiff = async (newSnapshotFolder: string) => {
  console.log('creating schema diff ... ')
  // Creating db to compare to
  execSync('./database/initialise_database.sh tmf_app_manager_temp', { cwd: ROOT_FOLDER })

  // Changing pgDiff configuration output to new snapshot directory
  pgDiffConfig.development.compareOptions.outputDirectory = newSnapshotFolder

  await fs.promises.writeFile(
    path.join(ROOT_FOLDER, `${PG_DIFF_CONFIG_FILE_NAME}.json`),
    JSON.stringify(pgDiffConfig, null, ' ')
  )

  // Running diff command, node_modules folder location changes in production build
  execSync(`node ${PG_DFF_JS_LOCATION} -c development initial-script`, {
    cwd: ROOT_FOLDER,
  })
  // Rename diff file

  const diffFile = fs.readdirSync(newSnapshotFolder).find((file) => file.endsWith('.sql'))
  if (!diffFile) return

  fs.renameSync(
    path.join(newSnapshotFolder, diffFile),
    path.join(newSnapshotFolder, `${PG_SCHEMA_DIFF_FILE_NAME}.sql`)
  )

  console.log('creating schema diff ... done ')
}

// Copies a limited set of files, based on the records being exported. Usually
// used for template export (will copy linked carbone docs, for example).
const copyFilesPartial = async (newSnapshotFolder: string, fileRecords: ObjectRecord[]) => {
  // copy only files that associated with exported file records
  const filePaths = fileRecords.map((fileRecord) => fileRecord.filePath)
  filePaths.push(...fileRecords.map((fileRecord) => fileRecord.thumbnailPath))

  for (const filePath of [...filePaths]) {
    try {
      if (path.dirname(filePath) !== config.genericThumbnailsFolderName) {
        console.log('copying file', filePath)
        const destinationDirectory = `${newSnapshotFolder}/files/${getDirectoryFromPath(filePath)}`
        // -p = no error if exists, create parent
        execSync(`mkdir -p '${destinationDirectory}'`)

        execSync(`cp '${FILES_FOLDER}/${filePath}' '${destinationDirectory}'`)
      }
    } catch (e) {
      console.log('failed to copy file', e)
    }
  }
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
