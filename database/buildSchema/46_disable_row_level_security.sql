-- Enable Row-level security for these tables:

-- These ones will be Admin-only access
-- ALTER TABLE public.action_plugin ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.counter ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.data_changelog ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.data_table ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.data_view ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.data_view_column_definition ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.element_type_plugin ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.file ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.permission_join ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.permission_name ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.permission_policy ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.system_info ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.template_action ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.template_permission ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.trigger_queue ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.trigger_schedule ENABLE ROW LEVEL SECURITY;

-- These ones have additional policies applied
ALTER TABLE public.application ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;



-- DEV -- uncomment and run to quickly disable
ALTER TABLE public.action_plugin DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_changelog DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_table DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_view DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_view_column_definition DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.element_type_plugin DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.file DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_join DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_name DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_policy DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_action DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_permission DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trigger_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trigger_schedule DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.application DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.review DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_assignment DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."user" DISABLE ROW LEVEL SECURITY;
