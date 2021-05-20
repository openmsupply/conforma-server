// Test suite for the updateReviews Action.

import DBConnect from '../../../src/components/databaseConnect'
import { ActionQueueStatus, Decision, ReviewStatus } from '../../../src/generated/graphql'
import { action as updateReviewsStatuses } from './index'

// Setup database
beforeAll(async (done) => {
  // Duplicate application responses for re-submission with 2 modifications (Test 1)
  await DBConnect.query({
    text: `
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4001, 4001, '{"text": "Valerio"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4002, 4001, '{"text": "Red"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4003, 4001, '{"text": "jj@nowhere.com"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4005, 4001, '{"text": "42"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4006, 4001, '{"text": "Tonga"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4008, 4001, '{"text": "Vitamin B"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4009, 4001, '{"text": "Natural Product", "optionIndex": 1}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4011, 4001, '{"text": "100mg"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4012, 4001, '{"text": "250"}', 'True', 'NOW()');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid, time_updated) 
      VALUES (DEFAULT, 4013, 4001, '{"text": "Nausea"}', 'True', 'NOW()');
  `,
    values: [],
  })

  // Update review_response to required changes_requested by consolidator1 (Test 2)
  await DBConnect.query({
    text: `
    INSERT INTO public.review_response (id, review_id, review_question_assignment_id, template_element_id, application_response_id, decision, status) 
      VALUES (DEFAULT, 4, 1022, 4001, 4000, 'DISAGREE', 'SUBMITTED');
    INSERT INTO public.review_decision (id, decision, review_id) 
      VALUES (DEFAULT, 'CHANGES_REQUESTED', 4);
    INSERT INTO public.review_status_history (id, review_id, status)
      VALUES (DEFAULT, 4, 'SUBMITTED');
    `,
    values: [],
  })

  // Update review_responses after updating changes_requested to reviewer1 (Test 3)
  await DBConnect.query({
    text: `
    INSERT INTO public.review_response (id, review_id, review_question_assignment_id, template_element_id, application_response_id, decision, status) 
      VALUES (DEFAULT, 7, 3010, 4001, 4020, 'APPROVE', 'SUBMITTED');
    INSERT INTO public.review_response (id, review_id, review_question_assignment_id, template_element_id, application_response_id, decision, status) 
      VALUES (DEFAULT, 7, 3011, 4002, 4021, 'APPROVE', 'SUBMITTED');
    UPDATE public.review_decision SET decision = 'Conform', comment = NULL, time_updated = 'NOW()' WHERE id = 6;
    INSERT INTO public.review_status_history (id, review_id, status)
      VALUES (DEFAULT, 7, 'SUBMITTED');
    `,
    values: [],
  })

  done()
})

test('Application resubmitted with changes => Update review status to PENDING', () => {
  return updateReviewsStatuses({
    parameters: {
      applicationId: 4001,
      changedResponses: [
        { applicationResponseId: 4018, templateElementId: 4012 },
        { applicationResponseId: 4019, templateElementId: 4013 },
      ],
    },
    // @ts-ignore
    applicationData: { stageId: 4 },
    DBConnect,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        updatedReviews: [
          {
            reviewId: 5,
            reviewAssignmentId: 1005,
            applicationId: 4001,
            reviewer_id: 7,
            levelNumber: 1,
            reviewStatus: ReviewStatus.Pending,
          },
        ],
      },
    })
  })
})

test('Review submitted to lower level with changes required => Update lower review status to CHANGES REQUIRED', () => {
  return updateReviewsStatuses({
    parameters: {
      applicationId: 4000,
      changedResponses: [{ applicationResponseId: 4000, templateElementId: 4001 }],
    },
    // @ts-ignore
    applicationData: {
      stageId: 5,
      reviewData: {
        reviewId: 4,
        levelNumber: 2,
        latestDecision: { decision: Decision.ChangesRequested, comment: null },
      },
    },
    DBConnect,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        updatedReviews: [
          {
            reviewId: 2,
            reviewAssignmentId: 1001,
            applicationId: 4000,
            reviewer_id: 7,
            levelNumber: 1,
            reviewStatus: ReviewStatus.ChangesRequested,
          },
        ],
      },
    })
  })
})

test('Review resubmitted to upper level with updated changes => Update upper review status to PENDING', () => {
  return updateReviewsStatuses({
    parameters: {
      applicationId: 4002,
      changedResponses: [
        { applicationResponseId: 4020, templateElementId: 4001 },
        { applicationResponseId: 4021, templateElementId: 4002 },
      ],
    },
    // @ts-ignore
    applicationData: {
      stageId: 5,
      reviewData: {
        reviewId: 6,
        levelNumber: 1,
      },
    },
    DBConnect,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        updatedReviews: [
          {
            reviewId: 8,
            reviewAssignmentId: 1008,
            applicationId: 4002,
            reviewer_id: 8,
            levelNumber: 1,
            reviewStatus: ReviewStatus.Draft,
          },
          {
            reviewId: 9,
            reviewAssignmentId: 1010,
            applicationId: 4002,
            reviewer_id: 10,
            levelNumber: 2,
            reviewStatus: ReviewStatus.Pending,
          },
        ],
      },
    })
  })
})
