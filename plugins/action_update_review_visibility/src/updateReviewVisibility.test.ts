// Test suite for the updateReviewVisibility Action

import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus } from '../../../src/generated/graphql'
import { action as updateReviewVisibility } from './index'

// Setup database
beforeAll(async (done) => {
  // Set field recommended_applicant_visibility on review 6003 (it had two decline review_response, IDs: 4020 & 4021)
  await DBConnect.query({
    text: `
    UPDATE review_response SET recommended_applicant_visibility = 'ORIGINAL_RESPONSE_VISIBLE_TO_APPLICANT' where decision = 'DECLINE' and review_id = 6003
  `,
    values: [],
  })
  done()
})

test('Test: updateReviewVisibility', () => {
  return updateReviewVisibility({ parameters: { reviewId: 6003 }, DBConnect }).then(
    (result: any) => {
      expect(result).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          reviewResponsesWithUpdatedVisibility: [4021, 4020, 10003],
        },
      })
    }
  )
})
