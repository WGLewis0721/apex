-- Preserve workspace history when an auth identity is deleted.
-- Membership remains the authorization boundary; created_by is historical provenance only.
alter table public.workspaces alter column created_by drop not null;
