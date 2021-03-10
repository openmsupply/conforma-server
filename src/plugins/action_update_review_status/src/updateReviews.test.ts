// Test suite for the updateReviews Action.

import DBConnect from '../../../components/databaseConnect'

const Action = require('./updateReviews')

// Setup database
// beforeAll(async (done) => {
//   // Duplicate application responses, with some modifications
//   await DBConnect.query({
//     text: `
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1009, 1000, '{"text": "Manufacturer B", "optionIndex": 1}', NULL, 'NOW()');
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1007, 1000, '{"text": "Manufacturer", "optionIndex": 1}', NULL, 'NOW()');
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1006, 1000, '{"text": "12345678"}', NULL, 'NOW()');
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1005, 1000, '{"text": "craig@sussol.net"}', NULL, 'NOW()');
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1004, 1000, '{"text": "craig_drown"}', NULL, 'NOW()');
//   INSERT INTO "public".application_response (id, template_element_id, application_id, "value", is_valid, time_updated) VALUES (DEFAULT, 1002, 1000, '{"text": "Drown"}', NULL, 'NOW()');
//   `,
//     values: [],
//   })
//   // Duplicate review responses, with some modifications
//   await DBConnect.query({
//     text: `
//     INSERT INTO "public".review_response (id, "comment", decision, review_question_assignment_id, application_response_id, review_response_link_id, review_id, time_updated, status) VALUES (DEFAULT, NULL, 'Approve', 1015, 4024, NULL, 5, 'NOW()', 'Submitted');
//     INSERT INTO "public".review_response (id, "comment", decision, review_question_assignment_id, application_response_id, review_response_link_id, review_id, time_updated, status) VALUES (DEFAULT, NULL, 'Approve', 1014, 4023, NULL, 5, 'NOW()', 'Submitted');
//     INSERT INTO "public".review_response (id, "comment", decision, review_question_assignment_id, application_response_id, review_response_link_id, review_id, time_updated, status) VALUES (DEFAULT, NULL, 'Approve', 1013, 4022, NULL, 5, 'NOW()', 'Submitted');
//     INSERT INTO "public".review_response (id, "comment", decision, review_question_assignment_id, application_response_id, review_response_link_id, review_id, time_updated, status) VALUES (DEFAULT, 'This is still not right', 'Decline', 1012, 4021, NULL, 5, 'NOW()', 'Submitted');
//     INSERT INTO "public".review_response (id, "comment", decision, review_question_assignment_id, application_response_id, review_response_link_id, review_id, time_updated, status) VALUES (DEFAULT, NULL, 'Approve', 1011, 4020, NULL, 5, 'NOW()', 'Submitted');`,
//     values: [],
//   })
//   done()
// })

test('Test: Just see what happens', () => {
  return Action.updateReviews({ applicationId: 4000 }, DBConnect).then((result: any) => {
    expect(result).toEqual({
      status: 'Success',
      error_log: '',
      output: {},
    })
  })
})
