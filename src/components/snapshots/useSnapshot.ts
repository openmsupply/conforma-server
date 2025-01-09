import fs from 'fs/promises'
import fsSync from 'fs'
import fsx from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import insertData from '../../../database/insertData'
import DBConnect from '../../../src/components/database/databaseConnect'
import { updateRowPolicies } from '../permissions/rowLevelPolicyHelpers'
import { SnapshotOperation, ExportAndImportOptions, ObjectRecord } from '../exportAndImport/types'
import semverCompare from 'semver/functions/compare'
import config, { refreshConfig } from '../../../src/config'
// @ts-ignore
import delay from 'delay-sync'
import { createDefaultDataFolders } from '../files/createDefaultFolders'
import migrateData from '../../../database/migration/migrateData'
import {
  DEFAULT_SNAPSHOT_NAME,
  OPTIONS_FILE_NAME,
  FILES_FOLDER,
  SNAPSHOT_FOLDER,
  SNAPSHOT_OPTIONS_FOLDER,
  PREFERENCES_FILE,
  INFO_FILE_NAME,
  PREFERENCES_FOLDER,
  ARCHIVE_TEMP_FOLDER,
  ARCHIVE_SUBFOLDER_NAME,
} from '../../constants'
import { findArchiveSources } from '../files/helpers'
import { errorMessage } from '../utilityFunctions'
import { cleanupDataTables } from '../../lookup-table/utils/cleanupDataTables'

const useSnapshot: SnapshotOperation = async ({
  snapshotName = DEFAULT_SNAPSHOT_NAME,
  optionsName,
  options: inOptions,
}) => {
  // Ensure relevant folders exist
  createDefaultDataFolders()

  try {
    console.log(`Using snapshot: ${snapshotName}`)

    const snapshotFolder = path.join(SNAPSHOT_FOLDER, snapshotName)

    const options = await getOptions(snapshotFolder, optionsName, inOptions)

    // Don't proceed if snapshot version higher than current installation
    const infoFile = path.join(snapshotFolder, `${INFO_FILE_NAME}.json`)
    console.log(`Checking snapshot version...`)
    const snapshotVersion = fsSync.existsSync(infoFile)
      ? JSON.parse(
          await fs.readFile(infoFile, {
            encoding: 'utf-8',
          })
        ).version
      : '0.0.0'
    if (semverCompare(snapshotVersion, config.version) === 1) {
      throw new Error(
        `Snapshot was created with Conforma version: ${snapshotVersion}\n You can't install a snapshot created with a version newer than the current application version: ${config.version}`
      )
    }
    if (semverCompare(snapshotVersion, '0.8.0') === -1) {
      throw new Error(
        `Snapshot was created with a Conforma version prior to 0.8.0, so its database is incompatible with current versions of Postgres. Please use the v.0.8.0 Docker build, or v0.8.0 git tag (with PG12.17) to import and re-export this snapshot to make it compatible with this version of Conforma.`
      )
    }

    // Check that we can find all the archives needed:
    console.log('Collecting archives...')
    await collectArchives(snapshotFolder)
    console.log('Collecting archives...done')

    if (options.resetFiles) {
      execSync(`rm -rf ${FILES_FOLDER}/*`)
    }

    console.log('Restoring database...')

    // Safer to drop and recreate whole schema, as there can be errors when
    // trying to drop individual objects using --clean, especially if the
    // incoming database differs from the current database, schema-wise
    execSync(`psql -U postgres -d tmf_app_manager -c 'DROP schema public CASCADE;'`)
    execSync(`psql -U postgres -d tmf_app_manager -c 'CREATE schema public;'`)
    execSync(
      `pg_restore -U postgres --clean --if-exists --dbname tmf_app_manager ${snapshotFolder}/database.dump`
    )

    console.log('Restoring database...done')

    // Copy files
    await copyFiles(snapshotFolder)

    // Import preferences
    if (options?.includePrefs) {
      try {
        execSync(`rm -rf ${PREFERENCES_FOLDER}/*`)
        execSync(`cp '${snapshotFolder}/preferences.json' '${PREFERENCES_FILE}'`)
      } catch (e) {
        console.log("Couldn't import preferences")
      }
    }

    // Pause to allow postgraphile "watch" to detect changed schema
    delay(1500)

    // Migrate database to latest version
    if (options.shouldReInitialise) {
      console.log('Migrating database (if required)...)')
      await migrateData()
    }

    // Regenerate row level policies
    await updateRowPolicies()

    // To ensure generic thumbnails are not wiped out, even if server doesn't restart
    createDefaultDataFolders()

    // Store snapshot name in database (for full imports only)
    if (options.shouldReInitialise) {
      const text = `INSERT INTO system_info (name, value)
      VALUES('snapshot', $1)`
      await DBConnect.query({
        text,
        values: [JSON.stringify(snapshotName)],
      })
    }

    await cleanupDataTables()

    refreshConfig(config)

    console.log('...Snapshot load complete!')

    return { success: true, message: `snapshot loaded ${snapshotName}` }
  } catch (e) {
    return { success: false, message: 'error while loading snapshot', error: errorMessage(e) }
  }
}

const getOptions = async (
  snapshotFolder: string,
  optionsName?: string,
  options?: ExportAndImportOptions
) => {
  if (options) {
    console.log('use options passed as a parameter')
    return options
  }
  let optionsFile = path.join(snapshotFolder, `${OPTIONS_FILE_NAME}.json`)

  if (optionsName) optionsFile = path.join(SNAPSHOT_OPTIONS_FOLDER, `${optionsName}.json`)
  console.log(`using options from: ${optionsFile}`)
  const optionsRaw = await fs.readFile(optionsFile, {
    encoding: 'utf-8',
  })

  return JSON.parse(optionsRaw)
}

export const getDirectoryFromPath = (filePath: string) => {
  const [_, ...directory] = filePath.split('/').reverse()
  return directory.join('/')
}

const copyFiles = async (snapshotFolder: string) => {
  console.log('Importing files...')

  // Copy files but not archive
  const archiveRegex = new RegExp(`.+\/${ARCHIVE_SUBFOLDER_NAME}.*`)
  await fsx.copy(path.join(snapshotFolder, 'files'), FILES_FOLDER, {
    filter: (src) => {
      if (src === FILES_FOLDER) return true
      return !archiveRegex.test(src)
    },
  })
  // Restore the temp archives folder
  await fsx.move(ARCHIVE_TEMP_FOLDER, path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME))
  console.log('Importing files...done')

  // Restore "archive.json" from snapshot
  try {
    await fsx.copy(
      path.join(snapshotFolder, 'files', ARCHIVE_SUBFOLDER_NAME, 'archive.json'),
      path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME, 'archive.json')
    )
  } catch {
    console.log('No archive.json in snapshot')
  }
}

const collectArchives = async (snapshotFolder: string) => {
  const archiveSources = await findArchiveSources(snapshotFolder)
  // Copy all archives to temp folder
  await fsx.emptyDir(ARCHIVE_TEMP_FOLDER)
  for (const [source, folder] of archiveSources) {
    await fsx.copy(path.join(source, folder), path.join(ARCHIVE_TEMP_FOLDER, folder))
  }
}

export default useSnapshot
