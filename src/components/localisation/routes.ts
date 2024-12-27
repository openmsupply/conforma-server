import { FastifyPluginCallback, FastifyReply } from 'fastify'
import path from 'path'
import { rmdirSync, readFileSync, writeFile } from 'fs'
import fsx from 'fs-extra'
import { promisify } from 'util'
import {
  getAppEntryPointDir,
  combineRequestParams,
  makeFolder,
  errorMessage,
} from '../../components/utilityFunctions'
import config from '../../config'
import { DateTime } from 'luxon'

const { localisationsFolder } = config

const writeFilePromise = promisify(writeFile)

export const localisationRoutes: FastifyPluginCallback<{ prefix: string }> = (server, _, done) => {
  server.addHook('preValidation', async (request: any, reply: FastifyReply) => {
    const { managerCanEditLocalisation = true } = config
    const { isAdmin = false, isManager = false } = request.auth

    if (managerCanEditLocalisation) {
      if (!(isAdmin || isManager)) {
        reply.statusCode = 401
        return reply.send({ success: false, message: 'Unauthorized: not admin or manager' })
      }
    }

    if (!managerCanEditLocalisation && !isAdmin) {
      reply.statusCode = 401
      return reply.send({ success: false, message: 'Unauthorized: not admin' })
    }
  })
  server.post('/enable', routeEnableLanguage)
  server.post('/install', routeInstallLanguage)
  server.post('/remove', routeRemoveLanguage)
  server.get('/get-all', routeGetAllLanguageFiles)
  done()
}

export type LanguageOption = {
  languageName: string
  description: string
  code: string
  locale?: string
  flag: string // To-do: limit to flag emojis
  enabled: boolean
}

export const routeGetLanguageFile = async (request: any, reply: any) => {
  const { code } = request.params
  const languageOptions = readLanguageOptions()
  const requestedIndex = languageOptions.findIndex((lang: LanguageOption) => code === lang.code)

  if (requestedIndex === -1) {
    reply.statusCode = 400
    return reply.send({
      error: 'Language error',
      message: 'Language code not recognised',
    })
  }

  if (!languageOptions[requestedIndex].enabled) {
    reply.statusCode = 403
    return reply.send({
      error: 'Language error',
      message: 'Language code not enabled',
    })
  }

  const data = await fsx.readJSON(
    path.join(getAppEntryPointDir(), localisationsFolder, code, 'strings.json')
  )
  reply.send(data)
}

export const routeGetAllLanguageFiles = async (request: any, reply: any) => {
  const languageOptions = readLanguageOptions()
  const output: { [key: string]: { [key: string]: string } } = {}

  for (const { code } of languageOptions) {
    const stringsFile = path.join(code, 'strings.json')
    output[code] = JSON.parse(
      readFileSync(path.join(getAppEntryPointDir(), localisationsFolder, stringsFile), 'utf-8')
    )
  }
  reply.send(output)
}

export const routeEnableLanguage = async (request: any, reply: any) => {
  const { code, enabled } = combineRequestParams(request)
  const languageOptions: LanguageOption[] = readLanguageOptions()
  const index = languageOptions.findIndex((language) => language.code === code)
  if (index === -1) return reply.send({ success: false, message: 'Code not recognised' })

  const changedLanguage = {
    ...languageOptions[index],
    enabled:
      enabled === 'true' ? true : enabled === 'false' ? false : !languageOptions[index].enabled,
  }
  languageOptions[index] = changedLanguage

  if (languageOptions.filter((language) => language.enabled).length === 0)
    return reply.send({ success: false, message: 'At least one language must remain enabled' })

  // Write file back
  try {
    await writeLanguageOptions(languageOptions)
    return reply.send({ success: true, data: languageOptions })
  } catch (err) {
    return reply.send({
      success: false,
      message: 'Problem saving language preferences' + errorMessage(err),
    })
  }
}

export const routeInstallLanguage = async (request: any, reply: any) => {
  const { language, strings } = request.body
  if (!checkLanguageFormat(language))
    return reply.send({ success: false, message: 'Incorrect language data' })
  if (!checkStrings(strings))
    return reply.send({ success: false, message: 'Incorrect strings format' })

  const languageOptions = readLanguageOptions()

  const index = languageOptions.findIndex((lang: LanguageOption) => language.code === lang.code)
  let message: string
  if (index === -1) {
    languageOptions.push(language)
    message = `New language added: ${language.languageName} / ${language.code}`
  } else {
    languageOptions[index] = language
    message = `Language updated: ${language.languageName} / ${language.code}`
  }

  // Write files
  try {
    await writeLanguageOptions(languageOptions)
    makeFolder(path.join(getAppEntryPointDir(), `../localisation/${language.code}/`))

    await writeFilePromise(
      path.join(getAppEntryPointDir(), `../localisation/${language.code}/strings.json`),
      JSON.stringify(strings, null, 2)
    )
    return reply.send({ success: true, message })
  } catch (err) {
    return reply.send({
      success: false,
      message: 'Problem installing language:' + errorMessage(err),
    })
  }
}

export const routeRemoveLanguage = async (request: any, reply: any) => {
  const { code } = combineRequestParams(request)
  const languageOptions = readLanguageOptions()

  const newLanguageOptions = languageOptions.filter(
    (language: LanguageOption) => language.code !== code
  )
  if (newLanguageOptions.length === languageOptions.length)
    return reply.send({ success: false, message: 'Code not recognised' })
  if (newLanguageOptions.length === 0)
    return reply.send({ success: false, message: 'At least one language must remain installed' })

  // Write options file and delete language file
  try {
    await writeLanguageOptions(newLanguageOptions)
    await rmdirSync(path.join(getAppEntryPointDir(), `../localisation/${code}`), {
      recursive: true,
    })
    return reply.send({ success: true, data: newLanguageOptions })
  } catch (err) {
    return reply.send({
      success: false,
      message: 'Problem uninstalling language:' + errorMessage(err),
    })
  }
}

export const readLanguageOptions = (): LanguageOption[] =>
  JSON.parse(
    readFileSync(path.join(getAppEntryPointDir(), '../localisation/languages.json'), 'utf8')
  ).map((option: Partial<LanguageOption>) =>
    'locale' in option ? option : { ...option, locale: DateTime.local().locale }
  )

export const writeLanguageOptions = async (languageOptions: LanguageOption[]) =>
  await writeFilePromise(
    path.join(getAppEntryPointDir(), '../localisation/languages.json'),
    JSON.stringify(languageOptions, null, 2)
  )

const checkLanguageFormat = (language: LanguageOption) => {
  return (
    typeof language === 'object' &&
    language.code &&
    typeof language.code === 'string' &&
    language.languageName &&
    typeof language.languageName === 'string' &&
    language.description &&
    typeof language.description === 'string' &&
    language.flag &&
    typeof language.flag === 'string' &&
    (language.locale ? typeof language.locale === 'string' : true)
  )
}

const checkStrings = (strings: object) => {
  return (
    typeof strings === 'object' &&
    Object.values(strings).every((string) => typeof string === 'string') &&
    Object.keys(strings).length > 0
  )
}
