/*
Contains core actions that must be run for the system to function correctly.
These should NEVER be configurable or removable by template configurations, so
they've been hard-coded here in order to:
- be maintained in one place: a change can be made without having to
  re-configure all templates
- prevent accidental misconfiguration or removal
*/

import { cloneDeep } from 'lodash'
import DBConnect from '../database/databaseConnect'
import { Trigger } from '../../generated/graphql'
import { ActionInTemplate } from '../../types'

type CoreActions = {
  [key in Trigger]?: Omit<ActionInTemplate, 'parameters_evaluated'>[]
}

export const getCoreActions = async (trigger: Trigger, templateId: number) => {
  // Need to make a deep copy of this, otherwise the properties get mutated in
  // place and carry over to the next application using these actions
  const currentCoreActions = cloneDeep(coreActions?.[trigger] ?? [])

  // Inject configuration over-rides for a limited selection of core action
  // parameters (currently only serialPattern)
  switch (trigger) {
    case Trigger.OnApplicationCreate:
      const serialPattern = await DBConnect.getTemplateSerialPattern(templateId)
      if (serialPattern) currentCoreActions[0].parameter_queries.pattern = serialPattern
    // Other cases as required...
  }

  return currentCoreActions
}

const coreActions: CoreActions = {
  [Trigger.OnApplicationCreate]: [
    // Generate serial for application when first created
    // Can be over-ridden by specifying a template action
    {
      code: 'generateTextString',
      path: '../plugins/action_generate_text_string/src/index.ts',
      name: 'Generate Text String',
      trigger: 'ON_APPLICATION_CREATE',
      event_code: null,
      sequence: -3,
      condition: true,
      parameter_queries: {
        pattern: 'S-[A-Z]{3}-<+dddd>',
        fieldName: 'serial',
        tableName: 'application',
        counterName: {
          operator: 'objectProperties',
          children: ['applicationData.templateCode'],
        },
        updateRecord: true,
        noChangeLog: true,
        // Provides functionality to support `<?year>` in pattern string.
        // Add more functionality here as required
        customFields: { year: 'year' },
        additionalData: {
          operator: 'buildObject',
          properties: [
            {
              key: 'year',
              value: { operator: 'objectFunctions', children: ['functions.getYear'] },
            },
          ],
        },
      },
    },
    // Set initial stage
    {
      code: 'incrementStage',
      path: '../plugins/action_increment_stage/src/index.ts',
      name: 'Increment Stage',
      trigger: 'ON_APPLICATION_CREATE',
      event_code: null,
      sequence: -2,
      condition: true,
      parameter_queries: {},
    },
    // Generate initial name for application based on template code and serial
    {
      code: 'generateTextString',
      path: '../plugins/action_generate_text_string/src/index.ts',
      name: 'Generate Text String',
      trigger: 'ON_APPLICATION_CREATE',
      event_code: null,
      // Sequence set high so it goes AFTER template actions
      sequence: -1,
      condition: true,
      parameter_queries: {
        pattern: '<?templateName> - <?serial>',
        fieldName: 'name',
        tableName: 'application',
        customFields: {
          serial: 'applicationData.applicationSerial',
          templateName: 'applicationData.templateName',
        },
        updateRecord: true,
        noChangeLog: true,
      },
    },
  ],
  [Trigger.OnApplicationRestart]: [
    // Change application status from CHANGES REQUIRED to DRAFT when the
    // applicant restarts an application with to-do updates (as requested in
    // review)
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_APPLICATION_RESTART',
      event_code: null,
      sequence: -1,
      condition: true,
      parameter_queries: { newStatus: 'DRAFT' },
    },
  ],
  [Trigger.OnApplicationSubmit]: [
    // Set status = SUBMITTED when applicant submits (or re-submits)
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -6,
      condition: true,
      parameter_queries: { newStatus: 'SUBMITTED' },
    },
    // Remove duplicate/unchanged application responses since previous
    // application submission
    {
      code: 'trimResponses',
      path: '../plugins/action_trim_responses/src/index.ts',
      name: 'Trim duplicate responses',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -5,
      condition: true,
      parameter_queries: {},
    },
    // Generate level 1 review assignments in current stage after application is
    // submitted by the applicant
    {
      code: 'generateReviewAssignments',
      path: '../plugins/action_generate_review_assignment_records/src/index.ts',
      name: 'Generate Review Assignment Records',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -4,
      condition: true,
      parameter_queries: {},
    },
    // Remove any files that were uploaded but not submitted as part of the
    // application
    {
      code: 'cleanupFiles',
      path: '../plugins/action_files_cleanup/src/index.ts',
      name: 'Clean up application files',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -3,
      condition: true,
      parameter_queries: {},
    },
    // Update reviews status with review assignment linked to changed responses
    // by applicant when application is resubmitted.
    {
      code: 'updateReviewStatuses',
      path: '../plugins/action_update_review_statuses/src/index.ts',
      name: 'Update Review Statuses',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -2,
      condition: true,
      parameter_queries: {
        changedResponses: {
          operator: 'objectProperties',
          children: ['outputCumulative.updatedResponses'],
        },
      },
    },

    // Change outcome to APPROVED if there are no other "changeOutcome" actions
    // associated with this template.
    {
      code: 'changeOutcome',
      path: '../plugins/action_change_outcome/src/index.ts',
      name: 'Change Outcome',
      trigger: 'ON_APPLICATION_SUBMIT',
      event_code: null,
      sequence: -1,
      // Condition checks that the templates is not reviewable (no associated
      // templateStageReviewLevels) and that there are no other "changeOutcome"
      // actions implemented
      condition: {
        operator: 'AND',
        children: [
          {
            operator: '=',
            children: [
              {
                operator: 'graphQL',
                children: [
                  'query getChangeOutcomeActionCount($templateId: Int!) {\n  templateActions(\n    condition: { templateId: $templateId, actionCode: "changeOutcome" }\n  ) {\n    totalCount\n  }\n}\n',
                  'graphQLEndpoint',
                  ['templateId'],
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.templateId', null],
                  },
                  'templateActions.totalCount',
                ],
              },
              0,
            ],
          },
          {
            operator: '=',
            children: [
              {
                operator: 'graphQL',
                children: [
                  'query getTotalReviewCount($templateId: Int!) {\n  templateStageReviewLevels(filter: {stage: {templateId: {equalTo: $templateId}}}) {\n    totalCount\n  }\n}',
                  'graphQLEndpoint',
                  ['templateId'],
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.templateId', null],
                  },
                  'templateStageReviewLevels.totalCount',
                ],
              },
              0,
            ],
          },
        ],
      },
      parameter_queries: {
        newOutcome: 'APPROVED',
      },
    },
  ],
  [Trigger.OnReviewAssign]: [
    // If any reviews already exist for the current assignment, set them to
    // "DRAFT" (this would happen if the reviewer had been unasssigned and then
    // re-assigned)
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_ASSIGN',
      event_code: null,
      sequence: -1,
      condition: {
        operator: '!=',
        children: [
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.reviewId', null],
          },
          null,
        ],
      },
      parameter_queries: {
        isReview: true,
        newStatus: 'DRAFT',
      },
    },
  ],
  [Trigger.OnReviewCreate]: [
    // Set to DRAFT when reviewer starts their review
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_CREATE',
      event_code: '',
      sequence: -1,
      condition: true,
      parameter_queries: { newStatus: 'DRAFT' },
    },
  ],
  [Trigger.OnReviewRestart]: [
    // Set to DRAFT when reviewer re-starts their review after an applicant
    // re-submission or change request from higher-level reviewer
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_RESTART',
      event_code: '',
      sequence: -1,
      condition: true,
      parameter_queries: { newStatus: 'DRAFT' },
    },
  ],
  [Trigger.OnReviewSubmit]: [
    // Set review status to SUBMITTED when reviewer submits review
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: '',
      sequence: -6,
      condition: true,
      parameter_queries: { newStatus: 'SUBMITTED' },
    },

    // Remove duplicated and unchanged responses or ones without a decision made
    // when review is re-submitted by the reviewer.
    {
      code: 'trimResponses',
      path: '../plugins/action_trim_responses/src/index.ts',
      name: 'Trim duplicate review responses',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: '',
      sequence: -5,
      condition: true,
      parameter_queries: {
        operator: 'objectProperties',
        children: ['outputCumulative.reviewStatusHistoryTimestamp'],
      },
    },
    // Update other review status to PENDING or CHANGES REQUESTED after one
    // review is submitted to another reviewer in the chain of review-levels
    {
      code: 'updateReviewStatuses',
      path: '../plugins/action_update_review_statuses/src/index.ts',
      name: 'Update Review Statuses',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: null,
      sequence: -4,
      condition: true,
      parameter_queries: {
        changedResponses: {
          operator: 'objectProperties',
          children: ['outputCumulative.updatedResponses'],
        },
      },
    },

    // If sent back to applicant for further information (LOQ), this sets which
    // review responses are visible to the applicant
    {
      code: 'updateReviewVisibility',
      path: '../plugins/action_update_review_visibility/src/index.ts',
      name: "Update Applicant's Review Visibility",
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: '',
      sequence: -3,
      condition: {
        operator: 'AND',
        children: [
          {
            operator: '=',
            children: [
              {
                operator: 'objectProperties',
                children: ['applicationData.reviewData.latestDecision.decision'],
              },
              'LIST_OF_QUESTIONS',
            ],
          },
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.isLastLevel'],
          },
        ],
      },
      parameter_queries: {},
    },
    // Change status to "CHANGES_REQUIRED" if last level and decision = LOQ
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: null,
      sequence: -2,
      condition: {
        operator: 'AND',
        children: [
          {
            operator: '=',
            children: [
              {
                operator: 'objectProperties',
                children: ['applicationData.reviewData.latestDecision.decision'],
              },
              'LIST_OF_QUESTIONS',
            ],
          },
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.isLastLevel'],
          },
        ],
      },
      parameter_queries: {
        isReview: false,
        newStatus: 'CHANGES_REQUIRED',
      },
    },
    // Change outcome accordingly if final level and stage is CONFORM or
    // NON_CONFORM
    {
      code: 'changeOutcome',
      path: '../plugins/action_change_outcome/src/index.ts',
      name: 'Change Outcome',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: null,
      sequence: -1,
      condition: {
        operator: 'AND',
        children: [
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.isLastStage'],
          },
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.isLastLevel'],
          },
          {
            operator: 'OR',
            children: [
              {
                operator: '=',
                children: [
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.reviewData.latestDecision.decision'],
                  },
                  'CONFORM',
                ],
              },
              {
                operator: '=',
                children: [
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.reviewData.latestDecision.decision'],
                  },
                  'NON_CONFORM',
                ],
              },
            ],
          },
        ],
      },
      parameter_queries: {
        newOutcome: {
          operator: '?',
          children: [
            {
              operator: '=',
              children: [
                {
                  operator: 'objectProperties',
                  children: ['applicationData.reviewData.latestDecision.decision', null],
                },
                'CONFORM',
              ],
            },
            'APPROVED',
            'REJECTED',
          ],
        },
      },
    },
    // Will increment stage if and only if last-level decision is "CONFORM" AND
    // all reviewable questions have been approved/agreed -- this prevents a
    // partial consolidation (with approval) from moving to the next stage. Any
    // other cases for incrementing stage must be specified in template actions.
    {
      code: 'incrementStage',
      path: '../plugins/action_increment_stage/src/index.ts',
      name: 'Increment Stage',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: null,
      // This will make this action run after other specific actions defined
      sequence: 99,
      condition: {
        operator: 'AND',
        children: [
          {
            operator: 'objectProperties',
            children: ['applicationData.reviewData.isLastLevel'],
          },
          {
            operator: '=',
            children: [
              {
                operator: 'objectProperties',
                children: ['applicationData.reviewData.latestDecision.decision'],
              },
              'CONFORM',
            ],
          },
          {
            operator: '=',
            children: [
              {
                operator: 'graphQL',
                children: [
                  'query approvedAssignedQuestionsCount(\n  $appId: Int!\n  $stageId: Int!\n  $levelNumber: Int!\n) {\n  assignedQuestions(\n    appId: $appId\n    stageId: $stageId\n    levelNumber: $levelNumber\n    filter: {\n      or: [{ decision: { equalTo: APPROVE } }, { decision: { equalTo: AGREE } }]\n    }\n  ) {\n    totalCount\n  }\n}',
                  'graphqlendpoint',
                  ['appId', 'stageId', 'levelNumber'],
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.applicationId', null],
                  },
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.stageId', null],
                  },
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.reviewData.levelNumber', null],
                  },
                  'assignedQuestions.totalCount',
                ],
              },
              {
                operator: 'graphQL',
                children: [
                  'query reviewableQuestionsCount($appId: Int!) {\n  reviewableQuestionsCount(\n    appId: $appId\n  )\n}',
                  'graphqlendpoint',
                  ['appId'],
                  {
                    operator: 'objectProperties',
                    children: ['applicationData.applicationId', null],
                  },
                  'reviewableQuestionsCount',
                ],
              },
            ],
          },
        ],
      },
      parameter_queries: {},
    },
    // Generate review assignments for next stage/level
    {
      code: 'generateReviewAssignments',
      path: '../plugins/action_generate_review_assignment_records/src/index.ts',
      name: 'Generate Review Assignment Records',
      trigger: 'ON_REVIEW_SUBMIT',
      event_code: null,
      // Needs to go AFTER any possible "incrementStage" action
      sequence: 100,
      condition: true,
      parameter_queries: {},
    },
  ],
  [Trigger.OnReviewUnassign]: [
    // If any reviews for this assignment already exist, then set them to
    // DISCONTINUED
    {
      code: 'changeStatus',
      path: '../plugins/action_change_status/src/index.ts',
      name: 'Change Status',
      trigger: 'ON_REVIEW_UNASSIGN',
      event_code: null,
      sequence: -1,
      condition: {
        operator: '!=',
        children: [
          {
            children: ['applicationData.reviewData.reviewId', null],
            operator: 'objectProperties',
          },
          null,
        ],
      },
      parameter_queries: {
        isReview: true,
        newStatus: 'DISCONTINUED',
      },
    },
  ],
  [Trigger.OnExtend]: [
    // Set application outcome back to PENDING (from EXPIRED) if
    // applicantDeadline is extended.
    {
      code: 'changeOutcome',
      path: '../plugins/action_change_outcome/src/index.ts',
      name: 'Change Outcome',
      trigger: 'ON_EXTEND',
      event_code: null,
      sequence: -1,
      condition: true,
      parameter_queries: {
        newOutcome: 'PENDING',
      },
    },
  ],
}
