// Test suite for the testResponses Action.

import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus } from '../../../src/generated/graphql'
import { action as trimResponses } from './index'

// Setup database
beforeAll(async (done) => {
  // Duplicate application responses, with some modifications
  await DBConnect.query({
    text: `
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14001, 4001, 4001, '{"text": "Valerio"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14002, 4002, 4001, '{"text": "Red"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14003, 4003, 4001, '{"text": "jj@nowhere.com"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14004, 4005, 4001, '{"text": "42"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14005, 4006, 4001, '{"text": "Tonga"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14006, 4008, 4001, '{"text": "Vitamin A"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14007, 4009, 4001, '{"text": "Natural Product", "optionIndex": 1}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14008, 4011, 4001, '{"text": "200mg"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14009, 4012, 4001, '{"text": "250"}', 'True');
    INSERT INTO public.application_response (id, template_element_id, application_id, "value", is_valid)
      VALUES (14010, 4013, 4001, '{"text": "No side effects"}', 'True');
    `,
    values: [],
  })
  // Duplicate review responses, with some modifications
  await DBConnect.query({
    text: `
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10000, NULL, 'APPROVE', 4001, 4020, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10001, NULL, 'APPROVE', 4002, 4021, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10002, NULL, 'APPROVE', 4003, 4022, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10003, 'This not right', 'DECLINE', 4005, 4023, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10004, NULL, 'APPROVE', 4006, 4024, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10005, NULL, 'APPROVE', 4008, 4025, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10006, NULL, 'APPROVE', 4009, 4026, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10007, NULL, 'APPROVE', 4011, 4027, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10008, NULL, 'APPROVE', 4012, 4028, NULL, 6003, 'NOW()', 'SUBMITTED');
    INSERT INTO "public".review_response (id, "comment", decision, template_element_id, 
    application_response_id, review_response_link_id, review_id, time_submitted, status) 
      VALUES (10009, NULL, 'APPROVE', 4013, 4029, NULL, 6003, 'NOW()', 'SUBMITTED');
    `,
    values: [],
  })
  done()
})

test('Test: remove unchanged application_response duplicates', () => {
  return trimResponses({ parameters: { applicationId: 4001 }, DBConnect }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        deletedResponses: [
          { applicationResponseId: 14001, templateElementId: 4001 },
          { applicationResponseId: 14002, templateElementId: 4002 },
          { applicationResponseId: 14003, templateElementId: 4003 },
          { applicationResponseId: 14004, templateElementId: 4005 },
          { applicationResponseId: 14005, templateElementId: 4006 },
          { applicationResponseId: 14007, templateElementId: 4009 },
          { applicationResponseId: 14009, templateElementId: 4012 },
        ],
        updatedResponses: [
          { applicationResponseId: 14006, templateElementId: 4008 },
          { applicationResponseId: 14008, templateElementId: 4011 },
          { applicationResponseId: 14010, templateElementId: 4013 },
        ],
      },
    })
  })
})

test('Test: remove unchanged review_response duplicates, with custom timestamp', () => {
  return trimResponses({
    parameters: { reviewId: 6003, timestamp: '2021-03-09T00:01:00.0Z' },
    DBConnect,
  }).then((result: any) => {
    expect(result).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        deletedResponses: [
          { reviewResponseId: 10000, templateElementId: 4001 },
          { reviewResponseId: 10001, templateElementId: 4002 },
          { reviewResponseId: 10002, templateElementId: 4003 },
          { reviewResponseId: 10004, templateElementId: 4006 },
        ],
        updatedResponses: [
          {
            reviewResponseDecision: 'DECLINE',
            reviewResponseId: 10003,
            templateElementId: 4005,
          },
          {
            reviewResponseDecision: 'APPROVE',
            reviewResponseId: 10005,
            templateElementId: 4008,
          },
          {
            reviewResponseDecision: 'APPROVE',
            reviewResponseId: 10006,
            templateElementId: 4009,
          },
          {
            reviewResponseDecision: 'APPROVE',
            reviewResponseId: 10007,
            templateElementId: 4011,
          },
          {
            reviewResponseDecision: 'APPROVE',
            reviewResponseId: 10008,
            templateElementId: 4012,
          },
          {
            reviewResponseDecision: 'APPROVE',
            reviewResponseId: 10009,
            templateElementId: 4013,
          },
        ],
      },
    })
  })
})
