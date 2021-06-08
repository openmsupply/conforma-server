-- template element (questions or information elements)
CREATE TYPE public.template_element_category AS ENUM (
    'QUESTION',
    'INFORMATION'
);

-- FUNCTION to return template_code for current element/section
CREATE OR REPLACE FUNCTION public.get_template_code (section_id int)
    RETURNS varchar
    AS $$
    SELECT
        template.code
    FROM
        TEMPLATE
        JOIN template_section ON template_id = template.id
    WHERE
        template_section.id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

-- FUNCTION to return template_version for current element/section
CREATE OR REPLACE FUNCTION public.get_template_version (section_id int)
    RETURNS integer
    AS $$
    SELECT
        template.version
    FROM
        TEMPLATE
        JOIN template_section ON template_id = template.id
    WHERE
        template_section.id = $1;

$$
LANGUAGE SQL
IMMUTABLE;

CREATE TABLE public.template_element (
    id serial PRIMARY KEY,
    section_id integer REFERENCES public.template_section (id),
    code varchar NOT NULL,
    index integer,
    title varchar,
    category public.template_element_category,
    element_type_plugin_code varchar,
    visibility_condition jsonb DEFAULT 'true' ::jsonb,
    is_required jsonb DEFAULT 'true' ::jsonb,
    is_editable jsonb DEFAULT 'true' ::jsonb,
    validation jsonb DEFAULT 'true' ::jsonb,
    validation_message varchar,
    help_text varchar,
    parameters jsonb,
    template_code varchar GENERATED ALWAYS AS (public.get_template_code (section_id)) STORED,
    template_version integer GENERATED ALWAYS AS (public.get_template_version (section_id)) STORED,
    UNIQUE (template_code, code, template_version)
);

