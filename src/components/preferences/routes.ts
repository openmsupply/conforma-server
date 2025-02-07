import { readJSONSync, writeJson } from 'fs-extra'
import { combineRequestParams, errorMessage, isObject } from '../../components/utilityFunctions'
import config, { refreshConfig } from '../../config'
import { DEFAULT_LOGOUT_TIME, PREFERENCES_FILE } from '../../constants'
import { Preferences } from '../../types'
import databaseConnect from '../database/databaseConnect'
import { readLanguageOptions } from '../localisation/routes'

export type LanguageOption = {
  languageName: string
  description: string
  code: string
  locale?: string
  flag: string // To-do: limit to flag emojis
  enabled: boolean
}

export const loadCurrentPrefs = () => readJSONSync(PREFERENCES_FILE)

export const setPreferences = async (prefs: Preferences) => {
  await writeJson(PREFERENCES_FILE, prefs, { spaces: 2 })
}

// Serve prefs to front-end
export const routeGetPrefs = async (request: any, reply: any) => {
  const prefs = loadCurrentPrefs()
  const languageOptions = readLanguageOptions()
  const latestSnapshot = await databaseConnect.getSystemInfo('snapshot')
  const allowedTableNames = config.allowedTableNames
  const logoutAfterInactivity = prefs.server.logoutAfterInactivity ?? DEFAULT_LOGOUT_TIME

  reply.send({
    preferences: { ...prefs.web, logoutAfterInactivity },
    languageOptions,
    latestSnapshot,
    allowedTableNames,
    logoutAfterInactivity,
    maintenanceMode: {
      enabled: config.maintenanceMode,
      redirect: config.maintenanceSite ?? config.defaultUnderMaintenanceSite,
    },
  })
}

// Return all prefs for editing (Admin only)
export const routeGetAllPrefs = async (request: any, reply: any) => {
  const preferences = loadCurrentPrefs()
  const overrides = process.env.PREFERENCE_OVERRIDES
    ? readJSONSync(process.env.PREFERENCE_OVERRIDES)
    : null
  reply.send({ preferences, overrides })
}

export const routeSetPrefs = async (request: any, reply: any) => {
  const { server, web } = combineRequestParams(request)

  if (!isObject(server))
    return reply.send({ success: false, message: 'Invalid or missing Server prefs' })
  if (!isObject(web)) return reply.send({ success: false, message: 'Invalid or missing Web prefs' })

  try {
    await setPreferences({ server, web })

    refreshConfig(config)

    return reply.send({ success: true, preferences: { server, web } })
  } catch (err) {
    return reply.send({ success: false, message: errorMessage(err) })
  }
}
