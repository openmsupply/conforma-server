/**
 * Function to update reviewer/assigner stats:
 * - the "reviewer_list" and "assigner_list" on application
 * - the "application_reviewer_action" table, which contains a list of every
 *   reviewer's possible actions (Assign, Review, Re-assign, etc) for every
 *   application they could be interacting with
 *
 * It is called by either:
 * - a notification listener (in postgresConnect), which is notified by triggers
 *   on various tables (see the cases in `updateReviewerStatsFromDBEvent`
 *   below).
 * - the "generateReviewAssignments" Action
 */

import DBConnect from '../../components/database/databaseConnect'
import { errorMessage } from '../utilityFunctions'

const isManualUpdate: Boolean = process.argv[2] === '--update-reviewer-stats'

interface NotificationPayload {
  tableName: string
  data: Record<string, unknown>
  operation: 'UPDATE' | 'INSERT'
}

export const updateReviewerStats = async (applicationId: number, userIds?: number[]) => {
  const db = databaseMethods

  let reviewerIds = userIds ?? (await db.getAllStaffForApplication(applicationId))

  // Update reviewer/assigner lists on application table
  console.log('Updating reviewer/assigner lists for application:', applicationId)
  await db.updateApplicationStaffLists(applicationId)

  // Update application_reviewer_actions
  reviewerIds = reviewerIds.filter((id) => id !== null)

  for (const userId of reviewerIds) {
    console.log(`Updating actions for user ${userId} on application ${applicationId}`)
    await db.upsertReviewerAction(applicationId, userId)
  }

  // Clean up NULL records
  await db.cleanupNullReviewerActions(applicationId)
}

// When triggered by a Database event, this preliminary function gets the
// applicationId and the list of reviewers to update. It is different for each
// trigger case, so this function can standardise the input required by
// `updateReviewerStats`, which does the actual updates
export const updateReviewerStatsFromDBEvent = async ({
  tableName,
  data,
  operation,
}: NotificationPayload) => {
  let applicationId: number = 0
  let reviewerIds: number[] = []

  const db = databaseMethods

  console.log(
    `\nUpdating reviewer action stats due to ${operation} trigger on table: ${tableName} `
  )

  switch (tableName) {
    case 'review_assignment':
      applicationId = data.application_id as number
      // Update ALL staff by leaving reviewerIds empty
      break
    case 'review_status_history':
      const { application_id, reviewer_id, assigner_id } = await db.getApplicationDataFromReview(
        data.review_id as number
      )
      applicationId = application_id
      reviewerIds.push(...new Set([reviewer_id, assigner_id]))
      break
    case 'application':
      applicationId = data.id as number
      // Update ALL staff by leaving reviewerIds empty
      break
  }
  updateReviewerStats(applicationId, reviewerIds.length === 0 ? undefined : reviewerIds)
}

const databaseMethods = {
  updateApplicationStaffLists: async (appId: number) => {
    try {
      const text = `
        WITH lists AS (
                SELECT reviewers, assigners
                FROM single_application_detail($1)
            ) 
        UPDATE public.application
            SET reviewer_list = (SELECT reviewers FROM lists),
            assigner_list = (SELECT assigners FROM lists)
            WHERE id = $1;`
      await DBConnect.query({
        text,
        values: [appId],
      })
    } catch (err) {
      console.log('ERROR updating staff lists for application', appId)
      console.log(errorMessage(err))
      throw err
    }
  },
  getAllStaffForApplication: async (appId: number) => {
    try {
      const text = `
        SELECT DISTINCT reviewer_id FROM review_assignment
            WHERE application_id = $1
        UNION 
        SELECT DISTINCT assigner_id from public.review_assignment_assigner_join
            WHERE review_assignment_id IN (
                SELECT id FROM public.review_assignment
                WHERE application_id = $1
            );
        `
      const result = await DBConnect.query({
        text,
        values: [appId],
        rowMode: 'array',
      })
      return result.rows.flat()
    } catch (err) {
      console.log('ERROR getting staff lists for application', appId)
      console.log(errorMessage(err))
      throw err
    }
  },
  getApplicationDataFromReview: async (reviewId: number) => {
    try {
      const text = `
        SELECT application_id, reviewer_id, assigner_id
            FROM public.review_assignment
            WHERE id = (
                SELECT review_assignment_id
                FROM public.review
                WHERE id = $1
            );
        `
      const result = await DBConnect.query({
        text,
        values: [reviewId],
      })
      const { application_id, reviewer_id, assigner_id } = result.rows[0]
      return { application_id, reviewer_id, assigner_id }
    } catch (err) {
      console.log('ERROR getting application data from review', reviewId)
      console.log(errorMessage(err))
      throw err
    }
  },
  upsertReviewerAction: async (appId: number, userId: number) => {
    try {
      const text = `
        WITH actions AS (
            SELECT reviewer_action, assigner_action
                FROM single_application_detail($1, $2)
            ) 
        INSERT INTO public.application_reviewer_action
            (user_id, application_id, reviewer_action, assigner_action)  
        VALUES(
            $2,
            $1,
            (SELECT reviewer_action FROM actions),
            (SELECT assigner_action FROM actions)
        )
        ON CONFLICT (user_id, application_id)
        DO UPDATE
            SET reviewer_action = (SELECT reviewer_action FROM actions),
            assigner_action = (SELECT assigner_action FROM actions);`
      await DBConnect.query({
        text,
        values: [appId, userId],
      })
    } catch (err) {
      console.log(`ERROR updating actions for user ${userId} on application ${appId}`)
      console.log(errorMessage(err))
      throw err
    }
  },
  cleanupNullReviewerActions: async (appId: number) => {
    try {
      const text = `
        DELETE FROM public.application_reviewer_action
        WHERE application_id = $1
        AND reviewer_action IS NULL
        AND assigner_action IS NULL;`
      await DBConnect.query({
        text,
        values: [appId],
      })
    } catch (err) {
      console.log(`ERROR cleaning up actions for application ${appId}`)
      console.log(errorMessage(err))
      throw err
    }
  },
  getAllApplicationIds: async () => {
    try {
      const text = `SELECT id FROM application;`
      const result = await DBConnect.query({
        text,
        values: [],
        rowMode: 'array',
      })
      return result.rows.flat()
    } catch (err) {
      console.log('ERROR getting applicationIds ')
      console.log(errorMessage(err))
      throw err
    }
  },
}

const updateAllApplications = async () => {
  const appIds = await databaseMethods.getAllApplicationIds()
  console.log(`Updating reviewer actions for ${appIds.length} applications...`)
  for (const id of appIds) {
    await updateReviewerStats(id)
  }
  console.log('DONE')
}

// Manually launch update with command `yarn update-reviewer-stats`
if (isManualUpdate) {
  updateAllApplications().then(() => {
    process.exit(0)
  })
}
