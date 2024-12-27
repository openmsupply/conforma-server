import config from '../../src/config'
import DB from './databaseMethods'
import { ReviewAssignmentsWithSections } from './types'
import semverCompare from 'semver/functions/compare'
import { execSync } from 'child_process'
import path from 'path'
import { readFileSync } from 'fs'
import bcrypt from 'bcrypt'
import { errorMessage, getAppEntryPointDir } from '../../src/components/utilityFunctions'
import { loadCurrentPrefs, setPreferences } from '../../src/components/preferences'
import { updateReviewerStats } from '../../src/components/database/updateReviewerStats'
import {
  getTemplateLinkedEntities,
  hashLookupTable,
  hashRecord,
} from '../../src/components/template-import-export'

// CONSTANTS
const FUNCTIONS_FILENAME = '43_views_functions_triggers.sql'
const INDEX_FILENAME = '44_index.sql'
const RLS_FILENAME = '45_row_level_security.sql'
const DISABLE_RLS_FILENAME = '46_disable_row_level_security.sql'

const { version } = config
const isManualMigration: Boolean = process.argv[2] === '--migrate'
const simulatedVersion: string | undefined = process.argv[3]

const functionsScript = readFileSync(
  path.join(getAppEntryPointDir(), '../database/buildSchema/', FUNCTIONS_FILENAME),
  'utf-8'
)
const createIndexesScript = readFileSync(
  path.join(getAppEntryPointDir(), '../database/buildSchema/', INDEX_FILENAME),
  'utf-8'
)
const rlsScript = readFileSync(
  path.join(getAppEntryPointDir(), '../database/buildSchema/', RLS_FILENAME),
  'utf-8'
)
const disableRlsScript = readFileSync(
  path.join(getAppEntryPointDir(), '../database/buildSchema/', DISABLE_RLS_FILENAME),
  'utf-8'
)

const migrateData = async () => {
  let databaseVersion: string

  try {
    databaseVersion = (await DB.getDatabaseVersion()).value
  } catch (err) {
    // No version in database yet, so run all migration
    databaseVersion = '0.0.0'
  }

  // A specific database version can be provided when running manually
  if (isManualMigration && simulatedVersion) databaseVersion = simulatedVersion

  // Comparison function using semver parser
  const databaseVersionLessThan = (version: string) =>
    semverCompare(databaseVersion, version) === -1

  // VERSION-SPECIFIC MIGRATION CODE BEGINS HERE

  // v0.1.0
  if (databaseVersionLessThan('0.1.0')) {
    console.log('Migrating to 0.1.0...')
    // Create "system_info" table
    console.log(' - Add system_info TABLE')

    await DB.changeSchema(`
      CREATE TABLE IF NOT EXISTS public.system_info (
        id serial PRIMARY KEY,
        name varchar NOT NULL,
        value jsonb DEFAULT '{}',
        timestamp timestamptz DEFAULT CURRENT_TIMESTAMP
      );
    `)
    console.log('Done migrating on v0.1.0...')
  }

  // v0.2.0
  if (databaseVersionLessThan('0.2.0')) {
    console.log('Migrating to v0.2.0...')

    // Add "assigned_sections" column to schema
    console.log(' - Add review_assignment TABLE field: assigned_sections')

    await DB.changeSchema(`ALTER TABLE review_assignment
        ADD COLUMN IF NOT EXISTS assigned_sections varchar[] DEFAULT array[]::varchar[];`)

    // Update or create review_assignment assigned_sections Trigger/Function
    console.log(' - Add review_assignment_trigger2 TRIGGER field: assigned_sections')
    await DB.changeSchema(
      'DROP TRIGGER IF EXISTS review_assignment_trigger2 ON public.review_assignment'
    ) // CREATE OR REPLACE not working
    await DB.changeSchema('DROP FUNCTION unassign_review_without_sections')

    // Create missing "assigned sections" for existing review_assignments
    console.log(' - Update field in review_assignments TABLE: assigned_sections')

    try {
      const reviewAssignments = await DB.getIncompleteReviewAssignments()
      const reviewAssignmentsWithSections: ReviewAssignmentsWithSections = {}

      reviewAssignments.forEach((ra: any) => {
        const idKey = String(ra.id)
        if (!reviewAssignmentsWithSections[idKey]) reviewAssignmentsWithSections[idKey] = new Set()
        reviewAssignmentsWithSections[idKey].add(ra.code)
      })

      await DB.addAssignedSections(
        Object.entries(reviewAssignmentsWithSections).map(([idKey, assignedSections]) => ({
          id: Number(idKey),
          assignedSections: [...assignedSections],
        }))
      )
    } catch (err) {
      console.log(
        "Assigned sections couldn't be updated, presumably already done:",
        errorMessage(err),
        '\n'
      )
    }

    // DROP review_question_assignment and related views/fields
    console.log(' - Remove column in review_response TABLE: review_question_assignment_id')
    await DB.changeSchema(`ALTER TABLE review_response
        DROP COLUMN IF EXISTS review_question_assignment_id;`)

    console.log(' - Remove review_question_assignment_section VIEW')
    await DB.changeSchema(`DROP VIEW IF EXISTS
      public.review_question_assignment_section;`)

    console.log(' - Remove review_question_assignment TABLE and linked records...')
    await DB.changeSchema(`DROP TABLE IF EXISTS
      public.review_question_assignment CASCADE;`)

    // Run whole activity log build script from scratch
    await execSync(
      `psql -U postgres -q -b -d tmf_app_manager -f "./database/buildSchema/39_activity_log.sql"`
    )

    // Renaming outcome tables to "data"
    console.log(' - Renaming data view tables')
    await DB.changeSchema(`
          ALTER TABLE outcome_display RENAME TO data_view;
          ALTER TABLE outcome_display_column_definition RENAME TO data_view_column_definition;
    `)

    // Common "data" table
    console.log(' - Creating DATA table')
    await DB.changeSchema(`
      CREATE TABLE data_table (
          id serial PRIMARY KEY,
          table_name varchar NOT NULL UNIQUE,
          display_name varchar,
          field_map jsonb,
          is_lookup_table boolean DEFAULT FALSE
      );
    `)

    console.log(' - Moving lookup table data to data table')
    const lookupTableData = await DB.getLookupTableData()
    if (lookupTableData) {
      for (const { name, label, field_map } of lookupTableData) {
        await DB.changeSchema(`ALTER TABLE lookup_table_${name} RENAME TO data_table_${name}`)
        await DB.insertDataTable(name, label, JSON.stringify(field_map), true)
      }
    }
    await DB.changeSchema(`DROP TABLE IF EXISTS lookup_table`)

    console.log('Done migrating on v0.2.0...')
  }

  // v0.3.1
  if (databaseVersionLessThan('0.3.1')) {
    console.log('Migrating to v0.3.1...')

    // Enforce code must be unique per template in template_action table
    console.log(' - Creating unique index for code/template in template_action')
    await DB.changeSchema(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_template_action_code
      ON template_action (code, template_id)
    `)

    console.log(' - Adding new trigger values ON_PREVIEW & ON_EXTEND')
    await DB.changeSchema(`
    ALTER TYPE public.trigger ADD VALUE IF NOT EXISTS
    'ON_PREVIEW' AFTER  'ON_SCHEDULE';
    ALTER TYPE public.trigger ADD VALUE IF NOT EXISTS
    'ON_EXTEND' AFTER  'ON_SCHEDULE';
    `)

    console.log(
      ' - Adding columns to file table: to_be_deleted, is_internal_reference_doc, is_external_reference_doc'
    )
    await DB.changeSchema(`
      ALTER TABLE file
      ADD COLUMN IF NOT EXISTS to_be_deleted boolean DEFAULT FALSE NOT NULL;
      ALTER TABLE file
      ADD COLUMN IF NOT EXISTS is_internal_reference_doc boolean DEFAULT FALSE NOT NULL;
      ALTER TABLE file
      ADD COLUMN IF NOT EXISTS is_external_reference_doc boolean DEFAULT FALSE NOT NULL;
    `)

    console.log(' - Adding reviewability fields to template_element')

    await DB.changeSchema(`
    CREATE TYPE public.is_reviewable_status AS ENUM (
      'ALWAYS',
      'NEVER' );`)

    await DB.changeSchema(`
      ALTER TABLE template_element
        ADD COLUMN IF NOT EXISTS is_reviewable public.is_reviewable_status DEFAULT NULL;
        `)
    // TO-DO: Add "review_required" column for optional reviews

    console.log(' - Adding function to revert outcomes')

    await DB.changeSchema(`
      ALTER TABLE application 
      ALTER COLUMN outcome
      SET DEFAULT 'PENDING';
    `)

    console.log(' - Setting default timestamp on trigger_queue')

    await DB.changeSchema(`
      ALTER TABLE trigger_queue 
      ALTER COLUMN timestamp
      SET DEFAULT CURRENT_TIMESTAMP;
    `)

    console.log(' - Making scheduled time on trigger_schedule non-nullable')

    await DB.changeSchema(`
      ALTER TABLE trigger_schedule
      ALTER COLUMN time_scheduled
      SET NOT NULL;
    `)

    console.log(' - Adding "COMPLETED" status to trigger_queue enum')

    await DB.changeSchema(`
      ALTER TYPE public.trigger_queue_status ADD VALUE IF NOT EXISTS
      'COMPLETED' AFTER  'ERROR';
    `)

    console.log(' - Add "user_id" field to trigger_schedule to track user who made changes')

    await DB.changeSchema(`
      ALTER TABLE trigger_schedule
      ADD COLUMN editor_user_id integer REFERENCES public.user (id) ON DELETE CASCADE;
    `)

    console.log(' - Adding applicant_deadline to application_list')

    // We need to drop and re-create the application_list_shape table so the
    // column order gets preserved, otherwise the subsequent application_list
    // function will fail
    await DB.changeSchema(`
      DROP TABLE IF EXISTS application_list_shape CASCADE;
    `)

    await DB.changeSchema(`
      CREATE TABLE application_list_shape (
        id int,
        "serial" varchar,
        "name" varchar,
        template_code varchar,
        template_name varchar,
        applicant varchar,
        org_name varchar,
        stage varchar,
        stage_colour varchar,
        "status" public.application_status,
        outcome public.application_outcome,
        last_active_date timestamptz,
        applicant_deadline timestamptz,
        -- TO-DO: reviewer_deadline
        assigners varchar[],
        reviewers varchar[],
        reviewer_action public.reviewer_action,
        assigner_action public.assigner_action,
        -- is_fully_assigned_level_1 boolean,
        -- assigned_questions_level_1 bigint,
        total_questions bigint,
        total_assigned bigint,
        total_assign_locked bigint
    );
    `)

    await DB.changeSchema(`
      CREATE OR REPLACE FUNCTION application_list (userid int DEFAULT 0)
      RETURNS SETOF application_list_shape
      AS $$
      SELECT
          app.id,
          app.serial,
          app.name,
          template.code AS template_code,
          template.name AS template_name,
          CONCAT(first_name, ' ', last_name) AS applicant,
          org.name AS org_name,
          stage_status.stage,
          stage_status.stage_colour,
          stage_status.status,
          app.outcome,
          status_history_time_created AS last_active_date,
          ts.time_scheduled AS applicant_deadline,
          assigners,
          reviewers,
          reviewer_action,
          assigner_action,
          total_questions,
          total_assigned,
          total_assign_locked
      FROM
          application app
      LEFT JOIN TEMPLATE ON app.template_id = template.id
      LEFT JOIN "user" ON user_id = "user".id
      LEFT JOIN application_stage_status_latest AS stage_status ON app.id = stage_status.application_id
      LEFT JOIN organisation org ON app.org_id = org.id
      LEFT JOIN assignment_list (stage_status.stage_id) ON app.id = assignment_list.application_id
      LEFT JOIN review_list (stage_status.stage_id, $1) ON app.id = review_list.application_id
      LEFT JOIN assigner_list (stage_status.stage_id, $1) ON app.id = assigner_list.application_id
      LEFT JOIN trigger_schedule ts ON app.id = ts.application_id
        AND ts.is_active = TRUE
        AND ts.event_code = 'applicantDeadline'
      WHERE
          app.is_config = FALSE
        $$
        LANGUAGE sql
        STABLE;
    `)

    console.log(' - Updating activity_log functions')

    await DB.changeSchema(`
      ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS
      'EXTENSION' AFTER 'OUTCOME';
    `)
  }

  // v0.4.2
  if (databaseVersionLessThan('0.4.2')) {
    console.log('Migrating to v0.4.2...')
    console.log(' - Adding MANAGEMENT to UI Locations')

    await DB.changeSchema(`
      ALTER TYPE public.ui_location ADD VALUE IF NOT EXISTS
      'MANAGEMENT' AFTER 'ADMIN';
    `)
  }

  // v0.4.4
  if (databaseVersionLessThan('0.4.4')) {
    console.log('Migrating to v0.4.4...')
    console.log(' - Add "Optional if no response" option to "is_reviewable"')
    await DB.changeSchema(`
      ALTER TYPE public.is_reviewable_status ADD VALUE IF NOT EXISTS
      'OPTIONAL_IF_NO_RESPONSE' AFTER 'NEVER';
    `)

    // This change is really long, but there's no built-in way to drop values
    // from an ENUM. So we have to rename it, drop it and recreate it, as well
    // as drop and rebuild all the other objects that reference it 🙄

    console.log(' - Removes Trigger values: ON_REVIEW_REASSIGN and ON_REVIEW_SELF_ASSIGN')

    // This step seperate as it'll fail if the type has already been redefined
    await DB.changeSchema(`
      UPDATE template_action SET trigger='ON_REVIEW_ASSIGN'
        WHERE trigger='ON_REVIEW_REASSIGN' OR trigger='ON_REVIEW_SELF_ASSIGN';	
    `)

    await DB.changeSchema(`
      ALTER TYPE public.trigger RENAME to trigger_old;

      CREATE TYPE public.trigger AS ENUM
      (
        'ON_APPLICATION_CREATE',
        'ON_APPLICATION_RESTART',
        'ON_APPLICATION_SUBMIT',
        'ON_APPLICATION_SAVE',
        'ON_APPLICATION_WITHDRAW',
        'ON_REVIEW_CREATE',
        'ON_REVIEW_SUBMIT',
        'ON_REVIEW_RESTART',
        'ON_REVIEW_ASSIGN',
        'ON_REVIEW_UNASSIGN',
        'ON_APPROVAL_SUBMIT',
        'ON_VERIFICATION',
        'ON_SCHEDULE',
        'ON_PREVIEW',
        'ON_EXTEND',
        'DEV_TEST',
        'PROCESSING',
        'ERROR'
      );

      ALTER TABLE trigger_queue
        ALTER COLUMN trigger_type TYPE public.trigger
        USING trigger_type::text::public.trigger;    
        
      ALTER TABLE template_action
        ALTER COLUMN trigger TYPE public.trigger
        USING trigger::text::public.trigger;

      DROP TRIGGER IF EXISTS application_trigger ON application;

      ALTER TABLE application
          ALTER COLUMN TRIGGER TYPE public.trigger
          USING TRIGGER::text::public.trigger;
      
      CREATE TRIGGER application_trigger
          AFTER INSERT OR UPDATE OF trigger ON public.application
          FOR EACH ROW
          WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
          EXECUTE FUNCTION public.add_event_to_trigger_queue ();
      
      DROP TRIGGER IF EXISTS trigger_schedule_trigger ON trigger_schedule;
      
      ALTER TABLE trigger_schedule
          ALTER COLUMN TRIGGER TYPE public.trigger
          USING TRIGGER::text::public.trigger;
      
      CREATE TRIGGER trigger_schedule_trigger
          AFTER INSERT OR UPDATE OF trigger ON public.trigger_schedule
          FOR EACH ROW
          WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
          EXECUTE FUNCTION public.add_event_to_trigger_queue ();
      
      DROP TRIGGER IF EXISTS review_assignment_trigger ON review_assignment;
      
      ALTER TABLE review_assignment
          ALTER COLUMN TRIGGER TYPE public.trigger
          USING TRIGGER::text::public.trigger;
      
      CREATE TRIGGER review_assignment_trigger
          AFTER INSERT OR UPDATE OF trigger ON public.review_assignment
          FOR EACH ROW
          WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
          EXECUTE FUNCTION public.add_event_to_trigger_queue ();
      
      DROP TRIGGER IF EXISTS review_trigger ON review;
      
      ALTER TABLE review
          ALTER COLUMN TRIGGER TYPE public.trigger
          USING TRIGGER::text::public.trigger;
      
      CREATE TRIGGER review_trigger
          AFTER INSERT OR UPDATE OF trigger ON public.review
          FOR EACH ROW
          WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
          EXECUTE FUNCTION public.add_event_to_trigger_queue ();
      
      DROP TRIGGER IF EXISTS verification_trigger ON verification;
      
      ALTER TABLE verification
          ALTER COLUMN TRIGGER TYPE public.trigger
          USING TRIGGER::text::public.trigger;
      
      CREATE TRIGGER verification_trigger
          AFTER INSERT OR UPDATE OF trigger ON public.verification
          FOR EACH ROW
          WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
          EXECUTE FUNCTION public.add_event_to_trigger_queue ();
      
      DROP TYPE public.trigger_old;    
    `)

    console.log(' - Adding AWAITING_RESPONSE action to reviewer_action')

    await DB.changeSchema(`
      ALTER TYPE public.reviewer_action ADD VALUE IF NOT EXISTS
      'AWAITING_RESPONSE' AFTER 'UPDATE_REVIEW';
    `)
  }

  // 0.4.5
  if (databaseVersionLessThan('0.4.5')) {
    console.log('Migrating to v0.4.5...')
    // Add "is_latest_review" column to table review_response in schema
    console.log(' - Add is_latest_review to review_response with automatic trigger/update function')

    await DB.changeSchema(`ALTER TABLE review_response
        ADD COLUMN IF NOT EXISTS is_latest_review boolean DEFAULT FALSE;`)

    console.log(
      '- Update to Functions of Activity_log to fix problem with aggregation of assigned_section'
    )

    console.log(' - Add VIEW permission policy type')

    await DB.changeSchema(
      `ALTER TYPE permission_policy_type ADD VALUE IF NOT EXISTS 'VIEW' after 'ASSIGN'`
    )

    console.log(' - Add uniqueness constraint to user_org table')
    await DB.changeSchema(`
    ALTER TABLE user_organisation DROP CONSTRAINT IF EXISTS                     user_organisation_user_id_organisation_id_key;
    
    ALTER TABLE user_organisation ADD CONSTRAINT user_organisation_user_id_organisation_id_key UNIQUE (user_id, organisation_id);
    `)
  }

  // 0.4.6
  if (databaseVersionLessThan('0.4.6')) {
    console.log('Migrating to v0.4.6...')
    console.log(
      ' - Rename TYPE is_reviewable to reviewability and update field in TABLE template_element'
    )

    await DB.changeSchema(
      `
    ALTER TYPE public.is_reviewable_status RENAME TO reviewability;`,
      { silent: true }
    )

    await DB.changeSchema(`
    ALTER TYPE public.reviewability
      ADD VALUE IF NOT EXISTS 'ONLY_IF_APPLICANT_ANSWER' AFTER 'NEVER';`)

    await DB.changeSchema(
      `
    ALTER TABLE public.template_element RENAME COLUMN is_reviewable TO reviewability;`,
      { silent: true }
    )

    console.log(' - Remove 4 unused fields from application_list')
    await DB.changeSchema(
      `ALTER TABLE application_list_shape
        DROP COLUMN IF EXISTS total_questions;
      ALTER TABLE application_list_shape
        DROP COLUMN IF EXISTS total_assigned_submitted;
      ALTER TABLE application_list_shape
        DROP COLUMN IF EXISTS total_assigned;
      ALTER TABLE application_list_shape
        DROP COLUMN IF EXISTS total_assign_locked;`
    )

    console.log(
      ` - Update existing template_element where reviewability is set to NULL to use DEFAULT`
    )

    await DB.changeSchema(`
    UPDATE template_element te
      SET reviewability = 'ONLY_IF_APPLICANT_ANSWER'
      WHERE te.reviewability IS NULL;`)

    await DB.changeSchema(`
      ALTER TABLE public.template_element
        ALTER COLUMN reviewability
          SET NOT NULL,
        ALTER COLUMN reviewability
          SET DEFAULT 'ONLY_IF_APPLICANT_ANSWER';`)

    // Data view filtering
    console.log(' - Update data-view tables for filtering and sorting')
    await DB.changeSchema(`
      ALTER TABLE data_view
        DROP CONSTRAINT IF EXISTS outcome_display_table_name_code_key, 
        ADD COLUMN IF NOT EXISTS table_search_columns varchar[],
        ADD COLUMN IF NOT EXISTS filter_include_columns varchar[],
        ADD COLUMN IF NOT EXISTS filter_exclude_columns varchar[],
        ADD COLUMN IF NOT EXISTS default_sort_column varchar;
          
      ALTER TABLE data_view_column_definition 
        ADD COLUMN IF NOT EXISTS sort_column varchar,
        ADD COLUMN IF NOT EXISTS filter_parameters jsonb,
        ADD COLUMN IF NOT EXISTS filter_expression jsonb,
        ADD COLUMN IF NOT EXISTS filter_data_type varchar,
        ADD COLUMN IF NOT EXISTS sort_column varchar;
        
      ALTER TABLE data_view_column_definition 
        ADD COLUMN IF NOT EXISTS filter_parameters jsonb;`)

    console.log(' - Add timestamp and email_server_log to notification table')
    await DB.changeSchema(`
      ALTER TABLE notification 
        ADD COLUMN IF NOT EXISTS timestamp timestamptz
          DEFAULT CURRENT_TIMESTAMP NOT NULL,
        ADD COLUMN IF NOT EXISTS email_server_log varchar; 
    `)

    console.log(
      ' - Change foreign key constraint on file table to allow changing of application serial'
    )
    await DB.changeSchema(`
      ALTER TABLE file DROP CONSTRAINT IF EXISTS file_application_serial_fkey; 
      ALTER TABLE file ADD CONSTRAINT file_application_serial_fkey FOREIGN KEY (application_serial) REFERENCES application (serial) ON DELETE CASCADE ON UPDATE CASCADE;
      `)

    console.log(' - Add evaluated parameters field to application_responses')
    await DB.changeSchema(`
      ALTER TABLE application_response 
      ADD COLUMN IF NOT EXISTS evaluated_parameters jsonb; 
    `)

    console.log(' - Add case-insensitive unique constraint to usernames')
    // Drop views relating to username temporarily so column can be changed --
    // will re-created in 43_views_functions_indexes
    await DB.changeSchema(`
      DROP VIEW IF EXISTS permissions_all;
      DROP VIEW IF EXISTS user_org_join`)

    await DB.changeSchema(`
      CREATE EXTENSION IF NOT EXISTS citext;
      ALTER TABLE public.user ALTER COLUMN username TYPE citext;
    `)

    console.log(' - Removing unused "is_missing" field from file table')
    await DB.changeSchema(`
      ALTER TABLE public.file DROP COLUMN IF EXISTS is_missing;
    `)
  }

  // v0.5.0
  if (databaseVersionLessThan('0.5.0')) {
    console.log('Migrating to v0.5.0...')

    console.log(' - Add column to data_table to link data views to lookup tables')
    await DB.changeSchema(`
      ALTER TABLE data_table
      ADD COLUMN IF NOT EXISTS data_view_code varchar;
    `)

    console.log(' - Remove type ASSIGN_LOCKED from assign_action ENUM')
    await DB.changeSchema(`
      DROP TYPE IF EXISTS public.assigner_action CASCADE;

      CREATE TYPE public.assigner_action AS ENUM
      (
        'ASSIGN',
        'RE_ASSIGN'
      );
    `)

    console.log(' - Remove any illegal (i.e. overlapping sections) assignment state')
    await DB.changeSchema(`
      UPDATE public.review_assignment
      SET status='ASSIGNED',
      assigned_sections = assigned_sections, \
      trigger = 'DEV_TEST';
    `)

    console.log(' - Simplify how we handle "locked" reviews')
    // We need to drop these first so we can subsequently manipulate
    // review_status and review_status_old.
    await DB.changeSchema(`
      DROP VIEW IF EXISTS assigned_sections_by_stage_and_level CASCADE;
      DROP TYPE IF EXISTS public.review_status_old;
    `)
    await DB.changeSchema(`
      ALTER TABLE public.review_assignment DROP column IF EXISTS
      is_locked;
    `)
    await DB.changeSchema(`
      ALTER TYPE public.review_status RENAME to review_status_old;

      CREATE TYPE public.review_status AS ENUM (
        'DRAFT',
        'SUBMITTED',
        'CHANGES_REQUESTED',
        'PENDING',
        'DISCONTINUED'
    );
    `)

    // The following commands all done in separate "changeSchema" functions, as
    // individually they may fail based on current database state, but we still
    // need to ensure subsequent commands are run
    await DB.changeSchema(
      `
      ALTER TABLE review_status_history
        ALTER COLUMN status TYPE public.review_status
        USING status::text::public.review_status;
      `,
      { silent: true }
    )

    await DB.changeSchema(
      `
      UPDATE public.review_status_history
        SET status = 'PENDING'
        WHERE status = 'LOCKED';
      `,
      { silent: true }
    )

    await DB.changeSchema(`
      DROP function review_status;
      `)
    await DB.changeSchema(`
      DROP TYPE public.review_status_old; 
      `)

    console.log(' - Add serial_pattern field to template')
    await DB.changeSchema(`
      ALTER TABLE public.template
        ADD COLUMN IF NOT EXISTS serial_pattern varchar;
    `)

    console.log(' - Ensure only one review can exist per review assignment')
    // First we need to delete any reviews that are duplicates of the same
    // review assignment before we can add a uniqueness constraint:
    await DB.changeSchema(`
      DELETE FROM public.review a
        USING review b
      WHERE a.id < b.id
      AND a.review_assignment_id = b.review_assignment_id;
    `)
    await DB.changeSchema(`
      ALTER TABLE review
        ADD CONSTRAINT review_review_assignment_id_key UNIQUE (review_assignment_id);
    `)
  }

  // v0.5.2
  if (databaseVersionLessThan('0.5.2')) {
    console.log('Migrating to v0.5.2...')

    console.log(' - Add registration field to application Table')
    await DB.changeSchema(`
      ALTER TABLE public.application
        ADD COLUMN IF NOT EXISTS outcome_registration varchar UNIQUE;
    `)
  }

  if (databaseVersionLessThan('0.5.6')) {
    console.log('Migrating to v0.5.6...')

    console.log(' - Change "default_value" field to "initial_value"')
    await DB.changeSchema(`
      DO $$
      BEGIN
        IF EXISTS(SELECT * FROM information_schema.columns
          WHERE table_name = 'template_element'
          AND column_name = 'default_value')
        THEN
          ALTER TABLE public.template_element
          RENAME COLUMN default_value TO initial_value;
        END IF;
      END $$;
    `)
  }

  if (databaseVersionLessThan('0.5.7')) {
    console.log('Migrating to v0.5.7...')

    console.log(' - Add "default_filter_string" to data_views')
    await DB.changeSchema(`
      ALTER TABLE public.data_view
      ADD COLUMN IF NOT EXISTS default_filter_string varchar;
    `)
  }

  // v0.6.0
  if (databaseVersionLessThan('0.6.0')) {
    console.log('Migrating to v0.6.0...')

    console.log(' - Update FK reference to trigger_queue in action_queue')
    await DB.changeSchema(`
      ALTER TABLE action_queue DROP CONSTRAINT IF EXISTS   
        action_queue_trigger_event_fkey; 
      ALTER TABLE action_queue ADD CONSTRAINT action_queue_trigger_event_fkey
        FOREIGN KEY (trigger_event) REFERENCES trigger_queue (id) ON DELETE CASCADE;
    `)

    console.log(' - Add application_id column to trigger_queue & action_queue')
    if (!(await DB.checkColumnExists('trigger_queue', 'application_id'))) {
      await DB.changeSchema(`
      ALTER TABLE public.trigger_queue
        ADD COLUMN IF NOT EXISTS application_id INTEGER
        REFERENCES public.application (id) ON DELETE CASCADE;
      `)
      console.log(' ...and updating trigger_queue data')
      await DB.populateQueueApplicationIds('trigger_queue')
    }
    if (!(await DB.checkColumnExists('action_queue', 'application_id'))) {
      await DB.changeSchema(`
      ALTER TABLE public.action_queue
        ADD COLUMN IF NOT EXISTS application_id INTEGER
        REFERENCES public.application (id) ON DELETE CASCADE;
      `)
      console.log(' ...and updating action_queue data')
      await DB.populateQueueApplicationIds('action_queue')
    }

    console.log(' - Adding unique identifier column to data view')
    await DB.changeSchema(`
      ALTER TABLE public.data_view   
        ADD COLUMN IF NOT EXISTS identifier VARCHAR UNIQUE;
      UPDATE public.data_view SET identifier = CONCAT(title, '_', id)
        WHERE identifier IS NULL;
      ALTER TABLE public.data_view ALTER COLUMN identifier SET NOT NULL;
      ALTER TABLE public.data_view_column_definition ALTER COLUMN column_name SET NOT NULL;
    `)

    console.log(' - Adding submenu column to data view')
    await DB.changeSchema(`
      ALTER TABLE public.data_view   
        ADD COLUMN IF NOT EXISTS submenu VARCHAR;
    `)

    console.log(' - Adding enabled column to data view')
    await DB.changeSchema(`
      ALTER TABLE public.data_view   
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE NOT NULL;
    `)

    console.log(' - Adding is_submenu column to template_category')
    await DB.changeSchema(`
      ALTER TABLE public.template_category   
        ADD COLUMN IF NOT EXISTS is_submenu BOOLEAN DEFAULT FALSE;
    `)

    console.log(' - Adding dashboard_restrictions to template')
    await DB.changeSchema(`
      ALTER TABLE public.template   
        ADD COLUMN IF NOT EXISTS dashboard_restrictions VARCHAR[];
    `)

    console.log(' - Updating template versioning schema')
    await DB.changeSchema(`
      ALTER TABLE public.template   
        ADD COLUMN IF NOT EXISTS version_id varchar;
      ALTER TABLE public.template
        ADD COLUMN IF NOT EXISTS parent_version_id varchar;
      ALTER TABLE public.template   
        ADD COLUMN IF NOT EXISTS version_comment varchar;
      ALTER TABLE public.template   
        ADD COLUMN IF NOT EXISTS version_history jsonb;
    `)
    // Migrate existing
    await DB.migrateTemplateVersions()
    // Add non-null constraint and remove old version after migrating
    await DB.changeSchema(`
    ALTER TABLE public.template   
      ALTER COLUMN version_id SET NOT NULL;
    ALTER TABLE public.template
      DROP COLUMN IF EXISTS version;
    `)

    console.log(' - Creating archive_path field for files')
    await DB.changeSchema(`
    ALTER TABLE public.file  
      ADD COLUMN IF NOT EXISTS archive_path varchar;
    `)

    console.log(' - Creating file_size field for files')
    await DB.changeSchema(`
    ALTER TABLE public.file  
      ADD COLUMN IF NOT EXISTS file_size bigint;
    `)

    console.log(' - Updating file sizes for existing files')
    await DB.updateFileSizes()
  }

  // v0.7.0
  if (databaseVersionLessThan('0.7.0')) {
    console.log('Migrating to v0.7.0...')

    console.log(' - Updating SMTP config in preferences with password field')
    try {
      const prefs = await loadCurrentPrefs()
      if (prefs?.server?.SMTPConfig && !prefs.server.SMTPConfig.password) {
        prefs.server.SMTPConfig.password = 'env.SMTP_PASSWORD'
        await setPreferences(prefs)
      }
    } catch (err) {
      console.log("Couldn't update preferences -- please fix manually")
    }
  }

  // v0.8.0
  if (databaseVersionLessThan('0.8.0')) {
    console.log('Migrating to v0.8.0...')

    console.log(' - Changing some text fields in user/org to case-insensitive')
    await DB.changeSchema(`
      ALTER TABLE public.user   
        DROP COLUMN IF EXISTS full_name;
      DROP VIEW IF EXISTS user_org_join;
      ALTER TABLE public.user
        ALTER COLUMN first_name TYPE citext;
      ALTER TABLE public.user
        ALTER COLUMN last_name TYPE citext;
      ALTER TABLE public.user
        ADD COLUMN IF NOT EXISTS full_name citext GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
    `)
    await DB.changeSchema(`
      DROP VIEW IF EXISTS permissions_all;    
      ALTER TABLE public.organisation   
        ALTER COLUMN name TYPE citext;
    `)

    console.log(' - Changing text fields in data tables to case-insensitive')
    await DB.convertDataTablesToCaseInsensitive()

    console.log(' - Adding data_changelog table')
    await DB.changeSchema(`
      CREATE TYPE public.changelog_type AS ENUM (
        'CREATE',
        'UPDATE',
        'DELETE'
          );
    `)
    await DB.changeSchema(`
      CREATE TABLE IF NOT EXISTS data_changelog (
        id serial PRIMARY KEY,
        data_table varchar NOT NULL,
        record_id INTEGER NOT NULL,
        update_type changelog_type NOT NULL,
        timestamp timestamptz DEFAULT NOW(),
        old_data jsonb,
        new_data jsonb,
        user_id integer REFERENCES public.user (id) ON DELETE CASCADE,
        org_id integer REFERENCES public.organisation (id) ON DELETE CASCADE,
        username citext REFERENCES public.user (username)
          ON DELETE CASCADE ON UPDATE CASCADE,
        application_id integer REFERENCES public.application (id) ON DELETE CASCADE
      );
    `)

    console.log(' - Adding priority fields to templates and template categories')
    await DB.changeSchema(`
      ALTER TABLE public.template   
        ADD COLUMN IF NOT EXISTS priority INTEGER;
      ALTER TABLE public.template_category   
        ADD COLUMN IF NOT EXISTS priority INTEGER;
    `)

    console.log(' - Adding hide-if-empty option to data view column definitions')
    await DB.changeSchema(`
      ALTER TABLE public.data_view_column_definition   
        ADD COLUMN IF NOT EXISTS hide_if_null BOOLEAN DEFAULT false;
    `)

    console.log(' - Adding single-reviewer option to stage review level')
    await DB.changeSchema(`
      ALTER TABLE public.template_stage_review_level   
        ADD COLUMN IF NOT EXISTS single_reviewer_all_sections BOOLEAN
        NOT NULL DEFAULT false;
    `)
    console.log(
      ' - Update existing review_assignments with correct review_level_id, and make (stageId, number) unique'
    )
    await DB.updateLevelIdInReviewAssignments()

    console.log(' - Adding "comment" field to data_changelog')
    await DB.changeSchema(`
      ALTER TABLE public.data_changelog   
        ADD COLUMN IF NOT EXISTS comment VARCHAR;
    `)

    console.log(' - Removing all illegal generated columns and replacing with standard columns')
    // See
    // https://github.com/msupply-foundation/conforma-server/issues/1090#issuecomment-2005558735
    await DB.changeSchema(`
      ALTER TABLE public.template_element
        DROP COLUMN IF EXISTS template_code,
        DROP COLUMN IF EXISTS template_version;
      ALTER TABLE public.template_element   
        ADD COLUMN IF NOT EXISTS template_code VARCHAR,  
        ADD COLUMN IF NOT EXISTS template_version VARCHAR;
    `)
    await DB.changeSchema(`
      UPDATE public.template_element
        SET template_code = (
          SELECT code FROM template
          WHERE id = (
            SELECT template_id FROM template_section
            WHERE id = section_id
          )
        ),
        template_version = (
          SELECT version_id FROM template
          WHERE id = (
            SELECT template_id FROM template_section
            WHERE id = section_id
          )
        );    
    `)
    await DB.changeSchema(`
      ALTER TABLE public.template_element
        ADD UNIQUE (template_code, code, template_version);
      ALTER TABLE public.template_element
        ALTER COLUMN template_code SET NOT NULL,
        ALTER COLUMN template_version SET NOT NULL;
    `)

    await DB.changeSchema(`
      ALTER TABLE public.application_status_history
        DROP COLUMN IF EXISTS application_id;
      ALTER TABLE public.application_status_history
        ADD COLUMN IF NOT EXISTS application_id INTEGER;
    `)
    await DB.changeSchema(`
      UPDATE public.application_status_history
        SET application_id = (
          SELECT application_id FROM application_stage_history
          WHERE id = application_stage_history_id
        );
    `)
    await DB.changeSchema(`
      ALTER TABLE public.application_status_history
        ALTER COLUMN application_id
        SET NOT NULL;
   `)

    await DB.changeSchema(`
      ALTER TABLE public.review
        DROP COLUMN IF EXISTS application_id CASCADE,
        DROP COLUMN IF EXISTS reviewer_id CASCADE,
        DROP COLUMN IF EXISTS level_number CASCADE,
        DROP COLUMN IF EXISTS stage_number CASCADE,
        DROP COLUMN IF EXISTS time_stage_created CASCADE,
        DROP COLUMN IF EXISTS is_last_level CASCADE,
        DROP COLUMN IF EXISTS is_last_stage CASCADE,
        DROP COLUMN IF EXISTS is_final_decision CASCADE;
      ALTER TABLE public.review
        ADD COLUMN IF NOT EXISTS application_id INTEGER
          REFERENCES public.application (id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS reviewer_id INTEGER
          REFERENCES public.user (id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS level_number INTEGER,
        ADD COLUMN IF NOT EXISTS stage_number INTEGER,
        ADD COLUMN IF NOT EXISTS time_stage_created timestamptz,
        ADD COLUMN IF NOT EXISTS is_last_level BOOLEAN,
        ADD COLUMN IF NOT EXISTS is_last_stage BOOLEAN,
        ADD COLUMN IF NOT EXISTS is_final_decision BOOLEAN;
    `)
    await DB.changeSchema(`
      UPDATE public.review
        SET application_id = (
          SELECT application_id FROM review_assignment
          WHERE id = review_assignment_id
        ),
        reviewer_id = (
          SELECT reviewer_id FROM review_assignment
          WHERE id = review_assignment_id
        ),
        level_number = (
          SELECT level_number FROM review_assignment
          WHERE id = review_assignment_id
        ),
        stage_number = (
          SELECT stage_number FROM review_assignment
          WHERE id = review_assignment_id
        ),
        time_stage_created = (
          SELECT time_stage_created FROM review_assignment
          WHERE id = review_assignment_id
        ),
        is_last_level = (
          SELECT is_last_level FROM review_assignment
          WHERE id = review_assignment_id
        ),
        is_last_stage = (
          SELECT is_last_stage FROM review_assignment
          WHERE id = review_assignment_id
        ),
        is_final_decision = (
          SELECT is_final_decision FROM review_assignment
          WHERE id = review_assignment_id
        );
    `)

    await DB.changeSchema(`
      ALTER TABLE public.review_response
        DROP COLUMN IF EXISTS stage_number;
      ALTER TABLE public.review_response
        ADD COLUMN IF NOT EXISTS stage_number INTEGER;
    `)
    await DB.changeSchema(`
      UPDATE public.review_response
        SET stage_number = (
          SELECT stage_number FROM review
          WHERE id = review_id
        );
    `)

    await DB.changeSchema(`
      ALTER TABLE public.review_assignment
        DROP COLUMN IF EXISTS template_id CASCADE;
      ALTER TABLE public.review_assignment
        ADD COLUMN IF NOT EXISTS template_id INTEGER
        REFERENCES public.template (id) ON DELETE CASCADE;
    `)
    await DB.changeSchema(`
      ALTER TABLE review_assignment DISABLE TRIGGER 
        update_application_reviewer_stats;
      UPDATE public.review_assignment
        SET template_id = (
          SELECT template_id FROM application
          WHERE id = application_id
        );
      ALTER TABLE review_assignment ENABLE TRIGGER               
        update_application_reviewer_stats;
    `)
    await DB.changeSchema(`
      ALTER TABLE public.review_assignment
        ALTER COLUMN template_id
        SET NOT NULL;
    `)
  }

  // v0.9.0 was used for the first version that must be used with databases that
  // have been migrated using the above (0.8) fix.

  // v1.0.0
  if (databaseVersionLessThan('1.0.0')) {
    console.log('Migrating to v1.0.0...')

    console.log(' - Adding reviewer/assigner lists to applications')
    await DB.changeSchema(`
      ALTER TABLE public.application   
        ADD COLUMN IF NOT EXISTS reviewer_list VARCHAR[],
        ADD COLUMN IF NOT EXISTS assigner_list VARCHAR[];
    `)

    console.log(' - Adding application_reviewer_action table')
    await DB.changeSchema(`
      CREATE TABLE IF NOT EXISTS public.application_reviewer_action (
        id serial PRIMARY KEY,
        user_id integer REFERENCES public.user(id)
          ON DELETE CASCADE NOT NULL,
        application_id integer REFERENCES public.application(id)
          ON DELETE CASCADE NOT NULL,
        reviewer_action public.reviewer_action,
        assigner_action public.assigner_action,
        UNIQUE (user_id, application_id)
      );
    `)

    console.log(' - Updating reviewer/assigner lists for ALL applications')
    console.log(' - Creating application_reviewer_action records (This may take a while)')
    await DB.createApplicationReviewerActionRecords()

    // The previous statement we had to create this unique constraint resulted
    // in a new index being created each time it was invoked. So now we ensure
    // the one index we actually want is correctly defined (then we delete all
    // duplicates with 'removeDuplicateIndexes()' later on).
    console.log(' - Fixing unique constraint for template_version/code on template table')

    await DB.changeSchema(`
      ALTER TABLE public.template
        DROP CONSTRAINT IF EXISTS template_code_version_id_key;
      ALTER TABLE public.template
        ADD CONSTRAINT template_code_version_id_key UNIQUE (code, version_id);
      `)

    console.log(' - Adding row-level security to all existing data tables')
    await DB.secureDataTables()

    console.log(' - Making all lookup tables visible via data views')
    await DB.addDataViewsForLookupTables()

    console.log(' - Adding "rawData" columns to data views')
    await DB.changeSchema(`
      ALTER TABLE data_view
        ADD COLUMN IF NOT EXISTS raw_data_include_columns varchar[],
        ADD COLUMN IF NOT EXISTS raw_data_exclude_columns varchar[]`)
  }

  if (databaseVersionLessThan('1.2.1')) {
    console.log('Migrating to v1.2.1...')

    console.log(' - Regenerating all reviewer actions (This may take a while)')

    await DB.changeSchema(functionsScript)

    try {
      const applicationIds = (
        await DB.query({
          text: `
        SELECT DISTINCT(application_id)
        FROM public.application_reviewer_action
        ORDER BY application_id;
        `,
          rowMode: 'array',
        })
      ).rows.flat()
      for (const id of applicationIds) {
        await updateReviewerStats(id)
      }
    } catch (err) {
      console.log('ERROR regenerating reviewer actions')
    }
  }

  if (databaseVersionLessThan('1.4.0')) {
    console.log('Migrating to v1.4.0...')

    console.log(' - Making permission_name_id field on template_permission non-nullable')

    await DB.changeSchema(`
      ALTER TABLE template_permission ALTER COLUMN permission_name_id SET NOT NULL;`)

    console.log(' - Adding checksum fields to template-connected tables')

    const tables = [
      'permission_name',
      'data_view',
      'data_view_column_definition',
      'data_table',
      'template_category',
      'filter',
      'file',
    ]

    for (const table of tables) {
      await DB.changeSchema(`ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS checksum varchar,
        ADD COLUMN IF NOT EXISTS last_modified timestamptz;`)
    }

    for (const tableName of tables) {
      if (tableName === 'data_table') continue
      try {
        const ids = (
          await DB.query({
            text: `
              SELECT id
              FROM ${tableName}
              ORDER BY id;
          `,
            rowMode: 'array',
          })
        ).rows.flat()
        for (const id of ids) {
          await hashRecord({ tableName, id })
        }
      } catch (err) {
        console.log('ERROR generating checksums')
      }
    }

    console.log(' - Updating checksum hashes for lookup tables')

    try {
      const lookupTableIds = (
        await DB.query({
          text: `SELECT id FROM public.data_table
                  WHERE is_lookup_table = TRUE;`,
          rowMode: 'array',
        })
      ).rows.flat()

      for (const tableId of lookupTableIds) {
        await hashLookupTable(tableId)
      }
    } catch (err) {
      console.log('ERROR generating checksums for lookup tables')
    }

    console.log(' - Creating JOIN tables for template-related entities')
    await DB.changeSchema(`
     CREATE TABLE IF NOT EXISTS public.template_data_view_join (
        id serial PRIMARY KEY,
        template_id integer REFERENCES public.template (id) ON DELETE CASCADE NOT NULL,
        data_view_id integer REFERENCES public.data_view (id) ON DELETE CASCADE NOT NULL,
        UNIQUE (template_id, data_view_id)
      );
      CREATE TABLE IF NOT EXISTS public.template_file_join (
        id serial PRIMARY KEY,
        template_id integer REFERENCES public.template (id) ON DELETE CASCADE NOT NULL,
        file_id integer REFERENCES public.file (id) ON DELETE CASCADE NOT NULL,
        UNIQUE (template_id, file_id)
      );
      `)
    console.log(' - Adding join entries for existing files, then removing template_id column')
    try {
      const filesToUpdate = (
        await DB.query({
          text: `
          SELECT id, template_id FROM public.file
          WHERE template_id IS NOT NULL;`,
        })
      ).rows
      for (const file of filesToUpdate) {
        await DB.query({
          text: `
          INSERT INTO public.template_file_join (template_id, file_id)
          VALUES ($1, $2)
          ON CONFLICT(template_id, file_id) DO NOTHING;`,
          values: [file.template_id, file.id],
        })
      }
      await DB.changeSchema(`ALTER TABLE public.file
        DROP COLUMN IF EXISTS template_id;`)
    } catch (err) {
      console.log('ERROR creating Join tables - ' + (err as Error).message)
    }

    console.log(' - Adding linked_entities column to template')
    await DB.changeSchema(`ALTER TABLE public.template
      ADD COLUMN IF NOT EXISTS linked_entity_data jsonb;`)

    console.log(' - Generating linked_entity data for existing templates')
    try {
      const templateIds = (
        await DB.query({
          text: `
        SELECT id FROM public.template
          WHERE version_id NOT LIKE '*%'
          AND linked_entity_data IS NULL;
        `,
          rowMode: 'array',
        })
      ).rows.flat()

      for (const templateId of templateIds) {
        try {
          const linkedEntities = await getTemplateLinkedEntities(templateId)
          await DB.query({
            text: `
          UPDATE template SET linked_entity_data = $2
          WHERE id = $1
          `,
            values: [templateId, JSON.stringify(linkedEntities)],
          })
        } catch (err) {
          console.log(
            `ERROR: Unable to generate linked entity data for template ${templateId} - ${
              (err as Error).message
            }`
          )
        }
      }
    } catch (err) {
      console.log('ERROR generating linked entity data for templates - ' + (err as Error).message)
    }
  }

  // Other version migrations continue here...

  // Update (almost all) Indexes, Views, Functions, Triggers regardless, since
  // they can be dropped and recreated, or updated with no consequence:

  console.log(' - Updating views/functions/triggers')
  await DB.changeSchema(functionsScript)

  console.log(' - Updating indexes...')
  await DB.changeSchema(createIndexesScript)
  // This shouldn't be necessary after v1.0 migration, but can't hurt in case
  // duplicate indexes creep in at some point, or if loading a snapshot that has
  // additional duplicates we haven't yet discovered
  await DB.removeDuplicateIndexes()

  if (process.env.SKIP_RLS === 'true') {
    // This is an "escape-hatch" for when we quickly want to use the system
    // without having to migrate old templates that don't work with the new
    // restrictions.
    console.log('WARNING! - Disabling row-level security...')
    await DB.changeSchema(disableRlsScript)
    await DB.disableDataTableSecurity()
  } else {
    console.log(' - Updating row-level security...')
    await DB.changeSchema(rlsScript)
    await DB.secureDataTables()
  }

  // Finally, set the database version to the current version
  if (databaseVersionLessThan(version)) await DB.setDatabaseVersion(version)

  // A sneaky undocumented tool to let us reset all passwords on a testing
  // system -- USE WITH CAUTION!!!
  const passwordOverride = process.env.USER_PASSWORD_OVERRIDE ?? null
  if (passwordOverride && passwordOverride.length > 30 && !config.isLiveServer) {
    console.log('WARNING: Resetting user passwords for testing purposes...')
    await DB.changeSchema(`
      UPDATE public."user" SET password_hash = '${await bcrypt.hash(
        passwordOverride,
        10
      )}' WHERE username != 'nonRegistered';
    `)
  }
}

// For running migrationScript.ts manually using `yarn migrate`
if (isManualMigration) {
  console.log('Running migration script...')
  migrateData()
    .then(() => {
      console.log('Done!\n')
      process.exit(0)
    })
    .catch((e) => console.log('Error while migrating', e))
}

export default migrateData
