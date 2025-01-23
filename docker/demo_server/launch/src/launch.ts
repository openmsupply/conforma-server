/**
 * CONFORMA/DOCKER LAUNCH SCRIPT
 *
 * This script can be compiled and placed on a server (or locally) and used to
 * launch Conforma Docker containers using configuration options specified in
 * either:
 * - a site-specific "env" file (place in /env_files/<site>.env)
 * - a common "default.env" file (in the same location as the launch script)
 * - environment variables
 *
 * See env_files/example.env and default.env in this folder for examples
 *
 * Launch the script with `node launch.mjs <site1> <site2> ...`
 *
 * Will prompt for a single site if site args are omitted.
 *
 * To create a global alias (that can be run from anywhere), add the following
 * line to the host shell configuration file (probably ~/.zshrc or ~/.bashrc):
 *
 * alias launch_conforma=\"node /path/to/script_folder/launch.mjs
 *
 * To run this script from the repo locally, run from
 * /docker/demo_server/launch:
 *
 * "yarn dev <site>"
 *
 * Or to re-compile to JS file:
 *
 * "yarn build"
 */

import fs from 'fs-extra'
import path from 'path'
import getInput from 'readline-sync'
import { nanoid } from 'nanoid'
import { parseEnv, spawnChild } from './helpers'
import { DEFAULT_FILE, ENV_FOLDER } from './constants'

const [_, scriptPath, ...sites] = process.argv

const thisFolder = path.dirname(scriptPath)
const defaultFilePath = path.join(thisFolder, DEFAULT_FILE)
const defaultFileExists = fs.pathExistsSync(defaultFilePath)
if (!defaultFileExists) console.log(`WARNING: No valid ${DEFAULT_FILE} found`)

const defaultRawInput = defaultFileExists ? fs.readFileSync(defaultFilePath, 'utf-8') : ''
const defaults = parseEnv(defaultRawInput)

const launchSites = async () => {
  if (sites.length === 0)
    sites.push(
      defaults?.SITE ??
        getInput.question(
          `No site was specified in command line args or in ${DEFAULT_FILE}.\nPlease enter a site corresponding to an .env file in "${ENV_FOLDER}" (or Enter to exit): `
        )
    )

  for (const SITE of sites) {
    if (SITE === '') {
      console.log('No site specified...exiting')
      process.exit(0)
    }

    console.log(`\nLaunching CONFORMA site: ${SITE}`)

    const siteEnvPath = path.join(thisFolder, ENV_FOLDER, `${SITE}.env`)

    if (!fs.pathExistsSync(siteEnvPath)) {
      console.log(`❌ ERROR: Missing site env file -- ${ENV_FOLDER}/${SITE}.env`)
      continue
    }

    const envVars = parseEnv(fs.readFileSync(siteEnvPath, 'utf-8'))

    // Get $TAG from either (in priority order):
    // - Current env vars
    // - .env file
    // - default.env

    const tagSource = process.env.TAG
      ? 'Environment variable'
      : envVars?.TAG
      ? `${SITE}.env`
      : defaults?.TAG
      ? DEFAULT_FILE
      : 'User input'

    const TAG =
      process.env.TAG ??
      envVars?.TAG ??
      defaults?.TAG ??
      getInput.question(`No TAG specified. The build tag should be specified in either (in priority order): 
      - $TAG Environment variable
      - In the site .env file: ${ENV_FOLDER}/${SITE}.env
      - In ${DEFAULT_FILE}
  You can enter a build TAG now if you wish, or leave blank to skip site "${SITE}":
  `)

    // TAG

    if (!TAG) {
      console.log(`❌ No TAG specified for site...skipping "${SITE}"`)
      continue
    }

    process.env.TAG = TAG
    console.log(`Using tag from ${tagSource}: ${TAG}`)

    // BACKUPS_FOLDER

    const BACKUPS_FOLDER =
      process.env.BACKUPS_FOLDER ?? envVars?.BACKUPS_FOLDER ?? defaults?.BACKUPS_FOLDER

    if (!BACKUPS_FOLDER) {
      console.log(`❌ No BACKUPS_FOLDER specified for site...skipping "${SITE}"`)
      continue
    }
    process.env.BACKUPS_FOLDER = BACKUPS_FOLDER
    console.log(` - Backups folder: ${BACKUPS_FOLDER}`)

    // SNAPSHOTS_FOLDER

    const SNAPSHOTS_FOLDER =
      process.env.SNAPSHOTS_FOLDER ?? envVars?.SNAPSHOTS_FOLDER ?? defaults?.SNAPSHOTS_FOLDER

    if (!SNAPSHOTS_FOLDER) {
      console.log(`❌ No SNAPSHOTS_FOLDER specified for site...skipping "${SITE}"`)
      continue
    }
    process.env.SNAPSHOTS_FOLDER = SNAPSHOTS_FOLDER
    console.log(` - Snapshots folder: ${SNAPSHOTS_FOLDER}`)

    // SHARE_FOLDER

    const SHARE_FOLDER =
      process.env.SHARE_FOLDER ?? envVars?.SHARE_FOLDER ?? defaults?.BACKUPS_FOLDER

    if (!SHARE_FOLDER) {
      console.log('No SHARE_FOLDER specified for site...will use default')
    } else {
      process.env.SHARE_FOLDER = SHARE_FOLDER
      console.log(` - File share folder: ${SHARE_FOLDER}`)
    }

    // PORTS (App and Dashboard)

    const PORT_APP = envVars?.PORT ?? defaults?.PORT

    if (!PORT_APP) {
      console.log(`❌ No PORT specified for site...skipping "${SITE}"`)
      continue
    }
    process.env.PORT_APP = PORT_APP
    console.log(` - Conforma exposed on Port: ${PORT_APP}`)
    process.env.PORT_DASH = String(Number(PORT_APP) + 1)
    console.log(` - Dashboard exposed on Port: ${process.env.PORT_DASH}`)

    // WEB_HOST

    const WEB_HOST = envVars?.WEB_HOST ?? defaults?.WEB_HOST

    if (!WEB_HOST) {
      console.log(`❌ No WEB_HOST specified for site...skipping "${SITE}"`)
      continue
    }
    process.env.WEB_HOST = WEB_HOST
    console.log(` - Website host: ${WEB_HOST}`)

    // JWT_SECRET

    const JWT_SECRET =
      process.env.JWT_SECRET ??
      envVars?.JWT_SECRET ??
      defaults?.JWT_SECRET ??
      // If no JWT secret provided, use a random one
      nanoid(64)

    const jwtKeySource = process.env.JWT_SECRET
      ? 'Environment variable'
      : envVars?.JWT_SECRET
      ? `${SITE}.env`
      : defaults?.JWT_SECRET
      ? DEFAULT_FILE
      : 'Random value'

    process.env.JWT_SECRET = JWT_SECRET
    console.log(` - JWT private key set from ${jwtKeySource} (${JWT_SECRET.length} chars)`)

    const NAME = `conforma-${SITE}-on-${PORT_APP}`

    // Uncomment following lines to test input without launching Conforma:
    // console.log(`JWT Secret: ${process.env.JWT_SECRET}`)
    // process.exit()

    console.log(`\n(Re-)starting ${NAME}...`)
    // Stop current instance (if running)
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

    // Restart using new image tag
    process.env.ENV_FILE = path.join(thisFolder, ENV_FOLDER, `${SITE}.env`)
    const dockerComposePath = path.join(thisFolder, 'docker-compose.yml')
    const startResult = await spawnChild('sudo', [
      '-E',
      'docker',
      'compose',
      '-f',
      dockerComposePath,
      '--project-name',
      NAME,
      'up',
      '-d',
    ])
    if (startResult !== 0) {
      console.log(`ERROR: Problem launching ${NAME}`)
      continue
    }
    console.log(`DONE: Successfully launched ${NAME}`)
  }
}

launchSites()
