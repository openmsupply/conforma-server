import { ActionPluginInput } from '../../types'
import {
  Reviewer,
  ReviewAssignmentObject,
  ExistingReviewAssignment,
  AssignmentState,
  DeleteReviewAssignment,
  ResultObject,
} from './types'
import databaseMethods from './databaseMethods'
import {
  ActionQueueStatus,
  ApplicationStatus,
  PermissionPolicyType,
  ReviewAssignment,
  ReviewAssignmentStatus,
} from '../../../src/generated/graphql'
import { errorMessage } from '../../../src/components/utilityFunctions'
import { updateReviewerStats } from '../../../src/components/database/updateReviewerStats'
import config from '../../../src/config'

async function generateReviewAssignments({
  parameters,
  applicationData,
  DBConnect,
}: ActionPluginInput) {
  const db = databaseMethods(DBConnect)
  // Get application/reviewId from applicationData if not provided in parameters
  const applicationId = parameters?.applicationId ?? applicationData?.applicationId
  const reviewId = parameters?.reviewId ?? applicationData?.reviewData?.reviewId

  try {
    // Get template information and current stage for application
    const { templateId, status, stageNumber, stageId, stageHistoryTimeCreated } =
      applicationData?.applicationId
        ? applicationData
        : await DBConnect.getApplicationData(applicationId)

    // Find out which is the highest review level that has had review
    // assignments previously generated
    let highestReviewAssignmentLevel = await db.getLastReviewLevel(applicationId, stageNumber)

    // Early return if application still in first Draft -- we don't want
    // review_assignments created. If they already exist, then this must be for
    // Changes Required, so we continue
    if (status === ApplicationStatus.Draft && highestReviewAssignmentLevel == null) {
      console.log(
        `Warning: Application ${applicationId} still in first Draft, so no review assignments generated`
      )
      return {
        status: ActionQueueStatus.Success,
        error_log: `Warning: Application ${applicationId} still in first Draft, so no review assignments generated`,
        output: { levels: [] as ResultObject[] },
      }
    }
    if (highestReviewAssignmentLevel == null) highestReviewAssignmentLevel = 1

    const numReviewLevels = (await DBConnect.getNumReviewLevels(stageId)) || 0

    const sectionCodes = applicationData?.sectionCodes || []

    if (reviewId) {
      const { stageNumber: submittedReviewStage, levelNumber: submittedReviewLevel } =
        await DBConnect.getReviewStageAndLevel(reviewId)
      const output = await generateForNextLevelReviews(
        db,
        applicationId,
        stageNumber,
        stageId,
        stageHistoryTimeCreated,
        templateId,
        reviewId,
        submittedReviewStage,
        submittedReviewLevel,
        numReviewLevels,
        sectionCodes
      )
      // This updates the available reviewer actions (as shown to individual
      // users in the application list) for this application. By adding it to
      // the Throttle, we ensure that it won't execute until this current
      // sequence of actions is complete
      config.Throttle.add({
        name: `Reviewer Action update on Application ${applicationId}`,
        data: applicationId,
        action: updateReviewerStats,
      })
      return output
    }
    // isApplication submission/re-submission
    else {
      const output = generateForAllReviewAssignmentLevels(
        db,
        applicationId,
        stageNumber,
        stageId,
        stageHistoryTimeCreated,
        templateId,
        numReviewLevels,
        highestReviewAssignmentLevel,
        sectionCodes
      )
      config.Throttle.add({
        name: `Reviewer Action update on Application ${applicationId}`,
        data: applicationId,
        action: updateReviewerStats,
      })
      return output
    }
  } catch (error) {
    console.log(errorMessage(error))
    return {
      status: ActionQueueStatus.Fail,
      error_log: 'Problem creating review_assignment records: ' + errorMessage(error),
    }
  }
}

// This function not currently used, but we can re-activate it with a parameter
// flag if we need to use it at some point
const generateForFirstLevelReviews = async (
  db: any,
  applicationId: number,
  stageNumber: number,
  stageId: number,
  stageHistoryTimeCreated: Date,
  templateId: number,
  numReviewLevels: number,
  sectionCodes: string[]
) => {
  console.log('Generating review assignment records for application submission...')
  console.log(`Application ${applicationId} stage ${stageNumber}`)

  const reviewLevel = 1

  const levelResult = await generateReviewAssignmentsInLevel(
    db,
    applicationId,
    stageNumber,
    reviewLevel,
    stageId,
    stageHistoryTimeCreated,
    templateId,
    numReviewLevels,
    sectionCodes
  )

  let result = {
    status: ActionQueueStatus.Success,
    error_log: '',
    output: { levels: [] as ResultObject[] },
  }
  result.output.levels.push(levelResult)

  return result
}

const generateForNextLevelReviews = async (
  db: any,
  applicationId: number,
  currentStageNumber: number,
  stageId: number,
  stageHistoryTimeCreated: Date,
  templateId: number,
  reviewId: number,
  submittedReviewStage: number,
  submittedReviewLevel: number,
  numReviewLevels: number,
  sectionCodes: string[]
) => {
  console.log('Generating review assignment records for review submission...')
  console.log(`Application ${applicationId} stage ${currentStageNumber}\n
  Review ${reviewId} stage ${submittedReviewStage} level ${submittedReviewLevel}`)
  let nextReviewLevel = 1

  if (numReviewLevels === 0) {
    return {
      status: ActionQueueStatus.Success,
      error_log: 'No reviewer with level associated to first stage',
      output: {},
    }
  } else {
    // Review in new stage - first level
    if (submittedReviewStage !== currentStageNumber) {
      if (numReviewLevels === 0)
        return {
          status: ActionQueueStatus.Success,
          error_log: `No reviewer with level associated to stageNumber ${currentStageNumber}`,
          output: {},
        }
    }
    // Review in same stage - for next level
    else {
      nextReviewLevel = submittedReviewLevel + 1
      if (nextReviewLevel > numReviewLevels)
        return {
          status: ActionQueueStatus.Success,
          error_log: 'Final review level reached for current stage',
          output: {},
        }
    }
  }

  const levelResult = await generateReviewAssignmentsInLevel(
    db,
    applicationId,
    currentStageNumber,
    nextReviewLevel,
    stageId,
    stageHistoryTimeCreated,
    templateId,
    numReviewLevels,
    sectionCodes
  )

  let result = {
    status: ActionQueueStatus.Success,
    error_log: '',
    output: { levels: [] as ResultObject[] },
  }

  result.output.levels.push(levelResult)
  return result
}

const generateForAllReviewAssignmentLevels = async (
  db: any,
  applicationId: number,
  stageNumber: number,
  stageId: number,
  stageHistoryTimeCreated: Date,
  templateId: number,
  numReviewLevels: number,
  highestReviewAssignmentLevel: number,
  sectionCodes: string[]
) => {
  console.log('Generating review assignment records for assignments re-generation...')
  console.log(
    `Application ${applicationId} stage ${stageNumber}, highest review level assignments: ${highestReviewAssignmentLevel}`
  )

  // Create array with levels [1,2..,N]
  const arrayLevels = Array.from({ length: highestReviewAssignmentLevel }, (v, k) => k + 1)

  let result = {
    status: ActionQueueStatus.Success,
    error_log: '',
    output: { levels: [] as ResultObject[] },
  }

  // Run loop over all levels until current to generate reviewAssignments
  const values = await Promise.all(
    arrayLevels.map((level) =>
      generateReviewAssignmentsInLevel(
        db,
        applicationId,
        stageNumber,
        level,
        stageId,
        stageHistoryTimeCreated,
        templateId,
        numReviewLevels,
        sectionCodes
      )
    )
  )
  values.map((reviewResult) => result.output.levels.push(reviewResult))

  return result
}

const generateReviewAssignmentsInLevel = async (
  db: any,
  applicationId: number,
  stageNumber: number,
  reviewLevel: number,
  stageId: number,
  stageHistoryTimeCreated: Date,
  templateId: number,
  numReviewLevels: number,
  sectionCodes: string[]
): Promise<ResultObject> => {
  const lastStageNumber: number = await db.getLastStageNumber(applicationId)
  const previousReviewAssignments: ExistingReviewAssignment[] =
    await db.getExistingReviewAssignments(applicationId, stageNumber, reviewLevel)

  const nextLevelReviewers = await db.getPersonnelForApplicationStageLevel(
    templateId,
    stageNumber,
    reviewLevel,
    PermissionPolicyType.Review
  )
  console.log('Existing reviewers for stage/level', nextLevelReviewers)

  const isLastLevel = reviewLevel === numReviewLevels
  const isLastStage = stageNumber === lastStageNumber

  const { createReviewAssignments, deleteReviewAssignments } = await generateNextReviewAssignments(
    previousReviewAssignments,
    reviewLevel,
    nextLevelReviewers,
    applicationId,
    reviewLevel,
    isLastLevel,
    isLastStage,
    stageId,
    stageNumber,
    stageHistoryTimeCreated,
    sectionCodes
  )

  // Delete review_assignment that no longer applies
  const deletedAssignmentIds = await db.removeReviewAssignments(deleteReviewAssignments)

  // Save review_assignment records to database
  const createdReviewAssignmentIds = await db.addReviewAssignments(
    Object.values(createReviewAssignments) as ReviewAssignment[]
  )

  // Generate review_assignment_assigner_joins
  // For now we assume that assigners have no Section restrictions
  console.log('Generating review_assignment_assigner_join records...')
  const availableAssigners = await db.getPersonnelForApplicationStageLevel(
    templateId,
    stageNumber,
    reviewLevel,
    PermissionPolicyType.Assign
  )
  const createdReviewAssignerJoins = []
  for (const reviewAssignmentId of createdReviewAssignmentIds) {
    for (const assigner of availableAssigners) {
      createdReviewAssignerJoins.push({
        assignerId: assigner.userId,
        orgId: assigner.orgId,
        reviewAssignmentId,
      })
    }
  }

  const reviewAssignmentAssignerJoinIds = await db.addReviewAssignmentAssignerJoins(
    createdReviewAssignerJoins
  )

  return {
    reviewAssignments: Object.values(createReviewAssignments),
    reviewAssignmentIds: createdReviewAssignmentIds,
    reviewAssignmentAssignerJoins: createdReviewAssignerJoins,
    reviewAssignmentAssignerJoinIds,
    removedAssignmentIds: deletedAssignmentIds,
    stageNumber,
    reviewLevel,
  } as ResultObject
}

type RegenerateReviewAssignments = (
  previousReviewAssignments: ExistingReviewAssignment[],
  nextReviewLevel: number,
  nextLevelReviewers: Reviewer[],
  applicationId: number,
  levelNumber: number,
  isLastLevel: boolean,
  isLastStage: boolean,
  stageId: number,
  stageNumber: number,
  timeStageCreated: Date,
  sectionCodes: string[]
) => {
  createReviewAssignments: ReviewAssignmentObject
  deleteReviewAssignments: DeleteReviewAssignment[]
}

const generateNextReviewAssignments: RegenerateReviewAssignments = (
  previousReviewAssignments,
  nextReviewLevel,
  nextLevelReviewers,
  applicationId,
  levelNumber,
  isLastLevel,
  isLastStage,
  stageId,
  stageNumber,
  timeStageCreated,
  sectionCodes
) => {
  // Remove from the list of previous reviewAssignments when
  // no longer showing reviewer on nextLevelReviewers (when permission is revoked)
  const existingReviewAssignments = previousReviewAssignments.filter(({ userId }) =>
    nextLevelReviewers.find(({ userId: reviewerId }) => reviewerId === userId)
  )

  // Get list of reviewAssignments to delete (after user has permission revoked)
  const deleteReviewAssignments: DeleteReviewAssignment[] = previousReviewAssignments
    .filter((x) => !existingReviewAssignments.includes(x))
    .map(({ userId }) => ({ userId, applicationId, stageNumber, levelNumber }))

  const createReviewAssignments: ReviewAssignmentObject = {}
  // Build reviewers into object map so we can combine duplicate user_orgs
  // and merge their section code restrictions
  nextLevelReviewers.forEach((reviewer: Reviewer) => {
    // Check if existing review assignment
    const existingAssignment = existingReviewAssignments.find(
      (reviewAssignment) => reviewAssignment.userId === reviewer.userId
    )

    // Get assignmentState with: status, isLocked and isSelfAssigned (to create new or update)
    const assignment = getNewOrExistingAssignmentStatus(
      reviewer.canSelfAssign || nextReviewLevel > 1,
      existingAssignment
    )

    constructReviewAssignmentObject(
      createReviewAssignments,
      reviewer,
      assignment,
      applicationId,
      levelNumber,
      isLastLevel,
      isLastStage,
      stageId,
      stageNumber,
      timeStageCreated
    )
  })

  return { createReviewAssignments, deleteReviewAssignments }
}

// --------- Helper functions ---------

// Build ReviewAssignment object to be generated
const constructReviewAssignmentObject = (
  reviewAssignments: ReviewAssignmentObject,
  reviewer: Reviewer,
  assignment: AssignmentState,
  applicationId: number,
  levelNumber: number,
  isLastLevel: boolean,
  isLastStage: boolean,
  stageId: number,
  stageNumber: number,
  timeStageCreated: Date
) => {
  const { status, isSelfAssignable, assignedSections } = assignment
  const { userId, orgId, allowedSections, canMakeFinalDecision } = reviewer
  const userOrgKey = `${userId}_${orgId ? orgId : 0}`
  if (reviewAssignments[userOrgKey])
    reviewAssignments[userOrgKey].allowedSections =
      mergeAllowedSections(reviewAssignments[userOrgKey].allowedSections, allowedSections) || null
  else
    reviewAssignments[userOrgKey] = {
      reviewerId: userId,
      organisationId: orgId,
      status,
      allowedSections: allowedSections || null,
      assignedSections: assignedSections || null,
      isSelfAssignable: isSelfAssignable || false,
      isFinalDecision: canMakeFinalDecision,
      applicationId,
      levelNumber,
      isLastLevel,
      isLastStage,
      stageId,
      stageNumber,
      timeStageCreated,
    }
}

// Checks if existing assignment, should keep status and update if isLocked
const getNewOrExistingAssignmentStatus = (
  isSelfAssignable: boolean,
  existingAssignment?: ExistingReviewAssignment
): AssignmentState => {
  // Create NEW or update EXISTING ReviewAssignment:
  // 1. If existing - keep same status, isSelfAssignable
  // 2. If new reviewAssignment:
  //   - status = Available (always)
  //   - isSelfAssignable = true if canSelfAssign (Default: false)
  return {
    status: existingAssignment?.status ?? ReviewAssignmentStatus.Available,
    isSelfAssignable: existingAssignment?.isSelfAssignable ?? isSelfAssignable,
  }
}

// Concatenates two arrays, but handles case
// when either or both are null/undefined
const mergeAllowedSections = (prevArray?: string[] | null, newArray?: string[] | null) => {
  if (!prevArray) return newArray
  else if (!newArray) return prevArray
  else return Array.from(new Set([...prevArray, ...newArray]))
}

export default generateReviewAssignments
