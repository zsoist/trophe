-- Test fixture loaded only by the loopback-validated disposable CI runner.
-- This is intentionally absent from db/release: production rollback disables
-- release gates, preserves records, and uses the authorized backup restore.
BEGIN;
DROP POLICY coach_chat_namespace_guard ON public.agent_conversation;
DROP TRIGGER coach_chat_content_immutable ON public.agent_conversation;
DROP TRIGGER coach_chat_membership_revocation ON public.organization_members;
DROP TRIGGER coach_chat_profile_revocation ON public.profiles;
DROP TRIGGER coach_chat_assignment_revocation ON public.client_profiles;
DROP TRIGGER coach_chat_attachment_guard ON private.coach_attachment_uploads;
DROP TRIGGER coach_chat_proposal_guard ON private.coach_action_proposals;
DROP TRIGGER coach_chat_thread_immutable ON private.coach_chat_threads;
DROP TRIGGER coach_chat_turn_immutable ON private.coach_chat_turns;
DROP FUNCTION private.coach_chat_contract_version();
DROP FUNCTION private.coach_chat_resource_guard();
DROP FUNCTION private.coach_chat_content_immutable();
DROP FUNCTION private.coach_chat_turn_immutable();
DROP FUNCTION private.coach_chat_thread_immutable();
DROP FUNCTION private.coach_chat_revoke_scope();
DROP FUNCTION private.coach_chat_content_visible(uuid, uuid, text, text);
DROP TABLE private.coach_chat_turns;
DROP TABLE private.coach_chat_threads;

DROP TRIGGER coach_photo_food_profile_invalidate ON public.profiles;
DROP TRIGGER coach_photo_food_client_invalidate ON public.client_profiles;
DROP TRIGGER coach_photo_food_membership_invalidate ON public.organization_members;
DROP TABLE private.coach_photo_food_observations;
DROP FUNCTION private.coach_photo_food_observation_guard();
DROP FUNCTION private.coach_photo_food_no_truncate();
DROP FUNCTION private.coach_photo_food_auth_invalidate();
DROP TABLE private.coach_attachment_uploads;

DROP TRIGGER coach_food_entry_revision ON public.food_log;
DROP FUNCTION private.advance_coach_food_entry_version();
DROP TABLE private.coach_food_entry_versions;
DROP TRIGGER coach_preference_revision ON public.client_profiles;
DROP FUNCTION private.advance_coach_preference_version();
DROP TABLE private.coach_action_receipts;
DROP TABLE private.coach_action_proposals;
DROP TABLE private.coach_preference_versions;
COMMIT;
