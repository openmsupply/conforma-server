import path from 'path'
import { readFileSync, writeFile } from 'fs'
import { promisify } from 'util'
import databaseConnect from '../databaseConnect'
import {
  getAppEntryPointDir,
  combineRequestParams,
  isObject,
} from '../../components/utilityFunctions'
import config from '../../config'
import { PREFERENCES_FILE } from '../../constants'
import { refreshPreferences } from '../snapshots/useSnapshot'
import { readLanguageOptions } from '../localisation/routes'

const { localisationsFolder } = config

const writeFilePromise = promisify(writeFile)

export type LanguageOption = {
  languageName: string
  description: string
  code: string
  locale?: string
  flag: string // To-do: limit to flag emojis
  enabled: boolean
}

const loadCurrentPrefs = () =>
  JSON.parse(
    readFileSync(path.join(getAppEntryPointDir(), '../preferences/preferences.json'), 'utf8')
  )

// Serve prefs to front-end
export const routeGetPrefs = async (request: any, reply: any) => {
  const prefs = loadCurrentPrefs()
  const languageOptions = readLanguageOptions
  const latestSnapshot = await databaseConnect.getLatestSnapshotName()
  reply.send({ preferences: prefs.web, languageOptions, latestSnapshot })
}

// Return all prefs for editing (Admin only)
export const routeGetAllPrefs = async (request: any, reply: any) => {
  const preferences = loadCurrentPrefs()
  reply.send({ ...preferences })
}

export const routeSetPrefs = async (request: any, reply: any) => {
  const { server, web } = combineRequestParams(request)

  if (!isObject(server))
    return reply.send({ success: false, message: 'Invalid or missing Server prefs' })
  if (!isObject(web)) return reply.send({ success: false, message: 'Invalid or missing Web prefs' })

  await writeFilePromise(PREFERENCES_FILE, JSON.stringify({ server, web }, null, 2))

  refreshPreferences(config)

  return reply.send({ success: true, preferences: { server, web }, config })
}
