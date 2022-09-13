// Keep this list up to date!

/*
A list of tables whose triggers should be suppressed during snapshot data
insert, so they don't create extraneous records in the activity_log, or other
unwanted behaviours.

Get a list of all tables that have triggers with the following query:

SELECT  event_object_table AS table_name ,trigger_name         
FROM information_schema.triggers  
GROUP BY table_name , trigger_name 
ORDER BY table_name ,trigger_name;
*/

export const triggerTables = [
  'action_queue',
  'trigger_queue',
  'trigger_schedule',
  'verification',
  'application',
  'application_response',
  'application_stage_history',
  'application_status_history',
  'review',
  'review_decision',
  'review_response',
  'review_assignment',
  'review_status_history',
  'review_decision',
  'permission_join',
  'file',
]

/*
The following tables have triggers, but *shouldn't* be disabled, as
they're required for the snapshot import process:

- template

*/
