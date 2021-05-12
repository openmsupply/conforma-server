// Test suite for the createUser Action -- just confirms that users are written to database.

import DBConnect from '../../../src/components/databaseConnect'
import { ActionQueueStatus } from '../../../src/generated/graphql'
import { action as createUser } from './index'

const testUser = {
  first_name: 'Carl',
  last_name: 'Smith',
  username: 'ceejay',
  date_of_birth: '1999-12-23',
  password_hash: 'XYZ1234',
  email: 'test@sussol.net',
}

const invalidUser = {
  first_name: 'Carl',
  last_name: 'Smith',
  user_name: 'ceejay',
  dateOfBirth: '1999-12-23',
  password_hash: 'XYZ1234',
  email: 'test@sussol.net',
}

test('Test: add User to database', () => {
  return createUser({
    parameters: testUser,
    DBConnect,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        email: 'test@sussol.net',
        firstName: 'Carl',
        lastName: 'Smith',
        userId: 18,
        username: 'ceejay',
      },
    })
  })
})

test('Test: Invalid user (date_of_birth and username fields mis-named) -- should fail', () => {
  return createUser({ parameters: invalidUser, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Fail,
      error_log: 'There was a problem creating new user.',
    })
  })
})
