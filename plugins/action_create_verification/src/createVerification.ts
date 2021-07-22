import { ActionQueueStatus } from '../../../src/generated/graphql'
import { ActionPluginType } from '../../types'
import databaseMethods from './databaseMethods'
import { nanoid } from 'nanoid'
import { DateTime } from 'luxon'

const createVerification: ActionPluginType = async ({ parameters, applicationData, DBConnect }) => {
  const db = databaseMethods(DBConnect)
  const {
    applicationId = applicationData?.applicationId,
    expiry = null, // duration in hours
    uniqueId = nanoid(24),
    message = '## Verification successful\n\nThank you',
    code = null,
    data = null,
  } = parameters

  try {
    const expiryTime = expiry ? DateTime.now().plus({ hours: expiry }).toISO() : null
    // Add record
    const verification = await db.createVerification({
      uniqueId,
      applicationId,
      expiryTime,
      code,
      message,
      data,
    })
    return {
      status: ActionQueueStatus.Success,
      error_log: '',
      output: { verification },
    }
  } catch (error) {
    console.log(error.message)
    return {
      status: ActionQueueStatus.Fail,
      error_log: error.message,
    }
  }
}

export default createVerification
