import fs from 'fs/promises'
import fsSync from 'fs'
import fsx from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import StreamZip from 'node-stream-zip'
import DBConnect from '../../../src/components/database/databaseConnect'
import { updateRowPolicies } from '../permissions/rowLevelPolicyHelpers'
import { SnapshotOperation } from '../exportAndImport/types'
import semverCompare from 'semver/functions/compare'
import config, { refreshConfig } from '../../../src/config'
// @ts-ignore
import delay from 'delay-sync'
import { createDefaultDataFolders } from '../files/createDefaultFolders'
import migrateData from '../../../database/migration/migrateData'
import {
  FILES_FOLDER,
  SNAPSHOT_FOLDER,
  PREFERENCES_FILE,
  INFO_FILE_NAME,
  PREFERENCES_FOLDER,
  ARCHIVE_TEMP_FOLDER,
  ARCHIVE_SUBFOLDER_NAME,
  LOCALISATION_FOLDER,
  ARCHIVE_FOLDER,
  ARCHIVE_TEMP_FOLDER_NAME,
} from '../../constants'
import { findArchiveSources } from '../files/helpers'
import { errorMessage } from '../utilityFunctions'
import { cleanupDataTables } from '../../lookup-table/utils/cleanupDataTables'
import { getTimeString } from './takeSnapshot'

const useSnapshot: SnapshotOperation = async ({ snapshotName }) => {
  const startTime = Date.now()

  // Ensure relevant folders exist
  createDefaultDataFolders()

  try {
    console.log(`Restoring snapshot: ${snapshotName}`)

    const snapshotFolder = path.join(SNAPSHOT_FOLDER, snapshotName)

    if (!fsx.existsSync(snapshotFolder)) {
      if (!fsx.existsSync(`${snapshotFolder}.zip`))
        throw new Error('Snapshot missing: ' + snapshotName)

      // If the folder doesn't exist, but the .zip file does, then unzip it and
      // carry on
      console.log('Unzipping ' + `${snapshotFolder}.zip`)
      await fsx.ensureDir(snapshotFolder)
      const zip = new StreamZip.async({ file: `${snapshotFolder}.zip` })
      await zip.extract(null, snapshotFolder)
      await zip.close()
    }

    // Don't proceed if snapshot version higher than current installation
    const infoFile = path.join(snapshotFolder, `${INFO_FILE_NAME}.json`)
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
    const archiveCollectStartTime = Date.now()
    await collectArchives(snapshotFolder)
    console.log(`Collecting archives...done in ${getTimeString(archiveCollectStartTime)}`)

    // Reset existing files folder (but keep temp archives)
    await removeFiles()

    console.log('Restoring database...')
    const databaseStartTime = Date.now()

    // Safer to drop and recreate whole schema, as there can be errors when
    // trying to drop individual objects using --clean, especially if the
    // incoming database differs from the current database, schema-wise
    execSync(
      `psql -U postgres -d tmf_app_manager -c 'DROP schema public CASCADE;' > /dev/null 2>&1`
    )
    execSync(`psql -U postgres -d tmf_app_manager -c 'CREATE schema public;'`)
    execSync(
      `pg_restore -U postgres --clean --if-exists --dbname tmf_app_manager ${snapshotFolder}/database.dump`
    )

    console.log(`Restoring database...done in ${getTimeString(databaseStartTime)}`)

    // Copy files
    console.log('Importing files...')
    const fileCopyStartTime = Date.now()
    await copyFiles(snapshotFolder)
    console.log(`Importing files...done in ${getTimeString(fileCopyStartTime)}`)

    // Import preferences
    try {
      console.log('Importing preferences')
      await fsx.emptyDir(PREFERENCES_FOLDER)
      await fsx.copy(path.join(snapshotFolder, 'preferences.json'), PREFERENCES_FILE)
    } catch (e) {
      console.log("Couldn't import preferences")
      console.log((e as Error).message)
    }

    // Import localisation
    try {
      console.log('Importing localisations')
      await fsx.emptyDir(LOCALISATION_FOLDER)
      await fsx.copy(path.join(snapshotFolder, 'localisation'), LOCALISATION_FOLDER)
    } catch (e) {
      console.log("Couldn't import localisations")
      console.log((e as Error).message)
    }

    // Pause to allow postgraphile "watch" to detect changed schema
    delay(1500)

    // Migrate database to latest version
    console.log('Migrating database (if required)...)')
    await migrateData()

    // Regenerate row level policies
    await updateRowPolicies()

    // To ensure generic thumbnails are not wiped out, even if server doesn't restart
    createDefaultDataFolders()

    // Store snapshot name in database
    const text = `INSERT INTO system_info (name, value)
      VALUES('snapshot', $1)`
    await DBConnect.query({
      text,
      values: [JSON.stringify(snapshotName)],
    })

    await cleanupDataTables()

    refreshConfig(config)

    console.log('...Snapshot load complete!')
    console.log('Total time:', getTimeString(startTime))

    return { success: true, message: `snapshot loaded ${snapshotName}` }
  } catch (e) {
    return { success: false, message: 'error while loading snapshot', error: errorMessage(e) }
  }
}

const copyFiles = async (snapshotFolder: string) => {
  // Copy files but not archive
  const archiveRegex = new RegExp(`.+\/${ARCHIVE_SUBFOLDER_NAME}.*`)
  await fsx.copy(path.join(snapshotFolder, 'files'), FILES_FOLDER, {
    filter: (src) => {
      if (src === FILES_FOLDER) return true
      return !archiveRegex.test(src)
    },
    overwrite: true,
  })
  // Restore the temp archives folder
  await fsx.emptyDir(path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME))
  await fsx.move(ARCHIVE_TEMP_FOLDER, path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME), {
    overwrite: true,
  })

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

// Removes the contents of the "files" folder, *except* for the Temp Archives
const removeFiles = async () => {
  const contents = await fsx.readdir(FILES_FOLDER)
  for (const item of contents) {
    if (item === ARCHIVE_TEMP_FOLDER_NAME) continue
    await fsx.remove(path.join(FILES_FOLDER, item))
  }
}

const collectArchives = async (snapshotFolder: string) => {
  const archiveSources = await findArchiveSources(snapshotFolder)
  // Copy all archives to temp folder
  await fsx.emptyDir(ARCHIVE_TEMP_FOLDER)
  for (const [source, folder] of archiveSources) {
    // For archives that are already in the current active system
    // (`/files/_ARCHIVE`), it's a lot faster to just MOVE them rather than
    // copy. Archives found elsewhere must be copied, as we don't want to
    // destroy the source.
    if (source.startsWith(ARCHIVE_FOLDER)) {
      console.log('Moving current archive:', folder)
      await fsx.move(path.join(source, folder), path.join(ARCHIVE_TEMP_FOLDER, folder))
    } else {
      console.log('Copying stored archive:', folder)
      await fsx.copy(path.join(source, folder), path.join(ARCHIVE_TEMP_FOLDER, folder))
    }
  }
}

export default useSnapshot
