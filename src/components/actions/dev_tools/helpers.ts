import { Trigger } from '../../../generated/graphql'
import db from './databaseMethods'

export const selectRandomReviewAssignment = async (
  applicationId: number,
  sectionCodes: string[],
  assigned: boolean = false
) => {
  const reviewAssignments = await (assigned
    ? await db.getAssignedReviewAssignments(applicationId)
    : await db.getReviewAssignments(applicationId)
  )
    .map(({ id, allowed_sections }) => ({
      id,
      allowedSections:
        !allowed_sections || allowed_sections.length === 0 ? sectionCodes : allowed_sections,
    }))
    .sort((a, b) => b.allowedSections.length - a.allowedSections.length)
    .filter(
      ({ allowedSections }, _, arr) => allowedSections.length === arr[0].allowedSections.length
    )

  return reviewAssignments[Math.floor(Math.random() * reviewAssignments.length)]
}

export const getRandomReviewId = async (applicationId: number) => {
  const reviews = await db.getValidReviews(applicationId)
  return reviews[Math.floor(Math.random() * reviews.length)].reviewId
}

// Determines "definitive" appId and serial depending whether one was passed in,
// or if we're just using the "config" application
export const getApplicationBasics = async (
  applicationId: number | undefined,
  serial: string | undefined,
  configId: number,
  configSerial: string
): Promise<{ appId: number; appSerial: string }> => {
  if (!applicationId && !serial) return { appId: configId, appSerial: configSerial }

  if (applicationId) {
    const appSerial = await db.getSerialFromAppId(applicationId)
    return { appId: applicationId, appSerial }
  }

  const appId = await db.getAppIdFromSerial(serial as string)
  return { appId, appSerial: serial as string }
}

export const triggerMap: { [key: string]: Trigger | 'RESET' } = {
  reset: 'RESET',
  test: Trigger.DevTest,
  devtest: Trigger.DevTest,
  start: Trigger.OnApplicationCreate,
  create: Trigger.OnApplicationCreate,
  restart: Trigger.OnApplicationRestart,
  submit: Trigger.OnApplicationSubmit,
  extend: Trigger.OnExtend,
  schedule: Trigger.OnSchedule,
  preview: Trigger.OnPreview,
  assign: Trigger.OnReviewAssign,
  unassign: Trigger.OnReviewUnassign,
  reviewcreate: Trigger.OnReviewCreate,
  reviewstart: Trigger.OnReviewCreate,
  reviewrestart: Trigger.OnReviewRestart,
  reviewsubmit: Trigger.OnReviewSubmit,
  verify: Trigger.OnVerification,
  verification: Trigger.OnVerification,
}

export const mapTriggerShortcut = (inputTrigger: string): Trigger | 'RESET' => {
  const trigger = triggerMap[inputTrigger.toLowerCase()]
  return trigger ? trigger : (inputTrigger as Trigger | 'RESET')
}
