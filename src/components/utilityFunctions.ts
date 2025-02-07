import path from 'path'
import fs from 'fs'
import fsProm from 'fs/promises'
import { camelCase, snakeCase, mapKeys } from 'lodash'
import { singular } from 'pluralize'
import config from '../config'

// Determines the folder of the main entry file, as opposed to the
// project root. Needed for components that traverse the local directory
// structure (e.g. fileHandler, registerPlugins), as the project
// root changes its relative path once built.
export function getAppEntryPointDir() {
  return path.dirname(__dirname)
}

// Returns true if input is a "proper" object (i.e. not an array or null)
export const isObject = (element: unknown): element is Object =>
  typeof element === 'object' && !Array.isArray(element) && element !== null

// Convert object keys to camelCase
export const objectKeysToCamelCase = (obj: { [key: string]: any }) =>
  mapKeys(obj, (_, key) => camelCase(key))

// Convert object keys to snake_case
export const objectKeysToSnakeCase = (obj: { [key: string]: any }) =>
  mapKeys(obj, (_, key) => snakeCase(key))

// Combine both query parameters and Body JSON fields from http request
// into single object
// Note: Body parameters take precedence
export const combineRequestParams = (request: any, outputCase: OutputCase | null = null) => {
  const query = request.query
  const bodyJSON = request.body
  if (outputCase === 'snake') return objectKeysToSnakeCase({ ...query, ...bodyJSON })
  if (outputCase === 'camel') return objectKeysToCamelCase({ ...query, ...bodyJSON })
  return { ...query, ...bodyJSON }
}

type OutputCase = 'snake' | 'camel'

// Create folder if it doesn't already exist
export const makeFolder = (folderPath: string, message?: string) => {
  if (!fs.existsSync(folderPath)) {
    message && console.log(message)
    fs.mkdirSync(folderPath)
  }
}

// Given an array of objects, returns only distinct ones, as determined by a
// specified property. When more than one exists, a "priority" field can be
// specified to determine which to keep, otherwise it will return the first one.
// Preserves the order of the original input array
// TO-DO: Allow custom comparator function
type BasicObject = { [key: string]: any }
type IndexObject = { [key: string]: number }
export const getDistinctObjects = (
  objectArray: BasicObject[],
  matchProperty: string,
  priorityProperty: string | null = null
) => {
  const distinctValues = new Set()
  const highestPriorityIndexRecord: IndexObject = {}
  const outputArray: BasicObject[] = []
  objectArray.forEach((item) => {
    if (!(matchProperty in item)) throw new Error('matchProperty not found on Object')
    const value = item[matchProperty]
    if (!distinctValues.has(value)) {
      distinctValues.add(value)
      const index = outputArray.push(item) - 1
      highestPriorityIndexRecord[JSON.stringify(value)] = index
    } else {
      if (!priorityProperty) return
      // Is the new one higher?
      const prevIndex = highestPriorityIndexRecord[JSON.stringify(value)]
      if (item?.[priorityProperty] > outputArray[prevIndex][priorityProperty])
        outputArray[prevIndex] = item
    }
  })
  return outputArray
}

// Given an object, returns a new object with all keys removed whose values
// return false when passed into the 2nd parameter function. Can be used (for
// example) to remove keys with null or undefined values (the default)
// Eg. {one: 1, two: null, three: undefined} => {one: 1}
type FilterFunction = (key: string, value: any) => boolean
export const filterObject = (
  inputObj: BasicObject,
  filterFunction: FilterFunction = (_, value) => value != null
) => {
  const filtered = Object.entries(inputObj).filter(([key, value]) => filterFunction(key, value))
  return Object.fromEntries(filtered)
}

// Generic function for recursively crawling the file system. Will run method "fileOperation" on all files within "directory"
export const crawlFileSystem = async (
  directory: string,
  fileOperation: (filePath: string) => void
) => {
  const files = fs.readdirSync(directory)
  for (const file of files) {
    const subPath = path.join(directory, file)
    if (fs.statSync(subPath).isDirectory()) await crawlFileSystem(subPath, fileOperation)
    else await fileOperation(subPath)
  }
}

// Recursively crawl a directory and remove any empty directories within
export const clearEmptyDirectories = async (directory: string) => {
  const directories = (await fsProm.readdir(directory)).filter((dir) =>
    fs.statSync(path.join(directory, dir)).isDirectory()
  )
  for (const dir of directories) {
    await clearEmptyDirectories(path.join(directory, dir))
    const files = await fsProm.readdir(path.join(directory, dir))
    if (files.length === 0) await fsProm.rmdir(path.join(directory, dir))
  }
}

export const capitaliseFirstLetter = (str: string) => str[0].toUpperCase() + str.slice(1)

export const getValidTableName = (inputName: string | undefined): string => {
  // The only tables in the system that we allow to be mutated directly by
  // modifyRecord or displayed as data views. All other names must have
  // "data_table_" prepended.
  const DATA_TABLE_PREFIX = config.dataTablePrefix
  const ALLOWED_TABLE_NAMES = config.allowedTableNames

  if (!inputName) throw new Error('Missing table name')
  const tableName = snakeCase(singular(inputName))
  if (ALLOWED_TABLE_NAMES.includes(tableName)) return tableName
  const namePattern = new RegExp(`^${DATA_TABLE_PREFIX}.+`)

  return namePattern.test(tableName) ? tableName : `${DATA_TABLE_PREFIX}${tableName}`
}

// Replace a string of the form "env.<KEY>" with environment variable <KEY>
// - Used for references in configurations to sensitive data such as
//   passwords/keys
export const getEnvVariableReplacement = (input: string) => {
  const match = input.match(/^env\.(\w+)$/)
  if (!match) return input

  const envKey = match[1]

  return process.env[envKey] ?? input
}

// Validates an Error object and returns its message (default) or requested
// property, if available
export const errorMessage = (err: unknown, property?: string) => {
  if (!isObject(err)) return 'Unknown error'

  if (!property && 'message' in err) return err.message as string

  if (property && property in err) return (err as any)[property]

  return 'Unknown error'
}

// Recursively searches an object for criteria defined in `matchFn`, and
// modifies matching values according to `modifyFn`
export const modifyValueInObject = (
  obj: object,
  matchFn: (key: string, value: object) => boolean,
  modifyFn: (value: object) => string
): object => {
  if (!isObject(obj)) {
    return obj
  }

  return Object.entries(obj).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: matchFn(key, value) ? modifyFn(value) : modifyValueInObject(value, matchFn, modifyFn),
    }),
    {} as object
  )
}
