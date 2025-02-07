import { ActionLibrary } from '../../types'
import DBConnect from '../database/databaseConnect'
import { errorMessage, getAppEntryPointDir } from '../utilityFunctions'
import path from 'path'

// Load actions from Database at server startup
export const loadActions = async function (actionLibrary: ActionLibrary) {
  console.log('Loading Actions from Database...')

  try {
    const result = await DBConnect.getActionPlugins()

    result.forEach((row) => {
      // This should import action from index.js (entry point of plugin)
      actionLibrary[row.code] = require(path.join(getAppEntryPointDir(), row.path)).action
      console.log('Action loaded: ' + row.code)
    })

    console.log('Actions loaded.')
  } catch (err) {
    console.log(errorMessage(err))
  }
}
