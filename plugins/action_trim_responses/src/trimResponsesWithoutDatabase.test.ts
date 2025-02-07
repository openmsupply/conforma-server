// Test suite for the testResponses Action.

import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus, Reviewability } from '../../../src/generated/graphql'
import { action as trimResponses } from './index'
import * as DatabaseMethods from './databaseMethods'

let databaseMethodsDefault = jest.requireActual('./databaseMethods').default
jest.spyOn(DatabaseMethods, 'default').mockImplementation((databaseConnect) => {
  return {
    ...databaseMethodsDefault(databaseConnect),
    deleteApplicationResponses: async (responsesToDelete: number[]) =>
      responsesToDelete.map((id) => ({ applicationResponseId: id, templateElementId: -1 })),
    updateApplicationResponseSubmittedTimestamps: async (responsesToUpdate: number[]) =>
      responsesToUpdate.map((id) => ({ applicationResponseId: id, templateElementId: -1 })),
  }
})

test('trimResponses: trim application responses', async () => {
  let mock = jest.spyOn(DBConnect, 'getAllApplicationResponses').mockImplementation(async () => {
    return [
      { id: 1, template_element_id: 1, value: null },
      {
        id: 2,
        template_element_id: 1,
        value: 'not null',
        is_reviewable: Reviewability.Always,
      },
      { id: 3, template_element_id: 2, value: null },
      { id: 4, template_element_id: 2, value: null, is_reviewable: Reviewability.Always },
      { id: 5, template_element_id: 3, value: null },
      { id: 6, template_element_id: 4, value: null, is_reviewable: Reviewability.Always },
    ]
  })

  let result = await trimResponses({
    parameters: { applicationId: 5 },
    DBConnect,
  })

  expect(mock).toHaveBeenCalledWith(5)

  expect(result).toEqual({
    status: ActionQueueStatus.Success,
    error_log: '',
    output: {
      deletedResponses: [
        { applicationResponseId: 4, templateElementId: -1 },
        { applicationResponseId: 5, templateElementId: -1 },
      ],
      updatedResponses: [
        {
          applicationResponseId: 2,
          templateElementId: -1,
        },
        // Would be deleted before updated
        {
          applicationResponseId: 4,
          templateElementId: -1,
        },
        // Would be deleted before updated
        {
          applicationResponseId: 5,
          templateElementId: -1,
        },
        {
          applicationResponseId: 6,
          templateElementId: -1,
        },
      ],
    },
  })
})
