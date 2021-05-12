-- permission_policy table
CREATE TYPE public.permission_policy_type AS ENUM (
    'REVIEW',
    'APPLY',
    'ASSIGN'
);

CREATE TABLE public.permission_policy (
    id serial PRIMARY KEY,
    name varchar UNIQUE,
    description varchar,
    rules jsonb,
    type public.permission_policy_type,
    default_restrictions jsonb
);

