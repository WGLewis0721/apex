-- Phase 7.1.2: resolve_stripe_price_credits reads only the existing
-- workspace-owned mapping table. Inactive and foreign-workspace rows grant nothing.
-- Run against a throwaway database; uses fake identifiers only.

begin;

select public.resolve_stripe_price_credits(
  '00000000-0000-4000-8000-000000000001'::uuid,
  'price_test_example'
) is null as missing_mapping_grants_nothing;

rollback;
