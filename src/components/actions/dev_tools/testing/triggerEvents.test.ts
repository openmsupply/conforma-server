// Configure a snapshot to be used with this test suite.
import { readFileSync } from 'fs'
import { loadActionPlugins } from '../../../pluginsConnect'
import { RequestProps, testTrigger } from '../'
import useSnapshot from '../../../../components/snapshots/useSnapshot'

interface TestData {
  name: string
  input: RequestProps
  output: Partial<ReturnType<typeof testTrigger>>
}

const snapshotName = process.argv.pop() as string
const testScriptFile = process.argv.pop() as string

console.log(testScriptFile, snapshotName)

const testData: TestData[] = JSON.parse(readFileSync(testScriptFile, 'utf-8')).tests

beforeAll((done) => {
  if (!snapshotName) done('No valid snapshot')
  // Load snapshot
  useSnapshot({ snapshotName }).then(({ success }) => {
    if (success) done()
    else done('Failed to load snapshot')
  })
  loadActionPlugins()
})

testData.forEach(({ name, input, output }) => {
  test(name, async () => {
    const result = await testTrigger(input)
    expect(result).toMatchObject(output)
  })
})
