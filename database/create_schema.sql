-- Connect to database first:
DROP SCHEMA IF EXISTS public CASCADE;

DROP OWNED BY graphile_user;

DROP USER IF EXISTS graphile_user;

CREATE SCHEMA public;

SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = ON;

SELECT
    pg_catalog.set_config('search_path', '', FALSE);

SET check_function_bodies = FALSE;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = OFF;

SET default_table_access_method = heap;

-- Add graphile_user, used by Postgraphile
DO $$
BEGIN
    CREATE ROLE graphile_user WITH NOLOGIN;
EXCEPTION
    WHEN DUPLICATE_OBJECT THEN
        RAISE NOTICE 'not creating role graphile_user -- it already exists';
END
$$;

ALTER ROLE graphile_user WITH LOGIN;

GRANT ALL PRIVILEGES ON DATABASE tmf_app_manager TO graphile_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO graphile_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO graphile_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO graphile_user;

ALTER DEFAULT PRIVILEGES FOR USER postgres IN SCHEMA public GRANT
SELECT, INSERT, UPDATE, DELETE ON TABLES TO graphile_user;

