import fs from 'fs/promises'
import fsSync from 'fs'
import fsx from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import insertData from '../../../database/insertData'
import DBConnect from '../../../src/components/database/databaseConnect'
import { updateRowPolicies } from '../permissions/rowLevelPolicyHelpers'
import { SnapshotOperation, ExportAndImportOptions, ObjectRecord } from '../exportAndImport/types'
import importFromJson from '../exportAndImport/importFromJson'
import { triggerTables } from './triggerTables'
import semverCompare from 'semver/functions/compare'
import config, { refreshConfig } from '../../../src/config'
// @ts-ignore
import delay from 'delay-sync'
import { createDefaultDataFolders } from '../files/createDefaultFolders'
import migrateData from '../../../database/migration/migrateData'
import {
  DEFAULT_SNAPSHOT_NAME,
  SNAPSHOT_FILE_NAME,
  OPTIONS_FILE_NAME,
  PG_SCHEMA_DIFF_FILE_NAME,
  FILES_FOLDER,
  ROOT_FOLDER,
  SNAPSHOT_FOLDER,
  SNAPSHOT_OPTIONS_FOLDER,
  LOCALISATION_FOLDER,
  PREFERENCES_FILE,
  SCHEMA_FILE_NAME,
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
    if (semverCompare(snapshotVersion, '0.8.0') === -1 && options.usePgDump) {
      throw new Error(
        `Snapshot was created with a Conforma version prior to 0.8.0, so its database is incompatible with current versions of Postgres. Please use the v.0.8.0 Docker build, or v0.8.0 git tag (with PG12.17) to import and re-export this snapshot to make it compatible with this version of Conforma.`
      )
    }

    // Check that we can find all the archives needed:
    console.log('Collecting archives...')
    await collectArchives(snapshotFolder)
    console.log('Collecting archives...done')

    if (options.resetFiles || options.usePgDump) {
      execSync(`rm -rf ${FILES_FOLDER}/*`)
    }

    if (options.usePgDump) {
      // The quick way, using pg_restore (whole database only, no partial
      // exports)
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
    } else {
      // The old way, using JSON database object export. Deprecated for full
      // database export, but kept here for backwards compatibility, and for
      // "custom" (i.e. not full database) snapshots (eg. template
      // import/export)
      const snapshotRaw = await fs.readFile(
        path.join(snapshotFolder, `${SNAPSHOT_FILE_NAME}.json`),
        {
          encoding: 'utf-8',
        }
      )
      const snapshotObject = JSON.parse(snapshotRaw)

      if (options.shouldReInitialise) {
        await initialiseDatabase(options, snapshotFolder)
      }

      // Prevent triggers from running while we insert data, but only for full re-init
      if (options.shouldReInitialise) {
        triggerTables.forEach((table) => {
          execSync(
            `psql -U postgres -d tmf_app_manager -c "ALTER TABLE ${table} DISABLE TRIGGER ALL"`
          )
        })
      }

      console.log('inserting from snapshot ... ')
      const insertedRecords = await importFromJson(
        snapshotObject,
        options,
        options.shouldReInitialise
      )
      console.log('inserting from snapshot ... done')

      // Update serials
      console.log('running serial update ... ')
      execSync('./database/update_serials.sh', { cwd: ROOT_FOLDER, stdio: 'inherit' })
      console.log('running serial update ... done')

      // Re-enable triggers
      triggerTables.forEach((table) => {
        execSync(`psql -U postgres -d tmf_app_manager -c "ALTER TABLE ${table} ENABLE TRIGGER ALL"`)
      })

      await copyFilesPartial(snapshotFolder, insertedRecords.file)
    }

    // Import localisations
    if (options?.includeLocalisation) {
      try {
        execSync(`rm -rf ${LOCALISATION_FOLDER}/*`)
        execSync(`cp -r  '${snapshotFolder}/localisation/.' '${LOCALISATION_FOLDER}' `)
      } catch (e) {
        console.log("Couldn't import localisations")
      }
    }

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

const convertDeprecated = (options: ExportAndImportOptions) => {
  // see comment in ExportAndImportOptions type
  return {
    ...options,
    skipTableOnInsertFail: options.skipTableOnInsertFail || options.tablesToUpdateOnInsertFail,
  }
}

const getOptions = async (
  snapshotFolder: string,
  optionsName?: string,
  options?: ExportAndImportOptions
) => {
  if (options) {
    console.log('use options passed as a parameter')
    return convertDeprecated(options)
  }
  let optionsFile = path.join(snapshotFolder, `${OPTIONS_FILE_NAME}.json`)

  if (optionsName) optionsFile = path.join(SNAPSHOT_OPTIONS_FOLDER, `${optionsName}.json`)
  console.log(`using options from: ${optionsFile}`)
  const optionsRaw = await fs.readFile(optionsFile, {
    encoding: 'utf-8',
  })

  return convertDeprecated(JSON.parse(optionsRaw) as ExportAndImportOptions)
}

const initialiseDatabase = async (
  { insertScriptsLocale, includeInsertScripts, excludeInsertScripts }: ExportAndImportOptions,
  snapshotFolder: string
) => {
  const databaseName = 'tmf_app_manager'

  // Check if the snapshot has its own schema script
  const initScript = fsSync.existsSync(path.join(snapshotFolder, `${SCHEMA_FILE_NAME}.sql`))
    ? `${path.join(snapshotFolder, SCHEMA_FILE_NAME)}.sql`
    : ''

  console.log('initialising database ... ')

  execSync(`./database/initialise_database.sh ${databaseName} ${initScript}`, {
    cwd: ROOT_FOLDER,
    stdio: 'inherit',
  })
  console.log('initialising database ... done')

  const diffFile = path.join(snapshotFolder, `${PG_SCHEMA_DIFF_FILE_NAME}.sql`)
  if (fsSync.existsSync(diffFile)) {
    console.log('adding changes to schema ... ')

    let dbPatch = `psql -v -U postgres -q -b -d ${databaseName} -f "${diffFile}"`

    // run db patch twice (in silenced error mode), to make sure references that were not met the first time will be met the second time
    execSync(dbPatch, { cwd: ROOT_FOLDER })
    execSync(dbPatch, { cwd: ROOT_FOLDER })

    console.log('adding changes to schema ... done')
  }

  console.log('inserting core data ... ')
  await insertData(insertScriptsLocale, includeInsertScripts, excludeInsertScripts)
  console.log('inserting core data ... done')
}

export const getDirectoryFromPath = (filePath: string) => {
  const [_, ...directory] = filePath.split('/').reverse()
  return directory.join('/')
}

const copyFilesPartial = async (snapshotFolder: string, fileRecords: ObjectRecord[] = []) => {
  // copy only files that associated with import file records
  const filePaths = fileRecords.map((oldAndNewFileRecord) => oldAndNewFileRecord.new.filePath)
  filePaths.push(...fileRecords.map((oldAndNewFileRecord) => oldAndNewFileRecord.new.thumbnailPath))
  const snapshotFilesFolder = `${snapshotFolder}/files`

  for (const filePath of [...filePaths]) {
    try {
      if (path.dirname(filePath) !== config.genericThumbnailsFolderName) {
        console.log('copying file', filePath)

        const destinationDirectory = `${FILES_FOLDER}/${getDirectoryFromPath(filePath)}`
        // -p = no error if exists, create parent
        execSync(`mkdir -p '${destinationDirectory}'`)

        execSync(`cp '${snapshotFilesFolder}/${filePath}' '${destinationDirectory}'`)
      }
    } catch (e) {
      console.log('failed to copy file', e)
    }
  }
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
