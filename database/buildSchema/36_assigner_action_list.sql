-- Aggregated VIEW method of all related assigner data to each application on application list page
CREATE TYPE public.assigner_action as ENUM (
    'ASSIGN',
    'RE_ASSIGN'
);

CREATE FUNCTION assigner_list (stageid int, assignerid int)
    RETURNS TABLE (
        application_id int,
        assigner_action public.assigner_action,
        is_fully_assigned_level_1 boolean,
        assigned_questions_level_1 bigint,
        total_questions bigint
    )
    AS $$
    SELECT
        review_assignment.application_id AS application_id,
        CASE
            WHEN COUNT(DISTINCT (review_assignment.id)) != 0 AND assigned_questions_count(application_id, $1, 1) >= template_questions_count(application_id) 
                THEN 'RE_ASSIGN'
            WHEN COUNT(DISTINCT (review_assignment.id)) != 0 AND assigned_questions_count(application_id, $1, 1) < template_questions_count(application_id)
                THEN 'ASSIGN'
            ELSE NULL
        END::assigner_action,
        assigned_questions_count(application_id, $1, 1) = template_questions_count(application_id) AS is_fully_assigned_level_1,
        assigned_questions_count(application_id, $1, 1) AS assigned_questions_level_1,
        template_questions_count(application_id) AS total_questions
    FROM
        review_assignment
    LEFT JOIN review_assignment_assigner_join ON review_assignment.id = review_assignment_assigner_join.review_assignment_id
WHERE 
    review_assignment.stage_id = $1
    AND review_assignment_assigner_join.assigner_id = $2
GROUP BY
    review_assignment.application_id;

$$
LANGUAGE sql
STABLE;

