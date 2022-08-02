-- trigger queue
CREATE TYPE public.trigger AS ENUM (
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
    'ON_REVIEW_REASSIGN',
    'ON_REVIEW_SELF_ASSIGN',
    'ON_APPROVAL_SUBMIT',
    'ON_VERIFICATION',
    'ON_SCHEDULE',
    'ON_PREVIEW',
    'ON_EXTEND',
    'DEV_TEST',
    'PROCESSING',
    'ERROR'
);

CREATE TYPE public.trigger_queue_status AS ENUM (
    'TRIGGERED',
    'ACTIONS_DISPATCHED',
    'ERROR',
    'COMPLETED'
);

CREATE TABLE public.trigger_queue (
    id serial PRIMARY KEY,
    trigger_type public.trigger,
    "table" varchar,
    record_id int,
    event_code varchar,
    data jsonb,
    timestamp timestamptz DEFAULT CURRENT_TIMESTAMP,
    status public.trigger_queue_status,
    log jsonb
);

-- Function to add triggers to queue
CREATE OR REPLACE FUNCTION public.add_event_to_trigger_queue ()
    RETURNS TRIGGER
    AS $trigger_queue$
BEGIN
    --
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
CREATE TRIGGER trigger_queue
    AFTER INSERT ON public.trigger_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_trigger_queue ();

