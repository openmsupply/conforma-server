const fs = require('fs')
const { executeGraphQLQuery } = require('./insertData.js')
const { updateRowPolicies } = require('./updateRowPolicies.js')

const defaultSnapshotName = 'current'
const seperator = '########### MUTATION END ###########'
const { execSync } = require('child_process')

console.log('initialising database ... ')
execSync('./database/initialise_database.sh')
console.log('initialising database ... done')

const useSnapshot = async () => {
  let snapshotName = process.argv[2] || defaultSnapshotName

  const snapshotFileName = './database/snapshots/' + snapshotName + '.graphql'

  console.log('inserting from snapshot: ' + snapshotName)

  await insertDataFromFile(snapshotFileName)

  await updateRowPolicies()

  console.log('running post data insert ... ')
  execSync('./database/post_data_insert.sh')
  console.log('running post data insert ... done')

  console.log('running serial update ... ')
  execSync('./database/update_serials.sh')
  console.log('running serial update ... done')

  console.log('all ... done')
}

const insertDataFromFile = async (filename) => {
  const wholeFileContent = fs.readFileSync(filename, 'utf-8')

  const splitContent = wholeFileContent.split(seperator)

  for (let content of splitContent) {
    // console.log(content) // uncomment for debugging
    try {
      await executeGraphQLQuery(content)
    } catch (e) {
      console.log('### error while inserting: ' + content)
      throw e
    }
  }
}

useSnapshot()
