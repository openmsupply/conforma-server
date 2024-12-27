import path from 'path'
import { getAppEntryPointDir } from './components/utilityFunctions'
import config from './config'

export const DEFAULT_SNAPSHOT_NAME = 'current'
export const BASE_SNAPSHOT_NAME = 'core_templates'
export const DEFAULT_OPTIONS_NAME = 'default'
export const SNAPSHOT_SUBFOLDER = '_snapshots'
export const OPTIONS_SUBFOLDER = 'snapshotOptions'
export const SNAPSHOT_FILE_NAME = 'snapshot'
export const ARCHIVE_SUBFOLDER_NAME = '_ARCHIVE'
export const ARCHIVE_TEMP_FOLDER_NAME = 'TEMP_Archives'
export const SNAPSHOT_ARCHIVES_FOLDER_NAME = '_archives'
export const OPTIONS_FILE_NAME = 'options'
export const FILES_TEMP_FOLDER_NAME = '__TEMP_Files'
export const INFO_FILE_NAME = 'info'
export const SCHEMA_FILE_NAME = 'schema_init'
export const PG_DIFF_CONFIG_FILE_NAME = 'pg-diff-config'
export const PG_SCHEMA_DIFF_FILE_NAME = 'schema_diff'
export const PREFERENCES_FILE_NAME = config.preferencesFileName
export const DEFAULT_LOGOUT_TIME = 60 // Minutes

export const DEFAULT_THUMBNAIL_MAX_WIDTH = 300
export const DEFAULT_THUMBNAIL_MAX_HEIGHT = 300

export const MAX_32_BIT_INT = 2_147_483_647

export const ROOT_FOLDER = path.join(getAppEntryPointDir(), '../')
export const DATABASE_FOLDER = path.join(getAppEntryPointDir(), config.databaseFolder)
export const SNAPSHOT_FOLDER = path.join(DATABASE_FOLDER, SNAPSHOT_SUBFOLDER)
export const SNAPSHOT_OPTIONS_FOLDER = path.join(DATABASE_FOLDER, OPTIONS_SUBFOLDER)
export const SNAPSHOT_ARCHIVE_FOLDER = path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME)
export const BACKUPS_FOLDER = path.join(getAppEntryPointDir(), config.backupsFolder)
export const FILES_FOLDER = path.join(getAppEntryPointDir(), config.filesFolder)
export const ARCHIVE_FOLDER = path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME)
export const ARCHIVE_TEMP_FOLDER = path.join(getAppEntryPointDir(), ARCHIVE_TEMP_FOLDER_NAME)
export const FILES_TEMP_FOLDER = path.join(FILES_FOLDER, FILES_TEMP_FOLDER_NAME)
export const IMAGES_FOLDER = path.join(getAppEntryPointDir(), config.imagesFolder)
export const LOCALISATION_FOLDER = path.join(getAppEntryPointDir(), config.localisationsFolder)
export const PREFERENCES_FOLDER = path.join(getAppEntryPointDir(), config.preferencesFolder)
export const PREFERENCES_FILE = path.join(PREFERENCES_FOLDER, PREFERENCES_FILE_NAME)
export const GENERIC_THUMBNAILS_SOURCE_FOLDER = path.join(
  getAppEntryPointDir(),
  config.imagesFolder,
  'generic_file_thumbnails'
)
export const GENERIC_THUMBNAILS_FOLDER = path.join(FILES_FOLDER, config.genericThumbnailsFolderName)
export const BASE_SNAPSHOT_FOLDER = path.join(DATABASE_FOLDER, BASE_SNAPSHOT_NAME)
export const PG_DFF_JS_LOCATION = path.join(
  getAppEntryPointDir(),
  config.nodeModulesFolder,
  'pg-diff-cli',
  'main.js'
)
