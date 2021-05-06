-- FUNCTION to auto-add application_id to review
CREATE OR REPLACE FUNCTION public.review_application_id (review_assignment_id int)
    RETURNS int
    AS $$
    SELECT
        application_id
    FROM
        review_assignment
    WHERE
        id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- FUNCTION to auto-add reviewer_id to review
CREATE OR REPLACE FUNCTION public.review_reviewer_id (review_assignment_id int)
    RETURNS int
    AS $$
    SELECT
        reviewer_id
    FROM
        review_assignment
    WHERE
        id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- FUNCTION to auto-add level to review
CREATE OR REPLACE FUNCTION public.review_level (review_assignment_id int)
    RETURNS int
    AS $$
    SELECT
        level_number
    FROM
        review_assignment
    WHERE
        id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- FUNCTION to auto-add stage_number to review
CREATE OR REPLACE FUNCTION public.review_stage (review_assignment_id int)
    RETURNS int
    AS $$
    SELECT
        stage_number
    FROM
        review_assignment
    WHERE
        id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- FUNCTION to auto-add is_last_level to review
CREATE OR REPLACE FUNCTION public.review_is_last_level (review_assignment_id int)
    RETURNS boolean
    AS $$
    SELECT
        is_last_level
    FROM
        review_assignment
    WHERE
        id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- review
CREATE TABLE public.review (
    id serial PRIMARY KEY,
    review_assignment_id integer REFERENCES public.review_assignment (id),
    -- status via review_status_history
    -- time_created viw review_status_history
    TRIGGER public.trigger,
    application_id integer GENERATED ALWAYS AS (public.review_application_id (review_assignment_id)) STORED REFERENCES public.application (id),
    reviewer_id integer GENERATED ALWAYS AS (public.review_reviewer_id (review_assignment_id)) STORED REFERENCES public.user (id),
    level_number integer GENERATED ALWAYS AS (public.review_level (review_assignment_id)) STORED,
    stage_number integer GENERATED ALWAYS AS (public.review_stage (review_assignment_id)) STORED,
    is_last_level boolean GENERATED ALWAYS AS (public.review_is_last_level (review_assignment_id)) STORED
);

-- TRIGGER (Listener) on review table
CREATE TRIGGER review_trigger
    AFTER INSERT OR UPDATE OF trigger ON public.review
    FOR EACH ROW
    WHEN (NEW.trigger IS NOT NULL AND NEW.trigger <> 'PROCESSING' AND NEW.trigger <> 'ERROR')
    EXECUTE FUNCTION public.add_event_to_trigger_queue ();

