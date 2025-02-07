// Test suite for the generateReviewAssignments Action

// NOTE: Just checks that Actions returns expected ouput, doesn't check that
// database has entered correct information

import { map, omit } from 'lodash'
import DBConnect from '../../../src/components/database/databaseConnect'
import { ActionQueueStatus, ReviewAssignmentStatus } from '../../../src/generated/graphql'
import { action as generateReviewAssignments } from './index'
import { ResultObject } from './types'

const removeTimeStageCreated = (reviewAssignment: any) =>
  omit(reviewAssignment, ['timeStageCreated'])

const clearResult = (result: any) => ({
  ...result,
  output: {
    levels: result.output.levels.map((level: ResultObject) => ({
      ...level,
      reviewAssignments: map(level.reviewAssignments, removeTimeStageCreated),
    })),
  },
})

// Simulate application submission:

// Create new reviewAssignments but with locked status since already one is Assigned
test('Test: Submit Application ID#4001 - Stage 1 (Last level)', () => {
  //stageNumber: 1, stageId: 5, levels: 1
  return generateReviewAssignments({
    parameters: { applicationId: 4001 },
    DBConnect,
  }).then((result: any) => {
    expect(clearResult(result)).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        levels: [
          {
            reviewAssignments: [
              {
                reviewerId: 6,
                organisationId: null,
                stageId: 5,
                stageNumber: 1,
                status: ReviewAssignmentStatus.Assigned,
                applicationId: 4001,
                allowedSections: null,
                levelNumber: 1,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: false,
              },
              {
                reviewerId: 7,
                organisationId: null,
                stageId: 5,
                stageNumber: 1,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4001,
                allowedSections: null,
                levelNumber: 1,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: true,
              },
              {
                reviewerId: 8,
                organisationId: null,
                stageId: 5,
                stageNumber: 1,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4001,
                allowedSections: null,
                levelNumber: 1,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: true,
              },
              {
                reviewerId: 12,
                organisationId: null,
                stageId: 5,
                stageNumber: 1,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4001,
                allowedSections: null,
                levelNumber: 1,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: true,
              },
              {
                reviewerId: 13,
                organisationId: null,
                stageId: 5,
                stageNumber: 1,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4001,
                allowedSections: null,
                levelNumber: 1,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: true,
              },
            ],
            reviewAssignmentIds: [1005, 1068, 1069, 1070, 1071],
            reviewAssignmentAssignerJoins: [],
            reviewAssignmentAssignerJoinIds: [],
            removedAssignmentIds: [],
            stageNumber: 1,
            reviewLevel: 1,
          },
        ],
      },
    })
  })
})

test('Test: Submit Application ID#4002 - Stage 2 Lvl1', () => {
  return generateReviewAssignments({
    parameters: { applicationId: 4002 }, // stageNumber: 2, stageId: 6, levels: 2
    DBConnect,
  }).then((result: any) => {
    expect(clearResult(result)).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        levels: [
          {
            reviewAssignments: [
              {
                reviewerId: 6,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                status: ReviewAssignmentStatus.Assigned,
                applicationId: 4002,
                allowedSections: ['S1'],
                levelNumber: 1,
                isLastLevel: false,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: false,
                isLocked: false,
              },
              {
                reviewerId: 7,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                status: ReviewAssignmentStatus.Assigned,
                applicationId: 4002,
                allowedSections: ['S2'],
                levelNumber: 1,
                isLastLevel: false,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: false,
                isLocked: false,
              },
              {
                reviewerId: 14,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4002,
                allowedSections: ['S1', 'S2'],
                levelNumber: 1,
                isLastLevel: false,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: false,
                isLocked: false,
              },
              {
                reviewerId: 15,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4002,
                allowedSections: ['S1', 'S2'],
                levelNumber: 1,
                isLastLevel: false,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: false,
                isLocked: false,
              },
            ],
            reviewAssignmentIds: [1007, 1008, 1076, 1077],
            reviewAssignmentAssignerJoins: [
              {
                assignerId: 10,
                orgId: null,
                reviewAssignmentId: 1007,
              },
              {
                assignerId: 11,
                orgId: null,
                reviewAssignmentId: 1007,
              },
              {
                assignerId: 18,
                orgId: null,
                reviewAssignmentId: 1007,
              },
              {
                assignerId: 10,
                orgId: null,
                reviewAssignmentId: 1008,
              },
              {
                assignerId: 11,
                orgId: null,
                reviewAssignmentId: 1008,
              },
              {
                assignerId: 18,
                orgId: null,
                reviewAssignmentId: 1008,
              },
              {
                assignerId: 10,
                orgId: null,
                reviewAssignmentId: 1076,
              },
              {
                assignerId: 11,
                orgId: null,
                reviewAssignmentId: 1076,
              },
              {
                assignerId: 18,
                orgId: null,
                reviewAssignmentId: 1076,
              },
              {
                assignerId: 10,
                orgId: null,
                reviewAssignmentId: 1077,
              },
              {
                assignerId: 11,
                orgId: null,
                reviewAssignmentId: 1077,
              },
              {
                assignerId: 18,
                orgId: null,
                reviewAssignmentId: 1077,
              },
            ],
            reviewAssignmentAssignerJoinIds: [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
            removedAssignmentIds: [],
            stageNumber: 2,
            reviewLevel: 1,
          },
          {
            removedAssignmentIds: [],
            reviewAssignmentAssignerJoinIds: [],
            reviewAssignmentAssignerJoins: [],
            reviewAssignmentIds: [1009, 1010],
            reviewAssignments: [
              {
                allowedSections: null,
                applicationId: 4002,
                isFinalDecision: false,
                isLastLevel: true,
                isLastStage: false,
                isLocked: true,
                isSelfAssignable: true,
                levelNumber: 2,
                organisationId: null,
                reviewerId: 8,
                stageId: 6,
                stageNumber: 2,
                status: 'AVAILABLE',
              },
              {
                allowedSections: null,
                applicationId: 4002,
                isFinalDecision: false,
                isLastLevel: true,
                isLastStage: false,
                isLocked: false,
                isSelfAssignable: true,
                levelNumber: 2,
                organisationId: null,
                reviewerId: 9,
                stageId: 6,
                stageNumber: 2,
                status: 'ASSIGNED',
              },
            ],
            reviewLevel: 2,
            stageNumber: 2,
          },
        ],
      },
    })
  })
})

// Recreated test case for First Review submission (Stage 1 - generate assignment for Stage 2)

// Simulate review submission:

test('Test: Submit Review ID#6003 for Application ID#4002 - Stage 2 Lvl 1 to update existing level 2 assignment', () => {
  return generateReviewAssignments({
    parameters: { applicationId: 4002, reviewId: 6003 }, // stageNumber: 2, stageId: 6, levels: 2
    DBConnect,
  }).then((result: any) => {
    expect(clearResult(result)).toEqual({
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        levels: [
          {
            reviewAssignments: [
              {
                reviewerId: 8,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                levelNumber: 2,
                status: ReviewAssignmentStatus.Available,
                applicationId: 4002,
                allowedSections: null,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: true,
              },
              {
                reviewerId: 9,
                organisationId: null,
                stageId: 6,
                stageNumber: 2,
                levelNumber: 2,
                status: ReviewAssignmentStatus.Assigned,
                applicationId: 4002,
                allowedSections: null,
                isLastLevel: true,
                isLastStage: false,
                isFinalDecision: false,
                isSelfAssignable: true,
                isLocked: false,
              },
            ],
            reviewAssignmentIds: [1009, 1010],
            reviewAssignmentAssignerJoinIds: [],
            reviewAssignmentAssignerJoins: [],
            removedAssignmentIds: [],
            stageNumber: 2,
            reviewLevel: 2,
          },
        ],
      },
    })
  })
})

describe('Move Review to next stage (Final Decision) before generation of reviewAssignments', () => {
  // Setup database
  beforeAll(async (done) => {
    await DBConnect.query({
      text: `
      INSERT INTO public.review_decision (id, decision, review_id)
        VALUES (DEFAULT, 'NON_CONFORM', 7004);
      INSERT INTO public.review_status_history (id, review_id, status)
        VALUES (DEFAULT, 7004, 'SUBMITTED');
      INSERT INTO public.application_stage_history (id, application_id, stage_id, is_current)
        VALUES (1000, 4004, 7, 'True');
      INSERT INTO public.application_status_history (id, application_stage_history_id, status, is_current)
        VALUES (DEFAULT, 1000, 'SUBMITTED', 'True');
      `,
      values: [],
    })
    done()
  })

  test('Submit Review ID#7003 for Application ID#4004 - Stage 2 Lvl 2 to create assignments for Stage 3 (Last Stage) - Final Decision', () => {
    return generateReviewAssignments({
      parameters: { applicationId: 4004, reviewId: 7004 }, // stageNumber: 2, stageId: 7, levels: 2
      DBConnect,
    }).then((result: any) => {
      expect(clearResult(result)).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          levels: [
            {
              reviewAssignments: [
                {
                  reviewerId: 16,
                  organisationId: null,
                  stageId: 7,
                  stageNumber: 3,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4004,
                  allowedSections: null,
                  assignedSections: ['S1', 'S2'],
                  isLastLevel: true,
                  isLastStage: true,
                  isFinalDecision: true,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 17,
                  organisationId: null,
                  stageId: 7,
                  stageNumber: 3,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  assignedSections: ['S1', 'S2'],
                  applicationId: 4004,
                  allowedSections: null,
                  isLastLevel: true,
                  isLastStage: true,
                  isFinalDecision: true,
                  isSelfAssignable: true,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1108, 1109],
              reviewAssignmentAssignerJoins: [],
              reviewAssignmentAssignerJoinIds: [],
              removedAssignmentIds: [],
              stageNumber: 3,
              reviewLevel: 1,
            },
          ],
        },
      })
    })
  })
})

// Simulate new user added with granted permission to review application:

describe('Re-generate reviewAssignments for application on Stage 1 - Level 1', () => {
  // Setup database
  beforeAll(async (done) => {
    await DBConnect.query({
      text: `
      INSERT INTO public."user" (id, first_name, last_name, username)
        VALUES (100, 'TEST', 'USER', 'TEST_USER');
        INSERT INTO public.permission_join (user_id, permission_name_id, is_active)
        VALUES (100, 9, 'True');
      `,
      values: [],
    })
    done()
  })

  // Re-create review assignment for application with same permissionName on Stage1
  test('Test: Re-create assignments for Application ID#4001 - Stage 1 - Adding new review assignment (locked) ', () => {
    //stageNumber: 1, stageId: 5, levels: 1
    return generateReviewAssignments({
      parameters: { applicationId: 4001, isRegeneration: true },
      DBConnect,
    }).then((result: any) => {
      expect(clearResult(result)).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          levels: [
            {
              reviewAssignments: [
                {
                  reviewerId: 6,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 7,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 8,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 12,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 13,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 100,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
              ],
              reviewAssignmentIds: [1005, 1068, 1069, 1070, 1071, 1115],
              reviewAssignmentAssignerJoins: [],
              reviewAssignmentAssignerJoinIds: [],
              removedAssignmentIds: [],
              stageNumber: 1,
              reviewLevel: 1,
            },
          ],
        },
      })
    })
  })
})

// Simulate user that was assigned has revoked permission to review application:

describe('Re-generate reviewAssignments after revoked permission for application on Stage 1 - Level 1', () => {
  // Setup database
  beforeAll(async (done) => {
    await DBConnect.query({
      text: `DELETE FROM public.permission_join where user_id = 6 and permission_name_id = 9`,
      values: [],
    })
    done()
  })

  // Re-create review assignment for application with same permissionName on Stage1
  test('Test: Re-create assignments for Application ID#4001 - Stage 1 - Removing one review assignment', () => {
    //stageNumber: 1, stageId: 5, levels: 1
    return generateReviewAssignments({
      parameters: { applicationId: 4001, isRegeneration: true },
      DBConnect,
    }).then((result: any) => {
      expect(clearResult(result)).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          levels: [
            {
              reviewAssignments: [
                {
                  reviewerId: 7,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 8,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 12,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 13,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
                {
                  reviewerId: 100,
                  organisationId: null,
                  stageId: 5,
                  stageNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4001,
                  allowedSections: null,
                  levelNumber: 1,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1068, 1069, 1070, 1071, 1115],
              reviewAssignmentAssignerJoins: [],
              reviewAssignmentAssignerJoinIds: [],
              removedAssignmentIds: [1005],
              stageNumber: 1,
              reviewLevel: 1,
            },
          ],
        },
      })
    })
  })
})

describe('Re-generate reviewAssignments after granted permission for application on Stage 2 - Level 2 (considering assignments)', () => {
  // Setup database
  beforeAll(async (done) => {
    await DBConnect.query({
      text: `
      INSERT INTO public.permission_join (user_id, permission_name_id, is_active)
        VALUES (100, 11, 'True');
      `,
      values: [],
    })
    done()
  })
  test('Test: Re-create assignments for Application ID#4002 - Stage 2 (Levels 1 & 2) - Adding one review assignment', () => {
    return generateReviewAssignments({
      parameters: { applicationId: 4002, isRegeneration: true }, // stageNumber: 2, stageId: 7, levels: 2
      DBConnect,
    }).then((result: any) => {
      expect(clearResult(result)).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          levels: [
            {
              reviewAssignments: [
                {
                  reviewerId: 6,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: ['S1'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 7,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: ['S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 14,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: ['S1', 'S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 15,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: ['S1', 'S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 100,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: ['S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1007, 1008, 1076, 1077, 1127],
              reviewAssignmentAssignerJoins: [
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1127,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1127,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1127,
                },
              ],
              reviewAssignmentAssignerJoinIds: [
                37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 97, 98, 99,
              ],
              removedAssignmentIds: [],
              stageNumber: 2,
              reviewLevel: 1,
            },
            {
              reviewAssignments: [
                {
                  reviewerId: 8,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 2,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: null,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 9,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 2,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: null,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1009, 1010],
              reviewAssignmentAssignerJoins: [],
              reviewAssignmentAssignerJoinIds: [],
              removedAssignmentIds: [],
              stageNumber: 2,
              reviewLevel: 2,
            },
          ],
        },
      })
    })
  })
})

describe('Re-generate reviewAssignments after revoked permission for application on Stage 2 - Level 2 (considering assignments)', () => {
  // Setup database
  beforeAll(async (done) => {
    await DBConnect.query({
      text: `DELETE FROM public.permission_join WHERE user_id = $1 AND permission_name_id = $2`,
      values: [100, 11],
    })
    done()
  })
  test('Test: Re-create assignments for Application ID#4002 - Stage 2 (Levels 1 & 2) - Removing one review assignment', () => {
    return generateReviewAssignments({
      parameters: { applicationId: 4002, isRegeneration: true }, // stageNumber: 2, stageId: 7, levels: 2
      DBConnect,
    }).then((result: any) => {
      expect(clearResult(result)).toEqual({
        status: ActionQueueStatus.Success,
        error_log: '',
        output: {
          levels: [
            {
              reviewAssignments: [
                {
                  reviewerId: 6,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: ['S1'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 7,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: ['S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 14,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: ['S1', 'S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
                {
                  reviewerId: 15,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 1,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: ['S1', 'S2'],
                  isLastLevel: false,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: false,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1007, 1008, 1076, 1077],
              reviewAssignmentAssignerJoins: [
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1007,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1008,
                },

                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1076,
                },
                {
                  assignerId: 10,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
                {
                  assignerId: 11,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
                {
                  assignerId: 18,
                  orgId: null,
                  reviewAssignmentId: 1077,
                },
              ],
              reviewAssignmentAssignerJoinIds: [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
              removedAssignmentIds: [1127],
              stageNumber: 2,
              reviewLevel: 1,
            },
            {
              reviewAssignments: [
                {
                  reviewerId: 8,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 2,
                  status: ReviewAssignmentStatus.Available,
                  applicationId: 4002,
                  allowedSections: null,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: true,
                },
                {
                  reviewerId: 9,
                  organisationId: null,
                  stageId: 6,
                  stageNumber: 2,
                  levelNumber: 2,
                  status: ReviewAssignmentStatus.Assigned,
                  applicationId: 4002,
                  allowedSections: null,
                  isLastLevel: true,
                  isLastStage: false,
                  isFinalDecision: false,
                  isSelfAssignable: true,
                  isLocked: false,
                },
              ],
              reviewAssignmentIds: [1009, 1010],
              reviewAssignmentAssignerJoins: [],
              reviewAssignmentAssignerJoinIds: [],
              removedAssignmentIds: [],
              stageNumber: 2,
              reviewLevel: 2,
            },
          ],
        },
      })
    })
  })
})
