import { Decision } from '../../../generated/graphql'
import DBConnect from '../../database/databaseConnect'
import { errorMessage } from '../../utilityFunctions'

const databaseMethods = {
  // Gets the application/template info of the "config" application associated
  // with the template specified by "templateCode". If multiple versions of the
  // template exist, it will use the one marked "AVAILABLE" or, if none are
  // available, the most recent version.
  getConfigApplicationInfo: async (templateCode: string) => {
    const text = `
    WITH available_count AS (
      SELECT COUNT(*) FROM template
      WHERE code = $1
      AND status = 'AVAILABLE'
    )
    SELECT app.id as "configId", app.serial as "configSerial",
    app.template_id as "templateId", ts."sectionCodes"
    FROM application app
    JOIN (
      SELECT template_id, array_agg(code) as "sectionCodes" from template_section
      GROUP BY template_id
    ) ts
    ON ts.template_id = app.template_id
    WHERE is_config=true
    AND app.template_id = (
      SELECT id FROM template
      WHERE code = $1
      AND CASE
        WHEN (SELECT count FROM available_count) = 0 THEN version_timestamp = (
        SELECT MAX(version_timestamp) from template
        WHERE code = $1
      ) ELSE status = 'AVAILABLE'
      END
    )`
    try {
      const result = await DBConnect.query({ text, values: [templateCode] })
      if (result.rows.length > 1)
        throw new Error(
          'There is more than one config application for this template type/version. Please remedy this situation.'
        )
      return result.rows[0] ?? {}
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getSerialFromAppId: async (applicationId: number) => {
    const text = `
      SELECT serial FROM application
      WHERE id = $1;
    `
    try {
      const result = await DBConnect.query({ text, values: [applicationId] })
      return result.rows[0].serial
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getAppIdFromSerial: async (serial: string) => {
    const text = `
      SELECT id FROM application
      WHERE serial = $1;
    `
    try {
      const result = await DBConnect.query({ text, values: [serial] })
      return result.rows[0].id
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getSingleReviewAssignment: async (assignmentId: number) => {
    const text = `
      SELECT id, allowed_sections AS "allowedSections"
      FROM review_assignment WHERE id = $1
    `
    try {
      const result = await DBConnect.query({ text, values: [assignmentId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Gets all the review assignments for the specified application at the
  // highest possible stage and review_level
  getReviewAssignments: async (applicationId: number) => {
    const text = `
      WITH max_stage AS (
        SELECT MAX(stage_number) FROM review_assignment
        WHERE application_id = $1
      ), max_review_level AS (
        SELECT MAX(level_number) FROM review_assignment
        WHERE application_id = $1
        AND stage_number = (SELECT max FROM max_stage)
      )
      SELECT id, allowed_sections FROM public.review_assignment
      where application_id = $1
      AND stage_number = (SELECT max FROM max_stage)
      AND level_number = (SELECT max FROM max_review_level)
    `
    try {
      const result = await DBConnect.query({ text, values: [applicationId] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  // Gets all ASSIGNED review assignments for the specified application at the
  // highest possible stage and review_level
  getAssignedReviewAssignments: async (applicationId: number) => {
    const text = `
      WITH max_stage AS (
        SELECT MAX(stage_number) FROM review_assignment
        WHERE application_id = $1 AND status = 'ASSIGNED'
      ), max_review_level AS (
        SELECT MAX(level_number) FROM review_assignment
        WHERE application_id = $1 AND status = 'ASSIGNED'
        AND stage_number = (SELECT max FROM max_stage)
      )
      SELECT id, allowed_sections FROM public.review_assignment
      where application_id = $1 AND status = 'ASSIGNED'
      AND stage_number = (SELECT max FROM max_stage)
      AND level_number = (SELECT max FROM max_review_level)
    `
    try {
      const result = await DBConnect.query({ text, values: [applicationId] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  assignReview: async ({ id, allowedSections }: { id: number; allowedSections: string[] }) => {
    const text = `
      UPDATE review_assignment SET status = 'ASSIGNED', assigned_sections = $1
      WHERE id = $2;
    `
    try {
      const result = await DBConnect.query({ text, values: [allowedSections, id] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  createReview: async (assignmentId: number) => {
    const text = `
      INSERT INTO review (review_assignment_id) VALUES($1)
      returning id;
    `
    try {
      const result = await DBConnect.query({ text, values: [assignmentId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  createReviewDecision: async (reviewId: number) => {
    const text = `
      INSERT INTO review_decision (review_id) VALUES($1)
      returning id;
    `
    try {
      const result = await DBConnect.query({ text, values: [reviewId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getValidReviews: async (applicationId: number) => {
    const text = `
      WITH max_stage AS (
        SELECT MAX(stage_number) FROM review
        WHERE application_id = $1
      ), max_review_level AS (
        SELECT MAX(level_number) FROM review
        WHERE application_id = $1
        AND stage_number = (SELECT max FROM max_stage)
      )
      SELECT id AS "reviewId" FROM review
        WHERE application_id = $1
        AND stage_number = (SELECT max FROM max_stage)
        AND level_number = (SELECT max FROM max_review_level);
    `
    try {
      const result = await DBConnect.query({ text, values: [applicationId] })
      return result.rows
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  updateReviewDecision: async (reviewId: number, decision: Decision, comment: string) => {
    const text = `
    UPDATE review_decision
    SET decision = $1, comment = $2
    WHERE review_id = $3;
    `
    try {
      const result = await DBConnect.query({ text, values: [decision, comment, reviewId] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  getScheduledEvent: async (applicationId: number, eventCode: string) => {
    const text = `
      SELECT * FROM trigger_schedule
      WHERE application_id = $1
      AND event_code = $2;
    `
    try {
      const result = await DBConnect.query({ text, values: [applicationId, eventCode] })
      return result.rows[0]
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
  resetApplication: async (applicationId: number) => {
    // Will cascade to also delete reviews, decisions, responses...
    // Only the application and its responses should remain

    // Using manual parameter replacement here otherwise it doesn't allow
    // multiple statements
    const text = `
      DELETE FROM review_assignment WHERE application_id = $1;
      DELETE FROM application_status_history WHERE application_id = $1;
      DELETE FROM application_stage_history WHERE application_id = $1;
      ALTER TABLE application DISABLE TRIGGER ALL;
      UPDATE application SET outcome = 'PENDING', is_active = true  WHERE id = $1;
      ALTER TABLE application ENABLE TRIGGER ALL;
    `.replace(/\$1/g, String(applicationId))
    try {
      await DBConnect.query({ text })
      return
    } catch (err) {
      console.log(errorMessage(err))
      throw err
    }
  },
}

export default databaseMethods
