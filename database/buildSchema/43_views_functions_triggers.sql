-- SCHEMA to hide internal functionality from postgraphile graphql schema
-- for example, views that expose tables used in row level policies (to avoid
-- compounding permission queries) will be in private schema and not accessible
-- via graphql
DROP SCHEMA IF EXISTS private CASCADE;
CREATE SCHEMA private;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA private TO graphile_user;
GRANT ALL PRIVILEGES ON SCHEMA private TO graphile_user;
-- VIEWS
-- VIEW table to show users with their organisations
CREATE OR REPLACE VIEW user_org_join AS
SELECT
    "user".id AS user_id,
    username,
    first_name,
    last_name,
    email,
    date_of_birth,
    password_hash,
    organisation_id AS org_id,
    name AS org_name,
    user_role,
    organisation.registration,
    organisation.address,
    logo_url,
    is_system_org
FROM
    "user"
    LEFT JOIN user_organisation ON "user".id = user_id
    LEFT JOIN organisation ON organisation.id = organisation_id;

-- ALL PERMISSIONS View
DROP VIEW IF EXISTS permissions_all;

CREATE VIEW permissions_all AS (
    SELECT
        "user".username AS "username",
        organisation.name AS "orgName",
        "template".code AS "templateCode",
        permission_name.name AS "permissionName",
        permission_name.description AS "description",
        template_permission.stage_number AS "stageNumber",
        template_permission.level_number AS "reviewLevel",
        template_permission.allowed_sections AS "allowedSections",
        template_permission.can_self_assign AS "canSelfAssign",
        template_permission.can_make_final_decision AS "canMakeFinalDecision",
        template_permission.restrictions AS "restrictions",
        permission_policy.name AS "policyName",
        permission_policy.type AS "permissionType",
        permission_policy.is_admin AS "isAdmin",
        permission_policy.id AS "permissionPolicyId",
        permission_policy.rules AS "permissionPolicyRules",
        permission_name.id AS "permissionNameId",
        template_permission.id AS "templatePermissionId",
        "template".id AS "templateId",
        "user".id AS "userId",
        permission_join.id AS "permissionJoinId",
        permission_join.organisation_id AS "orgId",
        CASE WHEN template_category.ui_location @> (ARRAY['USER']::public.ui_location[]) THEN
            TRUE
        ELSE
            FALSE
        END AS "isUserCategory",
        permission_name.is_system_org_permission AS "isSystemOrgPermission",
        permission_join.is_active AS "isActive"
    FROM
        permission_name
    LEFT JOIN permission_join ON permission_join.permission_name_id = permission_name.id
    JOIN permission_policy ON permission_policy.id = permission_name.permission_policy_id
    LEFT JOIN "user" ON permission_join.user_id = "user".id
    LEFT JOIN organisation ON permission_join.organisation_id = organisation.id
    LEFT JOIN template_permission ON template_permission.permission_name_id = permission_name.id
    LEFT JOIN TEMPLATE ON template.id = template_permission.template_id
    LEFT JOIN template_category ON template.template_category_id = template_category.id);

-- Create VIEW which collects ALL application, stage, stage_history, and status_history together
CREATE OR REPLACE VIEW public.application_stage_status_all AS
SELECT
    application.id AS application_id,
    template.id AS template_id,
    template.name AS template_name,
    template.code AS template_code,
    serial,
    application.name,
    session_id,
    user_id,
    org_id,
    stage_id,
    number AS stage_number,
    title AS stage,
    colour AS stage_colour,
    stage.id AS stage_history_id,
    stage.time_created AS stage_history_time_created,
    stage.is_current AS stage_is_current,
    status.id AS status_history_id,
    status.status,
    status.time_created AS status_history_time_created,
    status.is_current AS status_is_current,
    application.outcome
FROM
    application
    JOIN TEMPLATE ON application.template_id = template.id
    LEFT JOIN application_stage_history stage ON application.id = stage.application_id
    LEFT JOIN application_status_history status ON stage.id = status.application_stage_history_id
    LEFT JOIN template_stage ts ON stage.stage_id = ts.id;

-- As above, but only with the CURRENT stage/status
CREATE OR REPLACE VIEW application_stage_status_latest AS
SELECT
    *
FROM
    application_stage_status_all
WHERE (stage_is_current = TRUE
    OR stage_is_current IS NULL)
AND (status_is_current = TRUE
    OR stage_is_current IS NULL);

-- Add triggers to trigger queue
CREATE OR REPLACE FUNCTION public.add_event_to_trigger_queue ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $trigger_queue$
BEGIN
    -- Prevent triggers being added to queue if another one for the same event
    -- is already in progress:
    IF (
            SELECT COUNT(*) FROM trigger_queue
            WHERE trigger_type = NEW.trigger::public.trigger
            AND "table" = TG_TABLE_NAME
            AND record_id = NEW.id
            AND (status = 'TRIGGERED' OR status = 'ACTIONS_DISPATCHED')
        ) > 0 THEN
        RETURN NULL;
    END IF;
    IF TG_TABLE_NAME = 'trigger_schedule' OR TG_TABLE_NAME = 'verification' THEN
        INSERT INTO trigger_queue (trigger_type, "table", record_id, event_code, data, timestamp, status)
            VALUES (NEW.trigger::public.trigger, TG_TABLE_NAME, NEW.id, NEW.event_code, NEW.data, CURRENT_TIMESTAMP, 'TRIGGERED');
        EXECUTE format('UPDATE %s SET trigger = %L WHERE id = %s', TG_TABLE_NAME, 'PROCESSING', NEW.id);
        RETURN NULL;
    ELSE
        INSERT INTO trigger_queue (trigger_type, "table", record_id, timestamp, status)
            VALUES (NEW.trigger::public.trigger, TG_TABLE_NAME, NEW.id, CURRENT_TIMESTAMP, 'TRIGGERED');
        EXECUTE format('UPDATE %s SET trigger = %L WHERE id = %s', TG_TABLE_NAME, 'PROCESSING', NEW.id);
        RETURN NULL;
    END IF;
END;
$trigger_queue$
LANGUAGE plpgsql;

-- Function to Notify Trigger service of TriggerQueue insert
CREATE OR REPLACE FUNCTION public.notify_trigger_queue ()
    RETURNS TRIGGER
    AS $trigger_event$
BEGIN
    PERFORM
        pg_notify('trigger_notifications', json_build_object('trigger_id', NEW.id, 'trigger', NEW.trigger_type, 'table', NEW.table, 'record_id', NEW.record_id, 'event_code', NEW.event_code)::text);
    RETURN NULL;
END;
$trigger_event$
LANGUAGE plpgsql;

-- TRIGGERS for trigger_queue
DROP TRIGGER IF EXISTS trigger_queue ON public.trigger_queue;

CREATE TRIGGER trigger_queue
    AFTER INSERT ON public.trigger_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_trigger_queue ();

-- TEMPLATES

DROP FUNCTION IF EXISTS public.set_template_verision CASCADE; -- DEPRECATED

-- FUNCTION to make sure duplicated templates have 'DRAFT' status
--   but only if there is another version with 'AVAILABLE' status
CREATE OR REPLACE FUNCTION public.set_template_to_draft ()
    RETURNS TRIGGER
    AS $template_event$
BEGIN
    IF (
        SELECT
            count(*)
        FROM
            public.template
        WHERE
            id != NEW.id AND code = NEW.code AND status = 'AVAILABLE') > 0 THEN
        NEW.status = 'DRAFT';
    END IF;
    RETURN NEW;
END
$template_event$
LANGUAGE plpgsql;

-- FUNCTION to set 'AVAILABLE' version of template to 'DISABLED' when another is
-- set to 'AVAILABLE', and also link FILEs to new "AVAILABLE" template version
CREATE OR REPLACE FUNCTION public.template_status_update ()
    RETURNS TRIGGER
    AS $template_event$
BEGIN
    IF (NEW.status = 'AVAILABLE') THEN
        UPDATE
            public.template
        SET
            status = 'DISABLED'
        WHERE
            code = NEW.code
            AND status = 'AVAILABLE'
            AND id != NEW.id;
    END IF;
    RETURN NULL;
END;
$template_event$
LANGUAGE plpgsql;

--TRIGGER to make sure duplicates templates have 'DRAFT' status
DROP TRIGGER IF EXISTS set_template_to_draft_trigger ON public.template;

CREATE TRIGGER set_template_to_draft_trigger
    BEFORE INSERT ON public.template
    FOR EACH ROW
    EXECUTE FUNCTION public.set_template_to_draft ();

-- TRIGGER to ensure only one template version can be 'AVAILABLE'
DROP TRIGGER IF EXISTS template_status_update_trigger ON public.template;
CREATE TRIGGER template_status_update_trigger
    AFTER UPDATE OF status ON public.template
    FOR EACH ROW
    WHEN (NEW.status = 'AVAILABLE')
    EXECUTE FUNCTION public.template_status_update ();

-- TEMPLATE ELEMENT
-- FUNCTIONS no longer used (caused errors, now generated by trigger)
DROP FUNCTION IF EXISTS public.get_template_code CASCADE;
DROP FUNCTION IF EXISTS public.get_template_version CASCADE;

-- FUNCTION/TRIGGER to re-compute the above generated values whenever the versionId or code changes
DROP FUNCTION IF EXISTS public.recompute_template_element_code_version CASCADE;
CREATE OR REPLACE FUNCTION public.recompute_template_element_code_version ()
    RETURNS TRIGGER
    AS $template_element_event$
BEGIN
    UPDATE public.template_element
        SET template_code=NEW.code,
            template_version=NEW.version_id
        WHERE template_code = OLD.code
            AND template_version=OLD.version_id;
        RETURN NULL;
END;
$template_element_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS template_version_code_update ON public.template;
CREATE TRIGGER template_version_code_update
    AFTER UPDATE OF version_id, code ON public.template
    FOR EACH ROW
    EXECUTE FUNCTION public.recompute_template_element_code_version ();

-- FUNCTION/TRIGGER to insert correct template_code/template_version when
-- template_elements are added
CREATE OR REPLACE FUNCTION public.set_template_element_code_version ()
    RETURNS TRIGGER
    AS $template_element_event$
BEGIN
    NEW.template_code = (
            SELECT code FROM template
            WHERE id = (
                SELECT template_id FROM template_section
                WHERE id = NEW.section_id
             )
            );
     NEW.template_version = (
            SELECT version_id FROM template
            WHERE id = (
                SELECT template_id FROM template_section
                WHERE id = NEW.section_id
             )
            );
        RETURN NEW;
END;
$template_element_event$
LANGUAGE plpgsql;

-- Trigger must run BEFORE insert to avoid unique constraints
DROP TRIGGER IF EXISTS template_version_code_set ON public.template_element;
CREATE TRIGGER template_version_code_set
    BEFORE INSERT ON public.template_element
    FOR EACH ROW
    EXECUTE FUNCTION public.set_template_element_code_version ();


-- FUNCTION to return json parameters as string (for searching)
CREATE OR REPLACE FUNCTION public.template_element_parameters_string (template_element public.template_element)
    RETURNS text
    AS $$
    SELECT 
        parameters::text
    FROM
        public.template_element
    WHERE
        id = $1.id
$$
LANGUAGE sql
STABLE;


-- APPLICATION
--FUNCTION to update `is_active` to false
-- and application status to "COMPLETED"
CREATE OR REPLACE FUNCTION public.outcome_changed ()
    RETURNS TRIGGER
    AS $application_event$
BEGIN
    UPDATE
        public.application
    SET
        is_active = FALSE
    WHERE
        id = NEW.id;
    INSERT INTO public.application_status_history (application_stage_history_id, status)
        VALUES ((
                SELECT
                    id
                FROM
                    public.application_stage_history
                WHERE
                    application_id = NEW.id
                    AND is_current = TRUE),
                'COMPLETED');
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when outcome is updated
DROP TRIGGER IF EXISTS outcome_trigger ON public.application;

CREATE TRIGGER outcome_trigger
    AFTER UPDATE OF outcome ON public.application
    FOR EACH ROW
    WHEN (OLD.outcome = 'PENDING' AND NEW.outcome <> 'PENDING')
    EXECUTE FUNCTION public.outcome_changed ();

--FUNCTION to revert application status/active when OUTCOME is changed back to PENDING
CREATE OR REPLACE FUNCTION public.outcome_reverted ()
    RETURNS TRIGGER
    AS $application_event$
BEGIN
    UPDATE
        public.application
    SET
        is_active = TRUE
    WHERE
        id = NEW.id;
    INSERT INTO public.application_status_history (application_stage_history_id, status)
        VALUES ((
                SELECT
                    id
                FROM
                    public.application_stage_history
                WHERE
                    application_id = NEW.id
                    AND is_current = TRUE),
                (
                    SELECT
                        status
                    FROM
                        public.application_status_history
                    WHERE
                        time_created = (
                            SELECT
                                MAX(time_created)
                            FROM
                                public.application_status_history
                            WHERE
                                is_current = FALSE
                                AND application_id = NEW.id)));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when outcome is updated
DROP TRIGGER IF EXISTS outcome_revert_trigger ON public.application;

CREATE TRIGGER outcome_revert_trigger
    AFTER UPDATE OF outcome ON public.application
    FOR EACH ROW
    WHEN (NEW.outcome = 'PENDING' AND OLD.outcome <> 'PENDING')
    EXECUTE FUNCTION public.outcome_reverted ();

-- APPLICATION_STAGE_HISTORY
-- FUNCTION to set `is_current` to false on all other stage_histories of current application
CREATE OR REPLACE FUNCTION public.stage_is_current_update ()
    RETURNS TRIGGER
    AS $application_stage_history_event$
BEGIN
    UPDATE
        public.application_stage_history
    SET
        is_current = FALSE
    WHERE
        application_id = NEW.application_id
        AND id <> NEW.id;
    RETURN NULL;
END;
$application_stage_history_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when is_current is updated
DROP TRIGGER IF EXISTS application_stage_history_trigger ON public.application_stage_history;

CREATE TRIGGER application_stage_history_trigger
    AFTER INSERT OR UPDATE OF is_current ON public.application_stage_history
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.stage_is_current_update ();

-- APPLICATION_STATUS_HISTORY
-- FUNCTION to auto-add application_id to application_status_history table
-- (Somehow some older snapshots ended up with two variants of this function)
DROP FUNCTION IF EXISTS public.application_status_history_application_id (application_stage_history_id integer) CASCADE;
DROP FUNCTION IF EXISTS
    public.application_status_history_application_id() CASCADE;
CREATE OR REPLACE FUNCTION public.application_status_history_application_id ()
    RETURNS TRIGGER
    AS $application_status_history_event$
    BEGIN
    NEW.application_id = (
          SELECT application_id FROM application_stage_history
          WHERE id = NEW.application_stage_history_id
        );
    RETURN NEW;
    END;
$application_status_history_event$
LANGUAGE plpgsql;

-- TRIGGER for the above
DROP TRIGGER IF EXISTS application_status_history_application_id_set
    ON public.application_status_history;
CREATE TRIGGER application_status_history_application_id_set
    BEFORE INSERT ON public.application_status_history
    FOR EACH ROW
    EXECUTE FUNCTION public.application_status_history_application_id ();

-- FUNCTION to set `is_current` to false on all other status_histories of current application
CREATE OR REPLACE FUNCTION public.status_is_current_update ()
    RETURNS TRIGGER
    AS $application_status_history_event$
BEGIN
    UPDATE
        public.application_status_history
    SET
        is_current = FALSE
    WHERE
        application_id = NEW.application_id
        AND id <> NEW.id;
    RETURN NULL;
END;
$application_status_history_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when is_current is updated
DROP TRIGGER IF EXISTS application_status_history_trigger ON public.application_status_history;

CREATE TRIGGER application_status_history_trigger
    AFTER INSERT OR UPDATE OF is_current ON public.application_status_history
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.status_is_current_update ();

-- Function to expose stage_number field on application table in GraphQL
CREATE OR REPLACE FUNCTION public.application_stage_number (app public.application)
    RETURNS int
    AS $$
    SELECT
        stage_number
    FROM (
        SELECT
            application_id,
            stage_number
        FROM
            public.application_stage_status_latest) AS app_stage_num
WHERE
    app_stage_num.application_id = app.id;

$$
LANGUAGE sql
STABLE;

-- Function to expose stage name field on application table in GraphQL
CREATE OR REPLACE FUNCTION public.application_stage (app public.application)
    RETURNS varchar
    AS $$
    SELECT
        stage
    FROM (
        SELECT
            application_id,
            stage
        FROM
            public.application_stage_status_latest) AS app_stage
WHERE
    app_stage.application_id = app.id;

$$
LANGUAGE sql
STABLE;

-- Function to expose status field on application table in GraphQL
CREATE OR REPLACE FUNCTION public.application_status (a public.application)
    RETURNS application_status
    AS $$
    SELECT
        status
    FROM (
        SELECT
            application_id,
            status
        FROM
            public.application_stage_status_latest) AS app_status
WHERE
    app_status.application_id = a.id;

$$
LANGUAGE sql
STABLE;

-- APPLICATION_RESPONSE
-- Function to automatically update "time_updated"
CREATE OR REPLACE FUNCTION public.update_response_timestamp ()
    RETURNS TRIGGER
    AS $application_event$
BEGIN
    UPDATE
        public.application_response
    SET
        time_updated = NOW()
    WHERE
        id = NEW.id;
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when response is updated
DROP TRIGGER IF EXISTS application_response_timestamp_trigger ON public.application_response;

CREATE TRIGGER application_response_timestamp_trigger
    AFTER UPDATE OF status,
    value,
    is_valid ON public.application_response
    FOR EACH ROW
    EXECUTE FUNCTION public.update_response_timestamp ();

CREATE OR REPLACE FUNCTION delete_whole_application (application_id int)
    RETURNS boolean
    AS $$
BEGIN
    DELETE FROM public.application_status_history
    WHERE application_stage_history_id IN (
            SELECT
                id
            FROM
                public.application_stage_history
            WHERE
                application_stage_history.application_id = $1);
    DELETE FROM public.application_stage_history
    WHERE application_stage_history.application_id = $1;
    DELETE FROM public.application_response
    WHERE application_response.application_id = $1;
    DELETE FROM public.application_section
    WHERE application_section.application_id = $1;
    DELETE FROM public.application
    WHERE application.id = $1;
    RETURN TRUE;
END;
$$
LANGUAGE plpgsql
VOLATILE;

-- ACTION_QUEUE
-- Function to Notify Action service of ActionQueue insert
CREATE OR REPLACE FUNCTION public.notify_action_queue ()
    RETURNS TRIGGER
    AS $action_event$
BEGIN
    -- IF NEW.status = 'QUEUED' THEN
    PERFORM
        pg_notify('action_notifications', json_build_object('id', NEW.id, 'code', NEW.action_code, 'condition_expression', NEW.condition_expression, 'parameter_queries', NEW.parameter_queries)::text);
    -- END IF;
    RETURN NULL;
END;
$action_event$
LANGUAGE plpgsql;

-- TRIGGERS for action_queue
DROP TRIGGER IF EXISTS action_queue ON public.action_queue;

CREATE TRIGGER action_queue
    AFTER INSERT ON public.action_queue
    FOR EACH ROW
    WHEN (NEW.status <> 'PROCESSING')
    EXECUTE FUNCTION public.notify_action_queue ();

-- TRIGGER (Listener) on application table
DROP TRIGGER IF EXISTS application_trigger ON public.application;

CREATE TRIGGER application_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.application
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

-- TEMPLATE_ACTION
CREATE OR REPLACE FUNCTION public.template_action_parameters_queries_string (template_action public.template_action)
    RETURNS text
    AS $$
    SELECT
        parameter_queries::text
    FROM
        public.template_action
    WHERE
        id = $1.id
$$
LANGUAGE sql
STABLE;

-- TRIGGER_SCHEDULE
-- TRIGGER (Listener) on trigger_schedule table
DROP TRIGGER IF EXISTS trigger_schedule_trigger ON public.trigger_schedule;

CREATE TRIGGER trigger_schedule_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.trigger_schedule
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

-- REVIEW_ASSIGNMENT
-- FUNCTION/TRIGGER to auto-add template_id to review_assignment
-- (Some older versions have variant with different signature)
DROP FUNCTION IF EXISTS public.review_assignment_template_id(assignment review_assignment) CASCADE;
DROP FUNCTION IF EXISTS public.review_assignment_template_id(application_id integer) CASCADE;
DROP FUNCTION IF EXISTS public.review_assignment_template_id() CASCADE;
CREATE OR REPLACE FUNCTION public.review_assignment_template_id ()
    RETURNS TRIGGER
    AS $review_assignment_event$
    BEGIN
    NEW.template_id = (
          SELECT template_id FROM application
          WHERE id = NEW.application_id
        );
    RETURN NEW;
    END;
$review_assignment_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_review_assignment_template_id
    ON public.review_assignment;
CREATE TRIGGER set_review_assignment_template_id
    BEFORE INSERT ON public.review_assignment
    FOR EACH ROW
    EXECUTE FUNCTION public.review_assignment_template_id ();


-- These no longer used as combined into (below) validation function
DROP TRIGGER IF EXISTS review_assignment_trigger2 ON public.review_assignment;
DROP FUNCTION IF EXISTS public.empty_assigned_sections ();

-- Enforce validity of assigned sections:
-- If status is now AVAILABLE assigned sections should be empty
-- Also check that assigned sections aren't already assigned and remove if so
-- This all happens *BEFORE* the record is inserted
DROP FUNCTION IF EXISTS public.enforce_asssigned_section_validity CASCADE; -- Old misspelled version
CREATE OR REPLACE FUNCTION public.enforce_assigned_section_validity ()
    RETURNS TRIGGER
    AS $trigger_queue$
BEGIN
    IF NEW.status = 'AVAILABLE' THEN
        NEW.assigned_sections = '{}';
    ELSE
        NEW.assigned_sections = ARRAY ( WITH a AS (
                SELECT
                    unnest(NEW.assigned_sections) new_assigned
)
                SELECT
                    new_assigned
                FROM
                    a
                WHERE
                    new_assigned NOT IN (
                        SELECT
                            unnest(assigned_sections)
                        FROM
                            review_assignment
                        WHERE
                            application_id = NEW.application_id
                            AND stage_id = NEW.stage_id
                            AND level_number = NEW.level_number
                            AND reviewer_id <> NEW.reviewer_id)
                        AND (new_assigned = ANY (NEW.allowed_sections)
                            OR NEW.allowed_sections IS NULL));
    END IF;
    IF NEW.assigned_sections = '{}' THEN
        NEW.status = 'AVAILABLE';
    END IF;
    NEW.time_updated = NOW();
    RETURN NEW;
END;
$trigger_queue$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_assignment_validate_section_trigger ON public.review_assignment;

CREATE TRIGGER review_assignment_validate_section_trigger
    BEFORE UPDATE ON public.review_assignment
    FOR EACH ROW
    -- WHEN (NEW.trigger IS NOT NULL AND OLD.trigger IS NULL)
    EXECUTE FUNCTION public.enforce_assigned_section_validity ();
    
-- FUNCTION to insert correct level_id on review_assignments when inserted
CREATE OR REPLACE FUNCTION public.insert_review_level_id ()
    RETURNS TRIGGER
    AS $trigger_queue$
BEGIN
    UPDATE public.review_assignment
    SET level_id = 
        (
            SELECT id FROM template_stage_review_level
            WHERE stage_id = (
                SELECT id FROM template_stage
                WHERE id = NEW.stage_id
            )
            AND number = NEW.level_number
        )
    WHERE id = NEW.id;
    RETURN NEW;
END;
$trigger_queue$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_assignment_insert ON public.review_assignment;

CREATE TRIGGER review_assignment_insert
    AFTER INSERT ON public.review_assignment
    FOR EACH ROW
    EXECUTE FUNCTION public.insert_review_level_id ();

-- FUNCTION to return `available_sections` for a given review_assignment based
-- on other assignments and allowed sections
CREATE OR REPLACE FUNCTION public.review_assignment_available_sections (assignment public.review_assignment)
    RETURNS varchar[]
    -- This allows the function to be run as admin user, otherwise it'll only be
    -- able to query rows the current user has access to.
    SECURITY DEFINER
    AS $$
    SELECT
        ARRAY ( WITH my_array AS (
                SELECT DISTINCT
                    (ts.code) available_sections
                FROM
                    template_section ts
                    JOIN TEMPLATE t ON t.id = ts.template_id
                    JOIN application a ON a.template_id = t.id
                WHERE
                    a.id = $1.application_id
)
                SELECT
                    available_sections
                FROM
                    my_array
                WHERE
                    available_sections NOT IN (
                        SELECT
                            unnest(assigned_sections)
                        FROM
                            review_assignment
                        WHERE
                            status = 'ASSIGNED'
                            AND stage_id = $1.stage_id
                            AND level_number = $1.level_number
                            AND application_id = $1.application_id)
                        AND (available_sections = ANY ($1.allowed_sections)
                            OR $1.allowed_sections IS NULL))
$$
LANGUAGE sql
STABLE;

-- TRIGGER (Listener) on review_assignment table: To update trigger
DROP TRIGGER IF EXISTS review_assignment_trigger ON public.review_assignment;

CREATE TRIGGER review_assignment_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.review_assignment
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

-- REVIEW
-- These first few functions are duplicated in 31_review.sql as they are
-- needed before the review table is created.
--
-- FUNCTION to return "is_locked" field in GraphQL based on the current
-- application status
CREATE OR REPLACE FUNCTION public.review_is_locked (review public.review)
    RETURNS boolean
    AS $$
DECLARE
    app_status application_status;
BEGIN
    SELECT
        status INTO app_status
    FROM
        application_stage_status_latest
    WHERE
        application_id = $1.application_id;
    IF app_status = 'CHANGES_REQUIRED' OR app_status = 'DRAFT' THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$
LANGUAGE plpgsql
STABLE;

-- FUNCTION/TRIGGER to auto-add various review_assignment fields to review
CREATE OR REPLACE FUNCTION public.review_add_review_assignment_fields ()
    RETURNS TRIGGER
    AS $review_update_event$
    BEGIN
    NEW.application_id = (
          SELECT application_id FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.reviewer_id = (
          SELECT reviewer_id FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.level_number = (
          SELECT level_number FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.stage_number = (
          SELECT stage_number FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.time_stage_created = (
          SELECT time_stage_created FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.is_last_level = (
          SELECT is_last_level FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.is_last_stage = (
          SELECT is_last_stage FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    NEW.is_final_decision = (
          SELECT is_final_decision FROM review_assignment
          WHERE id = NEW.review_assignment_id
        );
    RETURN NEW;
    END;
$review_update_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_auto_add_fields
    ON public.review;
CREATE TRIGGER review_auto_add_fields
    BEFORE INSERT ON public.review
    FOR EACH ROW
    EXECUTE FUNCTION public.review_add_review_assignment_fields ();

-- These functions no longer required
DROP FUNCTION IF EXISTS public.review_application_id;
DROP FUNCTION IF EXISTS public.review_reviewer_id;
DROP FUNCTION IF EXISTS public.review_level;
DROP FUNCTION IF EXISTS public.review_stage;
DROP FUNCTION IF EXISTS public.review_time_stage_created;
DROP FUNCTION IF EXISTS public.review_is_last_level;
DROP FUNCTION IF EXISTS public.review_is_last_stage;
DROP FUNCTION IF EXISTS public.review_is_final_decision;

-- TRIGGER (Listener) on review table
DROP TRIGGER IF EXISTS review_trigger ON public.review;

CREATE TRIGGER review_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.review
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

-- REVIEW_RESPONSE
-- FUNCTION/TRIGGER to auto-add stage_number to review_response
-- (Some older versions have variant with different signature)
DROP FUNCTION IF EXISTS review_response_stage_number(review_id integer) CASCADE;
DROP FUNCTION IF EXISTS review_response_stage_number() CASCADE;
CREATE FUNCTION public.review_response_stage_number ()
    RETURNS TRIGGER
    AS $review_response_event$
    BEGIN
    NEW.stage_number = (
          SELECT stage_number FROM review
          WHERE id = NEW.review_id
        );
    RETURN NEW;
    END;
$review_response_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_response_stage_number_set
    ON public.review_response;
CREATE TRIGGER review_response_stage_number_set
    BEFORE INSERT ON public.review_response
    FOR EACH ROW
    EXECUTE FUNCTION public.review_response_stage_number ();



-- Function to automatically set previous review_responses
-- (for same review & templateElement) as is_latest_review = false
CREATE OR REPLACE FUNCTION public.set_latest_review_response ()
    RETURNS TRIGGER
    AS $review_response_event$
BEGIN
    UPDATE
        public.review_response
    SET
        is_latest_review = TRUE
    WHERE
        id = NEW.id;
    UPDATE
        public.review_response
    SET
        is_latest_review = FALSE
    WHERE
        template_element_id = NEW.template_element_id
        AND review_id = NEW.review_id
        AND id <> NEW.id;
    RETURN NULL;
END;
$review_response_event$
LANGUAGE plpgsql;

-- TRIGGER (Listener) on review_response table: Run set_previous_review_response
DROP TRIGGER IF EXISTS review_response_latest ON public.review_response;

CREATE TRIGGER review_response_latest
    AFTER UPDATE OF time_updated ON public.review_response
    FOR EACH ROW
    WHEN (NEW.time_updated > OLD.time_created)
    EXECUTE FUNCTION public.set_latest_review_response ();

-- Function to automatically update "time_updated"
CREATE OR REPLACE FUNCTION public.update_review_response_timestamp ()
    RETURNS TRIGGER
    AS $application_event$
BEGIN
    UPDATE
        public.review_response
    SET
        time_updated = NOW()
    WHERE
        id = NEW.id;
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when response is updated
DROP TRIGGER IF EXISTS review_response_timestamp_trigger ON public.review_response;

CREATE TRIGGER review_response_timestamp_trigger
    AFTER UPDATE OF comment,
    decision ON public.review_response
    FOR EACH ROW
    EXECUTE FUNCTION public.update_review_response_timestamp ();

-- set review response original_review_response_id (the response that links to application id should be available for all responses)
-- also flatten out review response chain by providing template_element_id in review_response and application_response_id
CREATE OR REPLACE FUNCTION set_original_response ()
    RETURNS TRIGGER
    AS $$
BEGIN
    IF NEW.review_response_link_id IS NOT NULL THEN
        NEW.original_review_response_id = (
            SELECT
                original_review_response_id
            FROM
                public.review_response
            WHERE
                id = NEW.review_response_link_id);
        NEW.application_response_id = (
            SELECT
                application_response_id
            FROM
                public.review_response
            WHERE
                id = NEW.review_response_link_id);
    ELSE
        -- should always be original review_response when review_response_link_id IS NULL
        NEW.original_review_response_id = NEW.id;
    END IF;
    -- application_response should always exist
    NEW.template_element_id = (
        SELECT
            template_element_id
        FROM
            public.application_response
        WHERE
            id = NEW.application_response_id);
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_original_response_trigger ON public.review_response;

CREATE TRIGGER set_original_response_trigger
    BEFORE INSERT ON public.review_response
    FOR EACH ROW
    EXECUTE FUNCTION set_original_response ();

-- REVIEW_DECISION
-- exposes latest overall deicison for review
CREATE OR REPLACE FUNCTION public.review_latest_decision (review public.review)
    RETURNS public.review_decision
    AS $$
    SELECT
        *
    FROM
        public.review_decision
    WHERE
        review_id = review.id
    ORDER BY
        time_updated DESC
    LIMIT 1
$$
LANGUAGE sql
STABLE;

-- REVIEW_STATUS_HISTORY
-- FUNCTION to set `is_current` to false on all other review_status_histories of current review
CREATE OR REPLACE FUNCTION public.review_status_history_is_current_update ()
    RETURNS TRIGGER
    AS $review_status_history_event$
BEGIN
    UPDATE
        public.review_status_history
    SET
        is_current = FALSE
    WHERE
        review_id = NEW.review_id
        AND id <> NEW.id;
    RETURN NULL;
END;
$review_status_history_event$
LANGUAGE plpgsql;

--TRIGGER to run above function when is_current is updated
DROP TRIGGER IF EXISTS review_status_history_trigger ON public.review_status_history;

CREATE TRIGGER review_status_history_trigger
    AFTER INSERT OR UPDATE OF is_current ON public.review_status_history
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.review_status_history_is_current_update ();

-- Function to expose status name field on review table in GraphQL
CREATE OR REPLACE FUNCTION public.review_status (app public.review)
    RETURNS public.review_status
    AS $$
    SELECT
        "status"
    FROM
        public.review_status_history
    WHERE
        review_id = app.id
        AND is_current = TRUE
$$
LANGUAGE sql
STABLE;

-- Function to expose time_status_created field on review table in GraphQL
CREATE OR REPLACE FUNCTION public.review_time_status_created (app public.review)
    RETURNS timestamptz
    AS $$
    SELECT
        time_created
    FROM
        public.review_status_history
    WHERE
        review_id = app.id
        AND is_current = TRUE
$$
LANGUAGE sql
STABLE;

-- REVIEW ASSIGNABLE FUNCTIONS:
-- Function to return elements reviewable questions (per application)
CREATE OR REPLACE FUNCTION public.reviewable_questions (app_id int)
    RETURNS TABLE (
        code varchar,
        reviewability public.reviewability,
        response_id int,
        response_value jsonb,
        is_optional boolean
    )
    AS $$
    SELECT DISTINCT ON (code)
        te.code AS code,
        te.reviewability,
        ar.id AS response_id,
        ar.value AS response_value,
        CASE WHEN ar.value IS NULL
            AND te.reviewability = 'OPTIONAL_IF_NO_RESPONSE' THEN
            TRUE
        ELSE
            FALSE
        END::boolean
    FROM
        public.application_response ar
        JOIN public.application app ON ar.application_id = app.id
        JOIN public.template_element te ON ar.template_element_id = te.id
    WHERE
        ar.application_id = $1
        AND te.category = 'QUESTION'
        AND ((ar.value IS NULL
                AND te.reviewability = 'OPTIONAL_IF_NO_RESPONSE')
            OR (ar.value IS NOT NULL
                AND te.reviewability != 'NEVER'))
    GROUP BY
        te.code,
        ar.time_submitted,
        ar.id,
        te,
        reviewability,
        ar.value
    ORDER BY
        code,
        ar.time_submitted DESC
$$
LANGUAGE sql
STABLE;

-- Function to return elements of assigned questions for current stage/level
CREATE OR REPLACE FUNCTION public.assigned_questions (app_id int, stage_id int, level_number int)
    RETURNS TABLE (
        review_id int,
        response_id int,
        review_assignment_id int,
        review_response_code varchar,
        review_response_status public.review_response_status,
        decision public.review_response_decision,
        is_optional boolean,
        is_lastest_review boolean
    )
    AS $$
    SELECT DISTINCT ON (review_response_code)
        rr.review_id,
        rq.response_id,
        ra.id AS review_assignment_id,
        rq.code AS review_response_code,
        rr.status AS review_response_status,
        rr.decision,
        rq.is_optional,
        rr.is_latest_review
    FROM (
        SELECT
            id,
            application_id,
            stage_id,
            level_number,
            status,
            UNNEST(assigned_sections) AS section_code
        FROM
            public.review_assignment) ra
    JOIN public.template_section ts ON ra.section_code = ts.code
    JOIN public.template_element te ON ts.id = te.section_id
    JOIN public.reviewable_questions (app_id) rq ON rq.code = te.code
    LEFT JOIN public.review ON review.review_assignment_id = ra.id
    LEFT JOIN public.review_response rr ON (rr.application_response_id = rq.response_id
            AND rr.review_id = review.id)
WHERE
    ra.application_id = $1
    AND ra.stage_id = $2
    AND ra.level_number = $3
    AND ra.status = 'ASSIGNED'
GROUP BY
    ra.id,
    rr.review_id,
    rr.is_latest_review,
    rq.is_optional,
    rr.status,
    rr.decision,
    rq.code,
    rq.response_id
ORDER BY
    review_response_code,
    is_latest_review DESC
$$
LANGUAGE sql
STABLE;

-- Function to return TOTAL of reviewable questions (per application)
CREATE OR REPLACE FUNCTION public.reviewable_questions_count (app_id int)
    RETURNS bigint
    AS $$
    SELECT
        COUNT(*)
    FROM
        reviewable_questions (app_id)
$$
LANGUAGE sql
STABLE;

-- Function to return TOTAL assigned questions for current stage/level
-- Need to DROP first, due to error with parameter name
DROP FUNCTION IF EXISTS public.assigned_questions_count;

CREATE FUNCTION public.assigned_questions_count (app_id int, stage_id int, level_number int)
    RETURNS bigint
    AS $$
    SELECT
        COUNT(*)
    FROM
        assigned_questions (app_id, stage_id, level_number)
$$
LANGUAGE sql
STABLE;

-- Function to return TOTAL of assigned and submitted (element that can't be re-assigned)
CREATE OR REPLACE FUNCTION public.submitted_assigned_questions_count (app_id int, stage_id int, level_number int)
    RETURNS bigint
    AS $$
    SELECT
        COUNT(*)
    FROM
        assigned_questions (app_id, stage_id, level_number) aq
WHERE
    aq.review_response_status = 'SUBMITTED'
$$
LANGUAGE sql
STABLE;

-- FILE
-- Function to Notify server of File record deletion
CREATE OR REPLACE FUNCTION public.notify_file_server ()
    RETURNS TRIGGER
    AS $trigger_event$
BEGIN
    PERFORM
        pg_notify('file_notifications', json_build_object('id', OLD.id, 'uniqueId', OLD.unique_id, 'originalFilename', OLD.original_filename, 'filePath', OLD.file_path, 'thumbnailPath', OLD.thumbnail_path)::text);
    RETURN NULL;
END;
$trigger_event$
LANGUAGE plpgsql;

-- TRIGGER for file table
DROP TRIGGER IF EXISTS file_deletion ON public.file;

CREATE TRIGGER file_deletion
    AFTER DELETE ON public.file
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_file_server ();

-- FUNCTION to mark file for deletion if it's no longer a reference doc
CREATE OR REPLACE FUNCTION public.mark_file_for_deletion ()
    RETURNS TRIGGER
    AS $file_event$
BEGIN
    UPDATE
        public.file
    SET
        to_be_deleted = TRUE
    WHERE
        id = NEW.id;
    RETURN NULL;
END;
$file_event$
LANGUAGE plpgsql;

-- TRIGGER to execute above function when files no longer reference
DROP TRIGGER IF EXISTS file_no_longer_reference ON public.file;

CREATE TRIGGER file_no_longer_reference
    AFTER UPDATE ON public.file
    FOR EACH ROW
    WHEN (NEW.is_external_reference_doc = FALSE AND NEW.is_internal_reference_doc = FALSE AND (OLD.is_external_reference_doc = TRUE OR OLD.is_internal_reference_doc = TRUE))
    EXECUTE FUNCTION public.mark_file_for_deletion ();

-- VERIFICATION
-- TRIGGER (Listener) on verification table
DROP TRIGGER IF EXISTS verification_trigger ON public.verification;

CREATE TRIGGER verification_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.verification
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

-- ASSIGNMENT_LIST
-- Aggregated VIEW method to get list of assigners and reviewers usernames to allow filtering by those on the application list page
CREATE OR REPLACE FUNCTION assignment_list (stageid int)
    RETURNS TABLE (
        application_id int,
        reviewers varchar[],
        assigners varchar[]
    )
    AS $$
    SELECT
        review_assignment.application_id,
        ARRAY_AGG(DISTINCT (CONCAT(reviewer_user.first_name, ' ', reviewer_user.last_name)::varchar)) AS reviewers,
        ARRAY_AGG(DISTINCT (CONCAT(assigner_user.first_name, ' ', assigner_user.last_name)::varchar)) AS assigners
    FROM
        public.review_assignment
    LEFT JOIN public."user" AS assigner_user ON review_assignment.assigner_id = assigner_user.id
    LEFT JOIN public."user" AS reviewer_user ON review_assignment.reviewer_id = reviewer_user.id
WHERE
    review_assignment.stage_id = $1
    AND review_assignment.status = 'ASSIGNED'
    -- WHERE assigner_user IS NOT NULL
GROUP BY
    review_assignment.application_id;

$$
LANGUAGE sql
STABLE;

-- ASSIGNER_ACTION_LIST
-- Aggregated VIEW method of all related assigner data to each application on application list page
DROP FUNCTION IF EXISTS assigner_list (integer, integer);

CREATE OR REPLACE FUNCTION assigner_list (stage_id int, assigner_id int)
    RETURNS TABLE (
        application_id int,
        assigner_action public.assigner_action
    )
    AS $$
    SELECT
        review_assignment.application_id AS application_id,
        CASE WHEN COUNT(DISTINCT (review_assignment.id)) != 0
            AND assigned_questions_count (application_id, $1, level_number) >= reviewable_questions_count (application_id)
            AND submitted_assigned_questions_count (application_id, $1, level_number) < assigned_questions_count (application_id, $1, level_number) THEN
            'RE_ASSIGN'
        WHEN COUNT(DISTINCT (review_assignment.id)) != 0
            AND assigned_questions_count (application_id, $1, level_number) < reviewable_questions_count (application_id) THEN
            'ASSIGN'
        ELSE
            NULL
        END::assigner_action
    FROM
        public.review_assignment
    LEFT JOIN public.review_assignment_assigner_join ON review_assignment.id = review_assignment_assigner_join.review_assignment_id
WHERE
    review_assignment.stage_id = $1
    AND review_assignment_assigner_join.assigner_id = $2
    AND (
        SELECT
            outcome
        FROM
            public.application
        WHERE
            id = review_assignment.application_id) = 'PENDING'
GROUP BY
    review_assignment.application_id,
    review_assignment.level_number;

$$
LANGUAGE sql
STABLE;

-- REVIEWER_ACTION_LIST
-- Aggregated VIEW method of reviewer action to each application on application list page
DROP FUNCTION IF EXISTS review_list (integer, integer);

DROP FUNCTION IF EXISTS review_list (integer, integer, public.application_status);

CREATE OR REPLACE FUNCTION review_list (stageid int, reviewerid int, appstatus public.application_status)
    RETURNS TABLE (
        application_id int,
        reviewer_action public.reviewer_action
    )
    AS $$
    SELECT
        review_assignment.application_id AS application_id,
        CASE WHEN COUNT(*) FILTER (WHERE review_status_history.status = 'CHANGES_REQUESTED') != 0 THEN
            'UPDATE_REVIEW'
        WHEN COUNT(*) FILTER (WHERE review_status_history.status = 'PENDING') != 0 THEN
            'RESTART_REVIEW'
        WHEN COUNT(*) FILTER (WHERE review_status_history.status = 'DRAFT'
            AND review_is_locked (review) = FALSE) != 0 THEN
            'CONTINUE_REVIEW'
        WHEN COUNT(*) FILTER (WHERE review_assignment.status = 'ASSIGNED'
            AND review_assignment.is_final_decision = TRUE
            AND review_assignment.is_last_stage = TRUE
            AND review = NULL) != 0 THEN
            'MAKE_DECISION'
        WHEN COUNT(*) FILTER (WHERE review_assignment.status = 'ASSIGNED'
            AND review.id IS NULL) != 0 THEN
            'START_REVIEW'
        WHEN COUNT(*) FILTER (WHERE review_assignment.status = 'AVAILABLE'
            AND is_self_assignable = TRUE
            AND review_assignment_available_sections (review_assignment) != '{}'
            AND review.id IS NULL) != 0 THEN
            'SELF_ASSIGN'
        WHEN COUNT(*) FILTER (WHERE (appstatus = 'CHANGES_REQUIRED'
            OR appstatus = 'DRAFT')
            AND review_assignment.status = 'ASSIGNED'
            AND review_status_history.status = 'SUBMITTED') != 0 THEN
            'AWAITING_RESPONSE'
        WHEN COUNT(*) FILTER (WHERE review_assignment.status = 'ASSIGNED'
            OR review_status_history.status = 'SUBMITTED') != 0 THEN
            'VIEW_REVIEW'
        ELSE
            NULL
        END::public.reviewer_action
    FROM
        public.review_assignment
    LEFT JOIN public.review ON review.review_assignment_id = review_assignment.id
    LEFT JOIN public.review_status_history ON (review_status_history.review_id = review.id
            AND is_current = TRUE)
WHERE
    review_assignment.stage_id = $1
    AND review_assignment.reviewer_id = $2
    AND (
        SELECT
            outcome
        FROM
            public.application
        WHERE
            id = review_assignment.application_id) = 'PENDING'
GROUP BY
    review_assignment.application_id;

$$
LANGUAGE sql
STABLE;

DROP VIEW IF EXISTS unnested_sections CASCADE;

-- Unnest creates a row for each array member
CREATE VIEW unnested_sections AS
SELECT
    id,
    unnest(assigned_sections) AS section
FROM
    review_assignment;

DROP VIEW IF EXISTS assigned_sections_by_stage_and_level CASCADE;

-- Two counts, grouped by application, stage, level and assigner (from assigner_join)
-- assigned_section_for_level (how many sections are assigned)
-- assigned_in_progress_sections (how many sections are assigned and review hasn't been started or review is not submitted)
CREATE VIEW assigned_sections_by_stage_and_level AS
SELECT
    review_assignment.application_id,
    review_assignment.stage_id,
    review_assignment.level_number,
    review_assignment_assigner_join.assigner_id,
    count(DISTINCT unnested_sections.section) FILTER (WHERE review_assignment.status = 'ASSIGNED') AS assigned_section_for_level,
    count(DISTINCT unnested_sections.section) FILTER (WHERE review_assignment.status = 'ASSIGNED'
        AND review_status_history.status IS NULL
        OR review_status_history.status != 'SUBMITTED') AS assigned_in_progress_sections
FROM
    review_assignment
    JOIN review_assignment_assigner_join ON review_assignment_assigner_join.review_assignment_id = review_assignment.id
    LEFT JOIN unnested_sections ON unnested_sections.id = review_assignment.id
    LEFT JOIN review ON review.review_assignment_id = review_assignment.id
    LEFT JOIN review_status_history ON review.id = review_status_history.review_id
        AND review_status_history.is_current = TRUE
GROUP BY
    1,
    2,
    3,
    4;

CREATE TABLE IF NOT EXISTS allowed_self_assignable_sections_shape (
    review_assignment_id int,
    allowed_sections varchar[]
);
-- For each active review_assignment for user we need to know how many sections they are allowed to review
-- this becomes less then trivial because when allowed_sections is null it means that all sections can be
-- reviewed by the user, thus we need to deduce how many sections there are total in template and replace
-- allowed sections with all sections in template (when allowed sections is null)
CREATE OR REPLACE FUNCTION public.allowed_self_assignable_sections (userId int)
      RETURNS SETOF allowed_self_assignable_sections_shape
    AS $$
   SELECT 
    review_assignment.id as review_assignment_id,
    CASE WHEN allowed_sections IS NULL THEN
        array_agg(distinct(template_section.code))
    ELSE
        allowed_sections
    END AS allowed_sections
    FROM review_assignment
        JOIN application ON review_assignment.application_id = application.id
        JOIN template ON application.template_id = template.id
        JOIN template_section ON template_section.template_id = template.id
    WHERE review_assignment.status = 'AVAILABLE' 
        AND review_assignment.is_self_assignable = TRUE
        AND application.outcome = 'PENDING'
        AND review_assignment.reviewer_id = userId
    -- Need to group by allowed sections because it appears in 'from' clause 
    -- (in CASE statement), there would be just one allowed_sections field
    -- for reach group by, so it should be safe
    GROUP BY 1, review_assignment.allowed_sections;
$$
LANGUAGE sql
STABLE;

CREATE TABLE IF NOT EXISTS review_assignment_assigned_sections_shape (
    review_assignment_id int,
    assigned_sections varchar[]
);

-- In order to deduce if there are any self assignable sections for we need to
-- know which sections are already assigned, which requires looking at all
-- 'ASSIGNED' review assignments and concatenating array of all sections in
-- those assignments, looks like un-nesting and array_agg is the only way to do
-- this ?
CREATE OR REPLACE FUNCTION public.review_assignment_assigned_sections (userId int)
      RETURNS SETOF review_assignment_assigned_sections_shape
    -- This allows the function to be run as admin user, otherwise it'll only be
    -- able to query rows the current user has access to.
    SECURITY DEFINER
    AS $$
    SELECT
        ra_outer.id AS review_assignment_id,
        ARRAY_AGG(DISTINCT(ra_inner.section_code))
    FROM review_assignment AS ra_outer
    JOIN application on ra_outer.application_id = application.id
    LEFT JOIN (select *, unnest(assigned_sections) AS section_code FROM review_assignment) AS ra_inner 
        ON (ra_inner.application_id = ra_outer.application_id
            AND ra_inner.stage_id = ra_outer.stage_id 
            AND ra_inner.level_number = ra_outer.level_number
            AND ra_inner.status = 'ASSIGNED')
    WHERE ra_outer.status = 'AVAILABLE' 
        AND ra_outer.is_self_assignable = TRUE
        AND application.outcome = 'PENDING'
        AND ra_outer.reviewer_id = userId
    GROUP BY 1
$$
LANGUAGE sql
STABLE;

-- Does the "heavy lifting" to deduce the assigners/reviewers list for a single
-- application as well as the available actions for a particular
-- reviewer/assigner for that application. Used to populate the
-- `application_reviewer_action` table and the reviewer/assigner lists on each
-- application whenever an event occurs that would change these values
CREATE OR REPLACE FUNCTION single_application_detail (applicationId int, userId int DEFAULT 0)
    RETURNS TABLE (
        assigners varchar[],
        reviewers varchar[],
        reviewer_action public.reviewer_action,
        assigner_action public.assigner_action 
    )
    AS $$
        SELECT
            -- REVIEWERS and ASSIGNERS
            CASE WHEN count(assigner_user.id) = 0 THEN
                NULL
            ELSE
                ARRAY_AGG(DISTINCT (CONCAT(assigner_user.first_name, ' ', assigner_user.last_name)::varchar))
            END AS assigners,
            CASE WHEN count(reviewer_user.id) = 0 THEN
                NULL
            ELSE
                ARRAY_AGG(DISTINCT (CONCAT(reviewer_user.first_name, ' ', reviewer_user.last_name)::varchar))
            END AS reviewers,
            -- REVIEWER ACTIONS
            CASE WHEN COUNT(*) FILTER (WHERE action_review_status_history.status = 'CHANGES_REQUESTED') != 0 THEN
                'UPDATE_REVIEW'
            WHEN COUNT(*) FILTER (WHERE action_review_status_history.status = 'PENDING') != 0 THEN
                'RESTART_REVIEW'
            WHEN COUNT(*) FILTER (WHERE action_review_status_history.status = 'DRAFT'
                AND review_is_locked (action_review) = FALSE) != 0 THEN
                'CONTINUE_REVIEW'
            WHEN COUNT(*) FILTER (WHERE reviewer_assignment.status = 'ASSIGNED'
                AND reviewer_assignment.is_final_decision = TRUE
                AND reviewer_assignment.is_last_stage = TRUE
                AND action_review = NULL) != 0 THEN
                'MAKE_DECISION'
            WHEN COUNT(*) FILTER (WHERE reviewer_assignment.status = 'ASSIGNED'
                AND action_review.id IS NULL) != 0 THEN
                'START_REVIEW'
            -- anyarray <@ anyarray → boolean 
            -- "Is the first array contained by the second?"
            -- select (ARRAY[5,3,1] <@ ARRAY[2,3,5]) = false (results in true)
            -- select (ARRAY[5,3] <@ ARRAY[2,3,5]) = false (results in false)
            -- thus below should be true if allowed_section has a section that is not in assigned_sections
            WHEN COUNT(*) FILTER (WHERE (allowed_self_assignable_sections.allowed_sections <@ review_assignment_assigned_sections.assigned_sections) = false
                AND action_review.id IS NULL) != 0 THEN
                'SELF_ASSIGN'
            WHEN COUNT(*) FILTER (WHERE (stage_status.status = 'CHANGES_REQUIRED'
                OR stage_status.status = 'DRAFT')
                AND reviewer_assignment.status = 'ASSIGNED'
                AND action_review_status_history.status = 'SUBMITTED') != 0 THEN
                'AWAITING_RESPONSE'
            WHEN COUNT(*) FILTER (WHERE reviewer_assignment.status = 'ASSIGNED'
                OR action_review_status_history.status = 'SUBMITTED') != 0 THEN
                'VIEW_REVIEW'
            ELSE
                NULL
            END::reviewer_action,
            -- ASSIGNER ACTIONS
            CASE
            -- Using MIN because number_of_assigned_sections is for each level (i.e. there are multiple levels grouped by stage_id)
            WHEN MIN(assigned_sections_by_stage_and_level.assigned_section_for_level) < COUNT(DISTINCT (assignable_sections.id)) THEN
                'ASSIGN'
            WHEN MIN(assigned_sections_by_stage_and_level.assigned_in_progress_sections) = COUNT(DISTINCT (assignable_sections.id)) THEN
                'RE_ASSIGN'
            ELSE
                NULL
            END::assigner_action
        FROM
            public.application app
            JOIN public.template ON app.template_id = template.id
            LEFT JOIN public.application_stage_status_latest AS stage_status ON app.id = stage_status.application_id
            -- REVIEWERS and ASSIGNERS
        LEFT JOIN review_assignment AS assigned_assignment ON (assigned_assignment.application_id = app.id
                AND assigned_assignment.stage_id = stage_status.stage_id
                AND assigned_assignment.status = 'ASSIGNED')
        LEFT JOIN public."user" AS assigner_user ON assigned_assignment.assigner_id = assigner_user.id
        LEFT JOIN public."user" AS reviewer_user ON assigned_assignment.reviewer_id = reviewer_user.id
        -- REVIEWER ACTIONS
        LEFT JOIN review_assignment AS reviewer_assignment ON (reviewer_assignment.application_id = app.id
                AND reviewer_assignment.stage_id = stage_status.stage_id
                AND app.outcome = 'PENDING'
                AND reviewer_assignment.reviewer_id = userId)
        LEFT JOIN review AS action_review ON action_review.review_assignment_id = reviewer_assignment.id
        LEFT JOIN review_status_history AS action_review_status_history ON (action_review_status_history.review_id = action_review.id
                AND action_review_status_history.is_current = TRUE)
            -- ASSIGNER ACTIONS
        LEFT JOIN assigned_sections_by_stage_and_level ON (assigned_sections_by_stage_and_level.application_id = app.id
                AND assigned_sections_by_stage_and_level.stage_id = stage_status.stage_id
                AND app.outcome = 'PENDING'
                AND assigned_sections_by_stage_and_level.assigner_id = userId)
        LEFT JOIN template_section AS assignable_sections ON assignable_sections.template_id = template.id
        LEFT JOIN allowed_self_assignable_sections(userId) AS allowed_self_assignable_sections ON allowed_self_assignable_sections.review_assignment_id = reviewer_assignment.id
        LEFT JOIN review_assignment_assigned_sections(userId) as review_assignment_assigned_sections ON review_assignment_assigned_sections.review_assignment_id = reviewer_assignment.id
    WHERE
        app.id = applicationId
    GROUP BY stage_status.stage_id;
$$
LANGUAGE sql
STABLE;

-- These functions now performed by server in 'updateReviewerStats.ts':
DROP FUNCTION IF EXISTS public.update_application_reviewer_stats CASCADE;
DROP FUNCTION IF EXISTS public.update_application_new_assigner_stats CASCADE;
DROP FUNCTION IF EXISTS public.update_reviewer_stats_from_status CASCADE;
DROP FUNCTION IF EXISTS public.update_application_reviewer_stats_for_application CASCADE;

-- Function to notify server on updates to tables that will require updating of
-- available reviewer actions. This replaces the above 4 functions.
CREATE OR REPLACE FUNCTION public.notify_server_to_update_reviewer_stats ()
    RETURNS TRIGGER
    AS $trigger_event$
BEGIN
    PERFORM
        pg_notify('update_reviewer_stats_notification', json_build_object('tableName', TG_TABLE_NAME, 'data', NEW, 'operation', TG_OP)::text);
    RETURN NULL;
END;
$trigger_event$
LANGUAGE plpgsql;

-- Triggers to trigger the above function
    -- for review_assignment
DROP TRIGGER IF EXISTS update_application_reviewer_stats ON public.review_assignment;
CREATE TRIGGER update_application_reviewer_stats
    AFTER UPDATE OF status, allowed_sections, assigned_sections
     ON public.review_assignment
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_reviewer_stats ();

    -- for review_status_history
DROP TRIGGER IF EXISTS update_reviewer_stats_from_status ON public.review_status_history;
CREATE TRIGGER update_reviewer_stats_from_status
    AFTER INSERT ON public.review_status_history
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_reviewer_stats ();

    -- for application
DROP TRIGGER IF EXISTS update_application_reviewer_stats_for_application ON public.application;
CREATE TRIGGER update_application_reviewer_stats_for_application
    AFTER UPDATE OF outcome ON public.application
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_reviewer_stats ();

    -- for review_assignment_assigner_join (no longer required, updated by
    -- generateReviewAssignments Action instead)
DROP TRIGGER IF EXISTS update_application_new_assigner_stats ON public.review_assignment_assigner_join;

-- This is a dummy table for the application list. Needs to be defined so that
-- GraphQL types for the list get exposed by Postgraphile
DROP TABLE IF EXISTS application_list_shape CASCADE;
CREATE TABLE IF NOT EXISTS application_list_shape (
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
    reviewers varchar[],
    assigners varchar[],
    reviewer_action public.reviewer_action,
    assigner_action public.assigner_action
);


-- Special VIEW to list users using no security restrictions, which we join to
-- the application list to yield associated applicants
CREATE OR REPLACE VIEW public.user_list
WITH (security_invoker = false)
AS
 SELECT id, first_name, last_name, full_name, username FROM "user";
 
-- Since regular "user" table is hidden in GraphQL schema, we use this view to
-- make a user list available to back-end data view queries, and we manipulate
-- its name and foreign key references to be consistent with the standard "user"
-- table, using smart tags (see postgraphile.tags.json5)
CREATE OR REPLACE VIEW public.user_list_admin
WITH (security_invoker = true)
AS
 SELECT * FROM "user";

-- APPLICATION_LIST_VIEW
-- Aggregated VIEW method of all data required for application list page
-- Requires an empty table as setof return and smart comment to make orderBy work (https://github.com/graphile/graphile-engine/pull/378)
-- Utilises the pre-computing done by the previous functions/triggers for quick
-- access to the required values for a particular reviewer/assigner
DROP FUNCTION IF EXISTS application_list CASCADE;
CREATE OR REPLACE FUNCTION application_list(userId int DEFAULT 0)
    RETURNS SETOF application_list_shape
    AS $$
    SELECT 
        app.id,
        app.serial,
        app.name,
        stage_status.template_code, 
        stage_status.template_name,
        user_list.full_name as applicant,
        organisation.name as org_name,
        stage_status.stage,
        stage_status.stage_colour,
        stage_status.status,
        app.outcome,
        status_history_time_created AS last_active_date,
        ts.time_scheduled AS applicant_deadline,
        app.reviewer_list AS reviewers,
        app.assigner_list AS assigners,
        reviewer_action,
        assigner_action
        FROM application app
        LEFT JOIN application_stage_status_latest as stage_status
            ON app.id = stage_status.application_id
        LEFT JOIN user_list 
            ON app.user_id = user_list.id
        LEFT JOIN organisation
            ON app.org_id = organisation.id
        LEFT JOIN trigger_schedule ts ON app.id = ts.application_id
                AND ts.is_active = TRUE
                AND ts.event_code = 'applicantDeadline'
        LEFT JOIN application_reviewer_action AS actions
            ON actions.user_id = userId
            AND actions.application_id = app.id
        WHERE app.is_config = false
        ORDER BY app.id
    $$
    LANGUAGE sql
    STABLE;

-- (https://github.com/graphile/graphile-engine/pull/378)
-- Required to make 'orderBy' work in application_list
COMMENT ON FUNCTION application_list (userId int) IS E'@sortable';

-- APPLICATION_LIST_FILTERS
CREATE OR REPLACE FUNCTION application_list_filter_applicant (applicant varchar, template_code varchar)
    RETURNS TABLE (
        applicant varchar
    )
    AS $$
    SELECT DISTINCT
        (applicant)
    FROM
        application_list ()
    WHERE
        applicant ILIKE CONCAT('%', $1, '%')
        AND template_code = $2
$$
LANGUAGE sql
STABLE;

CREATE OR REPLACE FUNCTION application_list_filter_organisation (organisation varchar, template_code varchar)
    RETURNS TABLE (
        organisation varchar
    )
    AS $$
    SELECT DISTINCT
        (org_name)
    FROM
        application_list ()
    WHERE
        org_name ILIKE CONCAT('%', $1, '%')
        AND template_code = $2
$$
LANGUAGE sql
STABLE;

CREATE OR REPLACE FUNCTION application_list_filter_reviewer (reviewer varchar, template_code varchar)
    RETURNS TABLE (
        reviewer varchar
    )
    AS $$
    SELECT DISTINCT
        reviewers_unset
    FROM
        application_list (),
        unnest(reviewers) reviewers_unset
WHERE
    reviewers_unset ILIKE CONCAT('%', $1, '%')
    AND template_code = $2
$$
LANGUAGE sql
STABLE;

CREATE OR REPLACE FUNCTION application_list_filter_assigner (assigner varchar, template_code varchar)
    RETURNS TABLE (
        assigner varchar
    )
    AS $$
    SELECT DISTINCT
        assigners_unset
    FROM
        application_list (),
        unnest(assigners) assigners_unset
WHERE
    assigners_unset ILIKE CONCAT('%', $1, '%')
    AND template_code = $2
$$
LANGUAGE sql
STABLE;

CREATE OR REPLACE FUNCTION application_list_filter_stage (template_code varchar)
    RETURNS TABLE (
        stage varchar
    )
    AS $$
    SELECT DISTINCT
        (stage)
    FROM
        application_list ()
    WHERE
        template_code = $1
$$
LANGUAGE sql
STABLE;

-- ACTIVITY_LOG
-- TRIGGERS and FUNCTIONS for updating activity log
-- STAGE changes
CREATE OR REPLACE FUNCTION public.stage_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
DECLARE
    stage_num integer;
    stage_name varchar;
    stage_col varchar;
BEGIN
    SELECT
        number,
        title,
        colour INTO stage_num,
        stage_name,
        stage_col
    FROM
        public.template_stage
    WHERE
        id = NEW.stage_id;
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('STAGE', stage_name, NEW.application_id, TG_TABLE_NAME, NEW.id, json_build_object('stage', json_build_object('number', stage_num, 'name', stage_name, 'colour', stage_col)));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stage_activity_trigger ON public.application_stage_history;

CREATE TRIGGER stage_activity_trigger
    AFTER INSERT ON public.application_stage_history
    FOR EACH ROW
    EXECUTE FUNCTION stage_activity_log ();

-- STATUS changes
CREATE OR REPLACE FUNCTION public.status_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
DECLARE
    app_id integer;
    prev_status varchar;
BEGIN
    app_id = (
        SELECT
            application_id
        FROM
            public.application_stage_history
        WHERE
            id = NEW.application_stage_history_id);
    prev_status = (
        SELECT
            status
        FROM
            public.application_status_history
        WHERE
            application_id = app_id
            AND is_current = TRUE);
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('STATUS', NEW.status, app_id, TG_TABLE_NAME, NEW.id, json_build_object('prevStatus', prev_status, 'status', NEW.status));
    RETURN NEW;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS status_activity_trigger ON public.application_status_history;

CREATE TRIGGER status_activity_trigger
-- We run this trigger BEFORE insertion so we can more easily capture the
-- previous status value
    BEFORE INSERT ON public.application_status_history
    FOR EACH ROW
    EXECUTE FUNCTION status_activity_log ();

-- OUTCOME changes
CREATE OR REPLACE FUNCTION public.outcome_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
BEGIN
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('OUTCOME', NEW.outcome, NEW.id, TG_TABLE_NAME, NEW.id, json_build_object('outcome', NEW.outcome));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outcome_insert_activity_trigger ON public.application;

CREATE TRIGGER outcome_insert_activity_trigger
    AFTER INSERT ON public.application
    FOR EACH ROW
    EXECUTE FUNCTION outcome_activity_log ();

DROP TRIGGER IF EXISTS outcome_update_activity_trigger ON public.application;

CREATE TRIGGER outcome_update_activity_trigger
    AFTER UPDATE ON public.application
    FOR EACH ROW
    WHEN (NEW.outcome <> OLD.outcome)
    EXECUTE FUNCTION outcome_activity_log ();

-- SCHEDULED EVENT (Deadline) changes
CREATE OR REPLACE FUNCTION public.deadline_extension_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
BEGIN
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('EXTENSION', NEW.event_code, NEW.application_id, TG_TABLE_NAME, NEW.id, json_build_object('newDeadline', NEW.time_scheduled, 'extendedBy', json_build_object('userId', NEW.editor_user_id, 'name', (
                        SELECT
                            full_name
                        FROM public."user"
                        WHERE
                            id = NEW.editor_user_id))));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deadline_extension_activity_trigger ON public.trigger_schedule;

CREATE TRIGGER deadline_extension_activity_trigger
    AFTER UPDATE ON public.trigger_schedule
    FOR EACH ROW
    WHEN (NEW.time_scheduled > OLD.time_scheduled AND NEW.event_code = 'applicantDeadline' AND NEW.editor_user_id IS NOT NULL)
    EXECUTE FUNCTION deadline_extension_activity_log ();

-- ASSIGNMENT changes
CREATE OR REPLACE FUNCTION public.assignment_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
BEGIN
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('ASSIGNMENT', (
                CASE WHEN NEW.status = 'ASSIGNED'
                    AND NEW.reviewer_id = NEW.assigner_id THEN
                    'Self-Assigned'
                WHEN NEW.status = 'ASSIGNED'
                    AND NEW.reviewer_id <> NEW.assigner_id THEN
                    'Assigned'
                WHEN NEW.status = 'AVAILABLE' THEN
                    'Unassigned'
                ELSE
                    'ERROR'
                END), NEW.application_id, TG_TABLE_NAME, NEW.id, json_build_object('status', NEW.status, 'reviewer', json_build_object('id', NEW.reviewer_id, 'name', (
                        SELECT
                            full_name
                        FROM public."user"
                        WHERE
                            id = NEW.reviewer_id), 'orgId', NEW.organisation_id, 'orgName', (
                            SELECT
                                name
                            FROM public.organisation
                            WHERE
                                id = NEW.organisation_id)), 'assigner', json_build_object('id', NEW.assigner_id, 'name', (
                                SELECT
                                    full_name
                                FROM public."user"
                                WHERE
                                    id = NEW.assigner_id)), 'stage', json_build_object('number', NEW.stage_number, 'name', (
                                    SELECT
                                        title
                                    FROM public.template_stage
                                    WHERE
                                        id = NEW.stage_id)), 'sections', COALESCE((
                                    SELECT
                                        json_agg(t)
                                    FROM (
                                        SELECT
                                            title, code, "index"
                                        FROM public.template_section
                                    WHERE
                                        code = ANY (ARRAY (
                                                SELECT
                                                    assigned_sections
                                                FROM public.review_assignment
                                            WHERE
                                                id = NEW.id))
                                        AND template_id = NEW.template_id
                                        AND NEW.assigned_sections <> '{}' ORDER BY "index") t), (
                                    SELECT
                                        json_agg(t)
                                    FROM (
                                        SELECT
                                            title, code, "index"
                                        FROM public.template_section
                                    WHERE
                                        code = ANY (OLD.assigned_sections)
                                        AND template_id = NEW.template_id ORDER BY "index") t)), 'reviewLevel', NEW.level_number));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

-- For this trigger, we watch for changes to TRIGGER field, so it only runs
-- once other triggers have finished
DROP TRIGGER IF EXISTS assignment_activity_trigger ON public.review_assignment;

CREATE TRIGGER assignment_activity_trigger
    AFTER UPDATE ON public.review_assignment
    FOR EACH ROW
    WHEN (NEW.assigned_sections <> OLD.assigned_sections)
    -- WHEN (NEW.trigger IS NULL AND OLD.trigger = 'PROCESSING')
    EXECUTE FUNCTION assignment_activity_log ();

-- REVIEW STATUS CHANGES
CREATE OR REPLACE FUNCTION public.review_status_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
DECLARE
    app_id integer;
    reviewer_id integer;
    assignment_id integer;
    stage_number integer;
    prev_status varchar;
    level_num integer;
    is_last_level boolean;
    is_final_decision boolean;
    templ_id integer;
BEGIN
    SELECT
        r.application_id,
        r.reviewer_id,
        r.review_assignment_id,
        r.stage_number,
        r.level_number,
        r.is_last_level,
        r.is_final_decision INTO app_id,
        reviewer_id,
        assignment_id,
        stage_number,
        level_num,
        is_last_level,
        is_final_decision
    FROM
        public.review r
    WHERE
        id = NEW.review_id;
    templ_id = (
        SELECT
            template_id
        FROM
            public.application
        WHERE
            id = app_id);
    prev_status = (
        SELECT
            status
        FROM
            public.review_status_history
        WHERE
            review_id = NEW.review_id
            AND is_current = TRUE);
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('REVIEW', NEW.status, app_id, TG_TABLE_NAME, NEW.id, json_build_object('prevStatus', prev_status, 'status', NEW.status, 'reviewId', NEW.review_id, 'reviewer', json_build_object('id', reviewer_id, 'name', (
                        SELECT
                            full_name
                        FROM public."user"
                        WHERE
                            id = reviewer_id), 'stage', json_build_object('number', stage_number, 'name', (
                                SELECT
                                    title
                                FROM public.template_stage
                                WHERE
                                    number = stage_number
                                    AND template_id = templ_id))), 'sections', (
                            SELECT
                                json_agg(t)
                            FROM (
                                SELECT
                                    title, code, "index"
                                FROM public.template_section
                            WHERE
                                code = ANY (ARRAY (
                                        SELECT
                                            assigned_sections
                                        FROM public.review_assignment
                                    WHERE
                                        id = assignment_id
                                        AND template_id = templ_id
                                        AND assigned_sections <> '{}'))
                                AND template_id = templ_id ORDER BY "index") t), 'level', level_num, 'isLastLevel', is_last_level, 'finalDecision', is_final_decision));
    RETURN NEW;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_status_activity_trigger ON public.review_status_history;

CREATE TRIGGER review_status_activity_trigger
-- We run this trigger BEFORE insertion so we can more easily capture the
-- previous status value
    BEFORE INSERT ON public.review_status_history
    FOR EACH ROW
    EXECUTE FUNCTION review_status_activity_log ();

-- REVIEW_DECISION changes
CREATE OR REPLACE FUNCTION public.review_decision_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
DECLARE
    app_id integer;
    reviewer_id integer;
    rev_assignment_id integer;
    templ_id integer;
BEGIN
    SELECT
        r.application_id,
        r.reviewer_id,
        r.review_assignment_id INTO app_id,
        reviewer_id,
        rev_assignment_id
    FROM
        public.review r
    WHERE
        id = NEW.review_id;
    templ_id = (
        SELECT
            template_id
        FROM
            public.application
        WHERE
            id = app_id);
    INSERT INTO public.activity_log (type, value, application_id, "table", record_id, details)
        VALUES ('REVIEW_DECISION', NEW.decision, app_id, TG_TABLE_NAME, NEW.id, json_build_object('reviewId', NEW.review_id, 'decision', NEW.decision, 'comment', NEW.comment, 'reviewer', json_build_object('id', reviewer_id, 'name', (
                        SELECT
                            full_name
                        FROM public."user"
                        WHERE
                            id = reviewer_id)), 'sections', (
                        SELECT
                            json_agg(t)
                        FROM (
                            SELECT
                                title, code, "index"
                            FROM public.template_section
                            WHERE
                                code = ANY (ARRAY (
                                        SELECT
                                            assigned_sections
                                        FROM public.review_assignment
                                    WHERE
                                        id = rev_assignment_id
                                        AND assigned_sections <> '{}'))
                                AND template_id = templ_id ORDER BY "index") t)));
    RETURN NULL;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_decision_activity_trigger ON public.review_decision;

CREATE TRIGGER review_decision_activity_trigger
    AFTER UPDATE ON public.review_decision
    FOR EACH ROW
    WHEN (NEW.decision <> OLD.decision)
    EXECUTE FUNCTION review_decision_activity_log ();

-- PERMISSION CHANGES
CREATE OR REPLACE FUNCTION public.permission_activity_log ()
    RETURNS TRIGGER
    SECURITY DEFINER
    AS $application_event$
DECLARE
    user_id integer;
    username varchar;
    org_id integer;
    org_name varchar;
    permission_id integer;
    permission_name varchar;
    active boolean;
    data record;
    status varchar;
BEGIN
    data = CASE WHEN TG_OP = 'DELETE' THEN
        OLD
    ELSE
        NEW
    END;
    status = CASE WHEN TG_OP = 'DELETE' THEN
        'Revoked'
    ELSE
        'Granted'
    END;
    SELECT DISTINCT
        "userId",
        p.username,
        "orgId",
        "orgName",
        "permissionNameId",
        "permissionName",
        "isActive" INTO user_id,
        username,
        org_id,
        org_name,
        permission_id,
        permission_name,
        active
    FROM
        permissions_all p
    WHERE
        "permissionJoinId" = data.id;
    INSERT INTO public.activity_log (type, value, "table", record_id, details)
        VALUES ('PERMISSION', status, TG_TABLE_NAME, data.id, json_build_object('permission', json_build_object('id', permission_id, 'name', permission_name), 'user', json_build_object('id', user_id, 'username', username, 'name', (
                        SELECT
                            full_name
                        FROM public."user"
                        WHERE
                            id = user_id)), 'organisation', json_build_object('id', org_id, 'name', org_name), 'isActive', active));
    RETURN data;
END;
$application_event$
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS permission_insert_activity_trigger ON public.permission_join;

CREATE TRIGGER permission_insert_activity_trigger
    AFTER INSERT ON public.permission_join
    FOR EACH ROW
    EXECUTE FUNCTION permission_activity_log ();

DROP TRIGGER IF EXISTS permission_delete_activity_trigger ON public.permission_join;

CREATE TRIGGER permission_delete_activity_trigger
    BEFORE DELETE ON public.permission_join
    FOR EACH ROW
    EXECUTE FUNCTION permission_activity_log ();

CREATE OR REPLACE view permission_flattened as
    SELECT "user".id as user_id, permission_join.organisation_id as organisation_id, permission_policy.id as permission_policy_id, template_permission.template_id as template_id  
    FROM "user" 
    JOIN permission_join ON permission_join.user_id = "user".id
    JOIN permission_name ON permission_name.id = permission_join.permission_name_id
    JOIN permission_policy ON permission_policy.id = permission_name.permission_policy_id
    JOIN template_permission ON template_permission.permission_name_id = permission_name.id;

-- CHECKSUMS
-- FUNCTION to update Checksums for template-connected tables (for
-- export/import)
CREATE OR REPLACE FUNCTION public.notify_server_to_update_checksum ()
    RETURNS TRIGGER
    AS $trigger_event$
BEGIN
    PERFORM
        pg_notify('recalculate_checksum_notification', json_build_object('tableName', TG_TABLE_NAME, 'id', NEW.id)::text);
    RETURN NULL;
END;
$trigger_event$
LANGUAGE plpgsql;

-- Triggers to launch the above function
DROP TRIGGER IF EXISTS recalculate_permission_checksum_insert ON public.permission_name;
CREATE TRIGGER recalculate_permission_checksum_insert
    AFTER INSERT ON public.permission_name
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_permission_checksum_update ON public.permission_name;
CREATE TRIGGER recalculate_permission_checksum_update
    AFTER UPDATE ON public.permission_name
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_data_view_checksum_insert ON public.data_view;
CREATE TRIGGER recalculate_data_view_checksum_insert
    AFTER INSERT ON public.data_view
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_data_view_checksum_update ON public.data_view;
CREATE TRIGGER recalculate_data_view_checksum_update
    AFTER UPDATE ON public.data_view
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_data_view_column_checksum_insert ON public.data_view_column_definition;
CREATE TRIGGER recalculate_data_view_column_checksum_insert
    AFTER INSERT ON public.data_view_column_definition
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_data_view_column_checksum_update ON public.data_view_column_definition;
CREATE TRIGGER recalculate_data_view_column_checksum_update
    AFTER UPDATE ON public.data_view_column_definition
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_category_checksum_insert ON public.template_category;
CREATE TRIGGER recalculate_category_checksum_insert
    AFTER INSERT ON public.template_category
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_category_checksum_update ON public.template_category;
CREATE TRIGGER recalculate_category_checksum_update
    AFTER UPDATE ON public.template_category
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_filter_checksum_insert ON public.filter;
CREATE TRIGGER recalculate_filter_checksum_insert
    AFTER INSERT ON public.filter
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_filter_checksum_update ON public.filter;
CREATE TRIGGER recalculate_filter_checksum_update
    AFTER UPDATE ON public.filter
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_file_checksum_insert ON public.file;
CREATE TRIGGER recalculate_file_checksum_insert
    AFTER INSERT ON public.file
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();

DROP TRIGGER IF EXISTS recalculate_file_checksum_update ON public.file;
CREATE TRIGGER recalculate_file_checksum_update
    AFTER UPDATE ON public.file
    FOR EACH ROW
    WHEN (NEW.checksum = OLD.checksum OR NEW.checksum IS NULL)
    EXECUTE FUNCTION public.notify_server_to_update_checksum ();
