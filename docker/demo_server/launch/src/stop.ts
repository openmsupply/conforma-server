/**
 * CONFORMA/DOCKER STOP SCRIPT
 *
 * Stop Conforma Docker instance.
 *
 * Command line input same as Launch script
 */

import fs from 'fs-extra'
import path from 'path'
import getInput from 'readline-sync'
import { parseEnv, spawnChild } from './helpers'
import { DEFAULT_FILE, ENV_FOLDER } from './constants'

const [_, scriptPath, ...sites] = process.argv

const thisFolder = path.dirname(scriptPath)
const defaultFilePath = path.join(thisFolder, DEFAULT_FILE)
const defaultFileExists = fs.pathExistsSync(defaultFilePath)
if (!defaultFileExists) console.log(`WARNING: No valid ${DEFAULT_FILE} found`)

const defaultRawInput = defaultFileExists ? fs.readFileSync(defaultFilePath, 'utf-8') : ''
const defaults = parseEnv(defaultRawInput)

const stopSites = async () => {
  if (sites.length === 0)
    sites.push(
      defaults?.SITE ??
        getInput.question(
          `No site was specified in command line args or in ${DEFAULT_FILE}.\nPlease enter a running site (or Enter to exit): `
        )
    )

  for (const SITE of sites) {
    if (SITE === '') {
      console.log('No site specified...exiting')
      process.exit(0)
    }

    const siteEnvPath = path.join(thisFolder, ENV_FOLDER, `${SITE}.env`)

    if (!fs.pathExistsSync(siteEnvPath)) {
      console.log(`❌ ERROR: Missing site env file -- ${ENV_FOLDER}/${SITE}.env`)
      continue
    }

    const { PORT } = parseEnv(fs.readFileSync(siteEnvPath, 'utf-8'))

    const NAME = `conforma-${SITE}-on-${PORT}`

    console.log(`\nStopping ${NAME}...`)
    const stopResult = await spawnChild('sudo', [
      '-E',
      'docker',
      'compose',
      '--project-name',
      NAME,
      'down',
    ])

    if (stopResult !== 0) {
      console.log(`ERROR: Problem stopping ${NAME}`)
      continue
    }

    console.log(`DONE: Successfully stopped ${NAME}`)
  }
}

stopSites()
