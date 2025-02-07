// Test suite for the modifyRecord AND modifyMultipleRecords Actions
// Needs fresh database `yarn database_init`

import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus } from '../../../src/generated/graphql'
import { ActionApplicationData } from '../../../src/types'
import { action as modifyRecord } from './index'
import { action as modifyMultipleRecords } from '../../action_modify_multiple_records/src'

// User tests

const testUser = {
  first_name: 'Carl',
  last_name: 'Smith',
  username: 'ceejay2',
  date_of_birth: '1999-12-23',
  password_hash: 'XYZ1234',
  email: 'test@sussol.net',
}

const testUser2 = {
  first_name: 'Carl',
  last_name: 'Smith',
  username: 'ceejay',
  password_hash: 'XYZ1234',
  email: 'test@sussol.net',
  phoneNumber: '111234',
}

const updatedUser = {
  id: 3,
  email: 'carl@msupply.foundation',
}

const updatedUserByUsername = {
  username: 'ceejay2',
  email: 'new-email@msupply.foundation',
}

const updatedUserByUsername2 = {
  username: 'carlos',
  first_name: 'Carlos',
}

const extraParameters = {
  DBConnect,
  applicationData: { applicationId: 1 } as ActionApplicationData,
}

test('Test: add User to database', () => {
  return modifyRecord({
    parameters: { tableName: 'user', ...testUser },
    ...extraParameters,
  }).then((result: any) => {
    expect(
      expect.objectContaining({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          user: {
            // id: 3,
            email: 'test@sussol.net',
            first_name: 'Carl',
            last_name: 'Smith',
            full_name: 'Carl Smith',
            username: 'ceejay2',
            password_hash: 'XYZ1234',
            date_of_birth: new Date('1999-12-22T11:00:00.000Z'),
          },
        },
      })
    )
  })
})

test('Test: Modify existing user', () => {
  return modifyRecord({
    parameters: { tableName: 'user', ...updatedUser },
    ...extraParameters,
  }).then((result: any) => {
    expect(
      expect.objectContaining({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          user: {
            id: 3,
            email: 'carl@msupply.foundation',
            first_name: 'Carl',
            last_name: 'Smith',
            full_name: 'Carl Smith',
            username: 'carl',
            password_hash: 'XYZ1234',
          },
        },
      })
    )
  })
})

test('Test: Modify existing user using username', () => {
  return modifyRecord({
    parameters: {
      tableName: 'user',
      matchField: 'username',
      ...updatedUserByUsername,
    },
    ...extraParameters,
  }).then((result: any) => {
    expect(
      expect.objectContaining({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          user: {
            id: 3,
            email: 'new-email@msupply.foundation',
            first_name: 'Carl',
            last_name: 'Smith',
            full_name: 'Carl Smith',
            username: 'carl',
            password_hash: 'XYZ1234',
          },
        },
      })
    )
  })
})

test('Test: Change username by matching username', () => {
  return modifyRecord({
    parameters: {
      tableName: 'user',
      matchField: 'username',
      matchValue: 'ceejay2',
      ...updatedUserByUsername2,
      shouldCreateJoinTable: false,
    },
    ...extraParameters,
  }).then((result: any) => {
    expect(
      expect.objectContaining({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          user: {
            id: 3,
            email: 'new-email@msupply.foundation',
            first_name: 'Carlos',
            last_name: 'Smith',
            full_name: 'Carlos Smith',
            username: 'carlos',
            password_hash: 'XYZ1234',
          },
        },
      })
    )
  })
})

test('Test: creating new field "phone_number" on user', () => {
  return modifyRecord({
    parameters: { tableName: 'user', ...testUser2 },
    ...extraParameters,
  }).then((result: any) => {
    expect(
      expect.objectContaining({
        error_log: '',
        output: {
          user: {
            id: 4,
            email: 'test@sussol.net',
            first_name: 'Carl',
            last_name: 'Smith',
            full_name: 'Carl Smith',
            password_hash: 'XYZ1234',
            username: 'ceejay',
            // Should convert to snake case automatically
            phone_number: '111234',
          },
        },
        status: ActionQueueStatus.Success,
      })
    )
  })
})

// Organisation Tests

const testOrg = {
  name: 'PharmaFarm',
  registration: 'AVC123',
  address: '123 Uptown Drive\nAuckland',
}

const testOrg2 = {
  name: 'Import This!',
  registration: undefined,
}

test('Test: add Org to database', () => {
  return modifyRecord({
    parameters: { tableName: 'organisation', ...testOrg },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        organisation: {
          id: 2,
          is_system_org: false,
          name: 'PharmaFarm',
          registration: 'AVC123',
          address: '123 Uptown Drive\nAuckland',
          logo_url: null,
        },
      },
    })
  })
})

test('Test: add Org2 -- not all parameters provided', () => {
  return modifyRecord({
    parameters: { tableName: 'organisation', ...testOrg2 },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        organisation: {
          id: 3,
          is_system_org: false,
          name: 'Import This!',
          registration: null,
          address: null,
          logo_url: null,
        },
      },
    })
  })
})

test('Test: Update existing organisation', () => {
  return modifyRecord({
    parameters: { tableName: 'organisation', id: 1, registration: '123456789' },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        organisation: {
          id: 1,
          is_system_org: true,
          name: 'Food and Drug Authority',
          registration: '123456789',
          address: null,
          logo_url: '/file?uid=CylhAzxRhSX_QjtArq3bi',
        },
      },
    })
  })
})

test('Test: Check creating of application join record', () => {
  return modifyRecord({
    parameters: { tableName: 'user', username: 'new', email: 'new@new.com' },
    ...extraParameters,
  }).then(async (result: any) => {
    const queryResult = await DBConnect.query({
      text: 'SELECT * from user_application_join where user_id = $1',
      values: [result.output.user.id],
    })

    expect(queryResult.rows).toEqual([{ application_id: 1, id: 5, user_id: 6 }])
  })
})

test('Test: add single record to new table', () => {
  return modifyRecord({
    parameters: {
      tableName: 'test',
      name: 'Hello',
      amount: 5,
      date: '1999-12-22',
      spare: null,
      spare2: undefined,
    },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        data_table_test: {
          id: 1,
          name: 'Hello',
          amount: 5,
          date: new Date('1999-12-21T11:00:00.000Z'),
        },
      },
    })
  })
})

test('Test: add multiple records to new table', () => {
  return modifyMultipleRecords({
    parameters: {
      tableName: 'test2',
      records: [
        { name: 'New Record', amount: 5, isCompleted: true },
        { name: 'Another record', amount: 10, isCompleted: false },
        { name: 'Another record', floatingValue: 1.5, amount: undefined },
      ],
    },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      output: {
        records: [
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_2: {
                id: 1,
                name: 'New Record',
                amount: 5,
                is_completed: true,
              },
            },
          },
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_2: {
                id: 2,
                name: 'Another record',
                amount: 10,
                is_completed: false,
              },
            },
          },
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_2: {
                id: 3,
                name: 'Another record',
                amount: null,
                is_completed: null,
                floating_value: 1.5,
              },
            },
          },
        ],
      },
      status: 'SUCCESS',
      error_log: '',
    })
  })
})

test('Test: add multiple records to multiple tables, using keyMap', () => {
  return modifyMultipleRecords({
    parameters: {
      tableName: 'test2',
      records: [
        { tableName: 'test3', fullname: 'New Record', amount: 5, isCompleted: true },
        { fullName: 'Another record', amount: 10, isCompleted: false },
        { fullname: 'Another record', floatingValue: 1.5 },
        { tableName: 'test3', fullName: 'Another record', floatingValue: 1.5 },
      ],
      keyMap: { name: 'fullName' },
      value1: 10,
      booleanValue: true,
    },
    ...extraParameters,
  }).then((result: any) => {
    expect(result).toEqual({
      output: {
        records: [
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_3: {
                id: 1,
                value_1: 10,
                boolean_value: true,
              },
            },
          },
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_2: {
                id: 4,
                name: 'Another record',
                amount: null,
                is_completed: null,
                floating_value: null,
                value_1: 10,
                boolean_value: true,
              },
            },
          },
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_2: {
                id: 5,
                name: null,
                amount: null,
                is_completed: null,
                floating_value: null,
                value_1: 10,
                boolean_value: true,
              },
            },
          },
          {
            status: 'SUCCESS',
            error_log: '',
            output: {
              data_table_test_3: {
                id: 2,
                value_1: 10,
                boolean_value: true,
                name: 'Another record',
              },
            },
          },
        ],
      },
      status: 'SUCCESS',
      error_log: '',
    })
  })
})

// TO-DO: Write some tests to check mapping of "data" fields in single-record
// version
