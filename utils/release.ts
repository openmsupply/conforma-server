require('dotenv').config()
import readlineSync from 'readline-sync'
import { writeFileSync } from 'fs'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import { runTests } from '../src/components/actions/dev_tools/testing/testSnapshot'

const exec = promisify(execCallback)
const FRONT_END_PATH = process.env.FRONT_END_PATH
const TEST_SUITE = process.env.BUILD_TEST_SNAPSHOT

const releaseTypes = [
  '--prerelease',
  '--patch',
  '--minor',
  '--major',
  '--preminor',
  '--premajor',
  '--prepatch',
] as const
type ReleaseType = typeof releaseTypes[number]

const release = async () => {
  if (!FRONT_END_PATH) exitWithError('No front-end repo path in .env file')

  if (!TEST_SUITE) {
    console.log(
      '\nWarning: no testing suite specified in .env file. Are you Are you sure you wish to proceed without testing?'
    )
    if (!(await userRespondsYes())) process.exit(0)
  }

  console.log('Starting build tests...')

  const result = await runTests()

  if (!result) {
    console.log(
      `CAUTION: The test suite in ${TEST_SUITE} did not pass. Are you sure you wish to proceed with this build?`
    )
    if (!(await userRespondsYes())) process.exit(0)
  }

  const releaseType: ReleaseType = (process.argv[2] || '--prerelease') as ReleaseType

  if (!releaseTypes.includes(releaseType))
    exitWithError(`${releaseType} is not a valid release type`)

  const branch = await getGitBranch()
  if (!branch) exitWithError('Invalid git branch')

  console.log(
    `\nYou are about to create a new version of type: ${releaseType} on branch ${branch}\nPlease ensure you have added the front-end file path to your .env file and the front-end has the correct branch checked out.\n\nAre you sure you wish to proceed?`
  )

  if (!(await userRespondsYes())) process.exit(0)

  const { currentVersion, newVersion, error } = await bumpVersion(releaseType)
  if (error) exitWithError(error as string)
  const tag = `v${newVersion}` // Generated automatically by yarn
  console.log(`\nServer version bumped to: ${newVersion}\n`)

  console.log(`\nPushing tag ${tag} to Github...`)
  try {
    await exec(`git push origin ${tag}`)
  } catch {
    exitWithError('Problem pushing tag!')
  }

  console.log('Done!\n')

  console.log('\nSwitching to front-end repo and doing the same...')

  try {
    await exec(
      `cd ${FRONT_END_PATH} && yarn version --new-version ${newVersion} && git push origin ${tag}`
    )
  } catch {
    exitWithError('Problem creating front-end version')
  }
  console.log('Done!\n')

  console.log(`Would you like to start a Docker build for version ${newVersion}?`)

  if (userRespondsYes()) {
    return tag
  }
  return ''
}

release().then((tag) => {
  writeFileSync('tag', tag) // To be used by shell script
})

function exitWithError(error: string) {
  console.log(`\nERROR: ${error}\n`)
  process.exit(1)
}

async function getGitBranch() {
  const { stdout } = await exec(`git status`)
  return /On branch (.+)/gm.exec(stdout)?.[1] || ''
}

function userRespondsYes(prompt: string = '(Y/n)? ') {
  const answer = readlineSync.question(prompt)
  return answer.includes('Y') || answer.includes('y')
}

async function bumpVersion(releaseType: ReleaseType) {
  const { stdout, stderr } = await exec(`yarn version ${releaseType}`)
  const regex = /([0-9]{1,2}\.[0-9]{1,2}.[0-9]{1,2}(-[0-9]{1,2})?)/gm
  const currentVersion = regex.exec(stdout)?.[1]
  const newVersion = regex.exec(stdout)?.[1]
  if (stderr) return { error: stderr }
  return { currentVersion, newVersion }
}
