/*
Wrapper for snapshot/build testing suite. The wrapper is so we can capture the
result of the test and act on it accordingly.
*/

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { TEST_SCRIPT_FOLDER, SNAPSHOT_FOLDER } from '../../../../constants'

const isManualTest = process.argv[2] === '--test'

const lastArg = process.argv.pop() as string

const inputTest = lastArg.match(/\.ts$/) || lastArg === '--test' ? null : lastArg

if (inputTest) console.log('Requested test suite', inputTest)

let testScriptFile: string | undefined
let snapshotName: string | undefined

// Check for test script in either (in this order):
// - "snapshot_test_scripts" folder -- match {inputTest}.json
// - snapshot named ${inputTest} -- look for "tests.json" within
// - .env file: BUILD_TEST_SNAPSHOT
if (!inputTest) {
  console.log('No test file or snapshot specified, checking .env file...')
  snapshotName = process.env.BUILD_TEST_SNAPSHOT
  testScriptFile = `${SNAPSHOT_FOLDER}/${process.env.BUILD_TEST_SNAPSHOT}/tests.json`
  if (!snapshotName) {
    console.log('NO SNAPSHOT DEFINED IN .env')
    process.exit(0)
  }
} else {
  if (existsSync(`${TEST_SCRIPT_FOLDER}/${inputTest}.json`)) {
    testScriptFile = `${TEST_SCRIPT_FOLDER}/${inputTest}.json`
    const testScript = JSON.parse(readFileSync(testScriptFile, 'utf-8'))
    snapshotName = testScript.snapshot
    console.log('Test script found:', `${inputTest}.json`)
  } else {
    console.log(`${inputTest} not found in "snapshot_test_scripts". Checking snapshots...`)
    if (existsSync(`${SNAPSHOT_FOLDER}/${inputTest}/tests.json`)) {
      testScriptFile = `${SNAPSHOT_FOLDER}/${inputTest}/tests.json`
      const testScript = JSON.parse(readFileSync(testScriptFile, 'utf-8'))
      snapshotName = testScript.snapshot
      console.log('Test script found in snapshot:', snapshotName)
    } else {
      console.log(`Test file not found in snapshot ${inputTest}`)
      process.exit(0)
    }
  }
}

export const runTests = async () => {
  try {
    execSync(`yarn test --forceExit triggerEvents ${testScriptFile} ${snapshotName}`, {
      stdio: 'inherit',
    })
    // Save "PASS" file to snapshot folder
    // Re-zip
    return true
  } catch {
    console.error('FAILED TEST :(')
    return false
    // Delete "PASS" file from snapshot
    // Re-zip
  }
}

if (isManualTest) runTests()
