// Test suite for the grantPermissions Action -- adds a permisison to valerio user to reviewOrgRego
// Ideally would verify that logic works by checking db (permission_join table) before and after

import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus } from '../../../src/generated/graphql'
import { action as grantPermissions } from './index'

const testParams = {
  username: 'johnny_smith',
  orgId: null,
  permissionNames: ['applyGeneral'],
}

const testParams2 = {
  username: 'carl',
  orgName: 'Medicinal Importers, Ltd.',
  permissionNames: ['reviewOrgRego'],
}

const testParams3 = {
  username: 'nmadruga',
  orgId: 1, // "Drugs-R-Us"
  permissionNames: ['reviewOrgRego'],
}

test('Test: Add permission to John Smith - without an org', () => {
  return grantPermissions({ parameters: testParams, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      output: {
        grantedPermissions: [
          {
            permissionJoinId: 4,
            permissionName: 'applyGeneral',
            permissionNameId: 4,
          },
        ],
      },
      error_log: '',
    })
  })
})

// Run the test twice to show that result doesn't change even if record already exists
test('Test: Add permission to John Smith - without an org, already exists', () => {
  return grantPermissions({ parameters: testParams, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      output: {
        grantedPermissions: [
          {
            permissionJoinId: 4,
            permissionName: 'applyGeneral',
            permissionNameId: 4,
          },
        ],
      },
      error_log: '',
    })
  })
})

// Include an Organisation
test('Test: Add permission to Carl and Medicinal Importers, Ltd.', () => {
  return grantPermissions({ parameters: testParams2, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      output: {
        grantedPermissions: [
          {
            permissionJoinId: 38,
            permissionName: 'reviewOrgRego',
            permissionNameId: 5,
          },
        ],
      },
      error_log: '',
    })
  })
})

// Repeat insert, as above
test('Test: Add permission to Carl and Medicinal Importers, Ltd., already exists', () => {
  return grantPermissions({ parameters: testParams2, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      output: {
        grantedPermissions: [
          {
            permissionJoinId: 38,
            permissionName: 'reviewOrgRego',
            permissionNameId: 5,
          },
        ],
      },
      error_log: '',
    })
  })
})

test('Test: Add permission to Nicole and "Drugs-R-Us" using orgId', () => {
  return grantPermissions({ parameters: testParams3, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      output: {
        grantedPermissions: [
          {
            permissionJoinId: 40,
            permissionName: 'reviewOrgRego',
            permissionNameId: 5,
          },
        ],
      },
      error_log: '',
    })
  })
})
