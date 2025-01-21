// 2025-01-20 -- this info no longer used, just keeping it round for reference

// Keep this list up to date!

/*
A list of tables whose triggers should be suppressed during snapshot data
insert, so they don't create extraneous records in the activity_log, or other
unwanted behaviours.

Note: we don't disable these for template-only imports, as some of the triggers are actually required e.g. template version management trigger

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
  'template',
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
