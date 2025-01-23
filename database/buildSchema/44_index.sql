-- INDEXES
-- Foreign key indexes:
CREATE INDEX IF NOT EXISTS "i_action_queue_template_id_fkey" ON action_queue (template_id);

CREATE INDEX IF NOT EXISTS "i_action_queue_trigger_event_fkey" ON action_queue (trigger_event);

CREATE INDEX IF NOT EXISTS "i_application_org_id_fkey" ON application (org_id);

CREATE INDEX IF NOT EXISTS "i_application_template_id_fkey" ON application (template_id);

CREATE INDEX IF NOT EXISTS "i_application_user_id_fkey" ON application (user_id);

CREATE INDEX IF NOT EXISTS "i_application_note_application_id_fkey" ON application_note (application_id);

CREATE INDEX IF NOT EXISTS "i_application_note_org_id_fkey" ON application_note (org_id);

CREATE INDEX IF NOT EXISTS "i_application_note_user_id_fkey" ON application_note (user_id);

CREATE INDEX IF NOT EXISTS "i_application_response_application_id_fkey" ON application_response (application_id);

CREATE INDEX IF NOT EXISTS "i_application_response_template_element_id_fkey" ON application_response (template_element_id);

CREATE INDEX IF NOT EXISTS "i_application_stage_history_application_id_fkey" ON application_stage_history (application_id);

CREATE INDEX IF NOT EXISTS "i_application_stage_history_stage_id_fkey" ON application_stage_history (stage_id);

CREATE INDEX IF NOT EXISTS "i_application_status_history_application_stage_history_id_fkey" ON application_status_history (application_stage_history_id);

CREATE INDEX IF NOT EXISTS "i_file_application_note_id_fkey" ON file (application_note_id);

CREATE INDEX IF NOT EXISTS "i_file_application_response_id_fkey" ON file (application_response_id);

CREATE INDEX IF NOT EXISTS "i_file_application_serial_fkey" ON file (application_serial);

CREATE INDEX IF NOT EXISTS "i_file_user_id_fkey" ON file (user_id);

CREATE INDEX IF NOT EXISTS "i_notification_application_id_fkey" ON notification (application_id);

CREATE INDEX IF NOT EXISTS "i_notification_review_id_fkey" ON notification (review_id);

CREATE INDEX IF NOT EXISTS "i_notification_user_id_fkey" ON notification (user_id);

CREATE INDEX IF NOT EXISTS "i_permission_join_permission_name_id_fkey" ON permission_join (permission_name_id);

CREATE INDEX IF NOT EXISTS "i_permission_name_permission_policy_id_fkey" ON permission_name (permission_policy_id);

CREATE INDEX IF NOT EXISTS "i_review_application_id_fkey" ON review (application_id);

CREATE INDEX IF NOT EXISTS "i_review_review_assignment_id_fkey" ON review (review_assignment_id);

CREATE INDEX IF NOT EXISTS "i_review_reviewer_id_fkey" ON review (reviewer_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_application_id_fkey" ON review_assignment (application_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_assigner_id_fkey" ON review_assignment (assigner_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_level_id_fkey" ON review_assignment (level_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_organisation_id_fkey" ON review_assignment (organisation_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_stage_id_fkey" ON review_assignment (stage_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_template_id_fkey" ON review_assignment (template_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_assigner_join_organisation_id_fkey" ON review_assignment_assigner_join (organisation_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_assigner_join_review_assignment_id_fkey" ON review_assignment_assigner_join (review_assignment_id);

CREATE INDEX IF NOT EXISTS "i_review_decision_review_id_fkey" ON review_decision (review_id);

CREATE INDEX IF NOT EXISTS "i_review_response_application_response_id_fkey" ON review_response (application_response_id);

CREATE INDEX IF NOT EXISTS "i_review_response_original_review_response_id_fkey" ON review_response (original_review_response_id);

CREATE INDEX IF NOT EXISTS "i_review_response_review_id_fkey" ON review_response (review_id);

CREATE INDEX IF NOT EXISTS "i_review_response_review_response_link_id_fkey" ON review_response (review_response_link_id);

CREATE INDEX IF NOT EXISTS "i_review_response_template_element_id_fkey" ON review_response (template_element_id);

CREATE INDEX IF NOT EXISTS "i_review_status_history_review_id_fkey" ON review_status_history (review_id);

CREATE INDEX IF NOT EXISTS "i_review_status_history_status" ON review_status_history (status);

CREATE INDEX IF NOT EXISTS "i_template_template_category_id_fkey" ON TEMPLATE (template_category_id);

CREATE INDEX IF NOT EXISTS "i_template_action_template_id_fkey" ON template_action (template_id);

CREATE INDEX IF NOT EXISTS "i_template_element_section_id_fkey" ON template_element (section_id);

CREATE INDEX IF NOT EXISTS "i_template_filter_join_filter_id_fkey" ON template_filter_join (filter_id);

CREATE INDEX IF NOT EXISTS "i_template_filter_join_template_id_fkey" ON template_filter_join (template_id);

CREATE INDEX IF NOT EXISTS "i_template_permission_permission_name_id_fkey" ON template_permission (permission_name_id);

CREATE INDEX IF NOT EXISTS "i_template_permission_template_id_fkey" ON template_permission (template_id);

CREATE INDEX IF NOT EXISTS "i_template_stage_template_id_fkey" ON template_stage (template_id);

CREATE INDEX IF NOT EXISTS "i_template_stage_review_level_stage_id_fkey" ON template_stage_review_level (stage_id);

CREATE INDEX IF NOT EXISTS "i_trigger_schedule_editor_user_id_fkey" ON trigger_schedule (editor_user_id);

CREATE INDEX IF NOT EXISTS "i_trigger_schedule_template_id_fkey" ON trigger_schedule (template_id);

CREATE INDEX IF NOT EXISTS "i_user_organisation_organisation_id_fkey" ON user_organisation (organisation_id);

CREATE INDEX IF NOT EXISTS "i_verification_application_id_fkey" ON verification (application_id);

CREATE INDEX IF NOT EXISTS "i_permission_join_organisation_id_fkey" ON permission_join (organisation_id);

CREATE INDEX IF NOT EXISTS "i_permission_join_user_id_fkey" ON permission_join (user_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_reviewer_id_fkey" ON review_assignment (reviewer_id);

CREATE INDEX IF NOT EXISTS "i_review_assignment_assigner_join_assigner_id_fkey" ON review_assignment_assigner_join (assigner_id);

-- Additional indexes to help Application List performace:
CREATE INDEX IF NOT EXISTS "i_application_outcome" ON application (outcome);

CREATE INDEX IF NOT EXISTS "i_application_is_active" ON application (is_active);

CREATE INDEX IF NOT EXISTS "i_application_is_config" ON application (is_config);

CREATE INDEX IF NOT EXISTS "i_template_status" ON TEMPLATE (status);

CREATE INDEX IF NOT EXISTS "i_template_code" ON TEMPLATE (code);

CREATE INDEX IF NOT EXISTS "i_application_status_history_status" ON application_status_history (status);

CREATE INDEX IF NOT EXISTS "i_application_status_history_is_current" ON application_status_history (is_current);

CREATE INDEX IF NOT EXISTS "i_application_response_status" ON application_response (status);

CREATE INDEX IF NOT EXISTS "i_application_stage_history_is_current" ON application_stage_history (is_current);

CREATE INDEX IF NOT EXISTS "i_template_section_code" ON template_section (code);

CREATE INDEX IF NOT EXISTS "i_template_element_code" ON template_element (code);

CREATE INDEX IF NOT EXISTS "i_template_element_category" ON template_element (category);

CREATE INDEX IF NOT EXISTS "i_template_element_reviewability" ON template_element (reviewability);

CREATE INDEX IF NOT EXISTS "i_template_element_template_code" ON template_element (template_code);

CREATE INDEX IF NOT EXISTS "i_review_assignment_status" ON review_assignment (status);

CREATE INDEX IF NOT EXISTS "i_review_assignment_assigned_sections" ON review_assignment (assigned_sections);

CREATE INDEX IF NOT EXISTS "i_review_assignment_level_number" ON review_assignment (level_number);

CREATE INDEX IF NOT EXISTS "i_review_response_status" ON review_response (status);

-- Null value for application response:
CREATE INDEX IF NOT EXISTS "i_application_response_value_is_null" ON application_response ((value IS NULL));

CREATE INDEX IF NOT EXISTS "i_application_response_value_is_not_null" ON application_response ((value IS NOT NULL));

-- Additional indexes for application_reviewer_action
CREATE INDEX IF NOT EXISTS "i_application_reviewer_action_user_id" ON application_reviewer_action (user_id);

CREATE INDEX IF NOT EXISTS "i_application_reviewer_action_application_id" ON application_reviewer_action (application_id);