require('dotenv').config()
import { DateTime, Settings } from 'luxon'
import { version } from '../package.json'
import { serverPrefKeys, ServerPreferences, WebAppPrefs, Config } from './types'
import { EventThrottle } from './components/actions/throttle'
import { readJsonSync } from 'fs-extra'
import path from 'path'
import { getAppEntryPointDir } from './components/utilityFunctions'
import { merge } from 'lodash'

const preferencesFolder = '../preferences'
const preferencesFileName = 'preferences.json'

const preferences = loadPrefs()

const serverPrefs: ServerPreferences = preferences.server as ServerPreferences
const isProductionBuild = process.env.NODE_ENV === 'production'
const siteHost = (preferences.web as WebAppPrefs)?.siteHost
const webHostUrl = process.env.WEB_HOST
const isLiveServer = getIsLiveServer(webHostUrl, siteHost)

// Change to true to force email server to use local Mailhog
const USE_MAIL_HOG = false

export type EmailOperationMode = 'LIVE' | 'TEST' | 'NONE' | 'MAILHOG'
/*
Operation modes:

- LIVE: Emails are sent normally according to action configurations
- TEST: All emails are sent to a single address, defined in server
  preferences "testingEmail" property. Used on testing servers or in
  development.
- NONE: No emails are sent at all. Used for automated testing, or when a
  "testingEmail" address is not provided.
- MAILHOG: All emails are relayed through a local MailHog SMTP server (so not
  actually sent). An alternative development mode.
*/

// Global Throttle instance, for spacing out processing when (potentially)
// several hundred events occur simultaneously, or for making sure a particular
// function waits till an existing (throttled) event is complete
const Throttle = new EventThrottle()

// Global config object
const config: Config = {
  pg_database_connection: {
    user: 'postgres',
    host: 'localhost',
    database: 'tmf_app_manager',
    password: '',
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  },
  version,
  graphQLendpoint: 'http://localhost:8080/graphql',
  // 'Folder path from perspective of server.ts/js'
  filesFolder: '../files',
  pluginsFolder: '../plugins',
  imagesFolder: '../images',
  databaseFolder: '../database',
  localisationsFolder: '../localisation',
  preferencesFolder,
  preferencesFileName,
  backupsFolder: '../backups',
  genericThumbnailsFolderName: '_generic_thumbnails',
  defaultUnderMaintenanceSite: 'https://msupply.foundation/projects/conforma',
  // In production postgraphile is started with -q and -i /postgraphile/...
  nodeModulesFolder:
    process.env.NODE_ENV === 'production' ? '../../node_modules' : '../node_modules',
  jwtSecret: process.env.JWT_SECRET || 'devsecret',
  RESTport: 8080,
  dataTablePrefix: 'data_table_', // snake_case
  // These are the only default tables in the system that we allow to be mutated
  // directly by modifyRecord or display as data views. All other names must
  // have "data_table_" prepended.
  allowedTableNames: ['user', 'organisation', 'application', 'file', 'data_changelog'],
  // From the above allowed tables, these ones can be written to, but can't have
  // columns added (i.e. schema changes):
  allowedTablesNoColumns: ['application', 'file'],
  filterListMaxLength: 10,
  filterListBatchSize: 1000,
  filterColumnSuffix: '_filter_data', // snake_case,
  fileUploadLimit: 2_147_483_648, // 2GB, fastify-multipart
  isProductionBuild,
  defaultSystemManagerPermissionName: 'systemManager',
  ...serverPrefs,
  webHostUrl,
  productionHost: siteHost,
  isLiveServer,
  emailMode: getEmailOperationMode(serverPrefs.emailTestMode, serverPrefs.testingEmail),
  maintenanceMode: false,
  Throttle,
}

function loadPrefs() {
  const mainPrefs = readJsonSync(
    path.join(getAppEntryPointDir(), preferencesFolder, preferencesFileName)
  )
  if (process.env.PREFERENCE_OVERRIDES) {
    try {
      const overridePrefs = readJsonSync(process.env.PREFERENCE_OVERRIDES)
      console.log('PREFERENCE_OVERRIDES found:')
      console.log(JSON.stringify(overridePrefs, null, 2))
      return merge(mainPrefs, overridePrefs)
    } catch {
      console.log(
        `ERROR: Unable to load file specified in PREFERENCE_OVERRIDES: ${process.env.PREFERENCE_OVERRIDES}`
      )
      return mainPrefs
    }
  } else return mainPrefs
}

// Mutate the global config object to inject new preferences
export const refreshConfig = (config: Config) => {
  console.log('\nUpdating system configuration...')
  const prefs = loadPrefs()
  const serverPrefs: ServerPreferences = prefs.server
  const webAppPrefs: WebAppPrefs = prefs.web
  serverPrefKeys.forEach((key) => {
    if (serverPrefs[key] !== undefined) {
      config[key] = serverPrefs[key] as never
    } else delete config[key]
  })

  if (webAppPrefs.siteHost) config.productionHost = webAppPrefs.siteHost
  else config.productionHost = undefined

  config.isLiveServer = getIsLiveServer(webHostUrl, webAppPrefs.siteHost)
  config.emailMode = getEmailOperationMode(serverPrefs.emailTestMode, serverPrefs.testingEmail)

  // Update locale and timezone if changed
  const newLocale = serverPrefs.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  if (newLocale !== Settings.defaultLocale) {
    console.log(`Changing locale to: ${newLocale}`)
    Settings.defaultLocale = newLocale
  }

  const newTimezone = serverPrefs?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  if (newTimezone !== Settings.defaultZoneName) {
    console.log(`Changing timezone to: ${newTimezone}`)
    Settings.defaultZoneName = newTimezone
  }

  //Update scheduled jobs from prefs
  if (config.scheduledJobs) {
    config.scheduledJobs.reschedule('action', serverPrefs.actionSchedule)
    config.scheduledJobs.reschedule('backup', serverPrefs.backupSchedule)
    config.scheduledJobs.reschedule('cleanup', serverPrefs.fileCleanupSchedule)
    config.scheduledJobs.reschedule('archive', serverPrefs.archiveSchedule)
  }

  console.log('Email mode:', config.emailMode)
  if (config.emailMode === 'TEST') console.log('All Email sent to:', config.testingEmail)
  console.log('Current time:', DateTime.now().toLocaleString(DateTime.DATETIME_HUGE_WITH_SECONDS))
  console.log('Configuration refreshed with updated preferences\n')
}

function getIsLiveServer(webHostUrl: string | undefined, productionHost?: string | null) {
  if (!webHostUrl) return false
  if (!productionHost) return true

  const re = new RegExp(`^https?:\/\/${productionHost}.*`)
  return re.test(webHostUrl)
}

function getEmailOperationMode(
  emailTestMode: boolean | undefined,
  testingEmail: string | undefined
): EmailOperationMode {
  switch (true) {
    case emailTestMode === false:
      return 'LIVE'
    case emailTestMode === true && !!testingEmail:
      return 'TEST'
    case USE_MAIL_HOG as boolean:
      return 'MAILHOG'
    case isLiveServer:
      return 'LIVE'
    case !!testingEmail:
      return 'TEST'
    default:
      return 'NONE'
  }
}

export default config
