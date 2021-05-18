-- template_permission table
CREATE TABLE public.template_permission (
    id serial PRIMARY KEY,
    permission_name_id integer REFERENCES public.permission_name (id),
    template_id integer REFERENCES public.template (id),
    allowed_sections varchar[] DEFAULT NULL,
    can_self_assign boolean NOT NULL DEFAULT false,
    stage_number integer,
    level_number integer,
    restrictions jsonb
);

CREATE VIEW permissions_all AS (
    SELECT
        "user".username AS "username",
        organisation.name AS "orgName",
        "template".code AS "templateCode",
        permission_name.name AS "permissionName",
        template_permission.stage_number AS "stageNumber",
        template_permission.level_number AS "reviewLevel", 
        template_permission.allowed_sections AS "allowedSections",
        template_permission.can_self_assign AS "canSelfAssign",
        template_permission.restrictions AS "restrictions",
        permission_policy.name AS "policyName",
        permission_policy.type AS "permissionType",
        permission_policy.id AS "permissionPolicyId",
        permission_policy.rules AS "permissionPolicyRules",
        permission_name.id AS "permissionNameId",
        template_permission.id AS "templatePermissionId",
        "template".id AS "templateId",
        "user".id AS "userId",
        permission_join.organisation_id AS "orgId"
    FROM
        permission_name
        JOIN permission_join ON permission_join.permission_name_id = permission_name.id
        JOIN permission_policy ON permission_policy.id = permission_name.permission_policy_id
        LEFT JOIN "user" ON permission_join.user_id = "user".id
        LEFT JOIN organisation ON permission_join.organisation_id = organisation.id
        LEFT JOIN template_permission ON template_permission.permission_name_id = permission_name.id
        LEFT JOIN "template" ON "template".id = template_permission.template_id);

