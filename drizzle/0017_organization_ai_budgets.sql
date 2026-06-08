CREATE TABLE IF NOT EXISTS public.organization_ai_budgets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_limit_usd numeric(12,4) NOT NULL DEFAULT 5 CHECK (daily_limit_usd > 0),
  monthly_limit_usd numeric(12,4) NOT NULL DEFAULT 100 CHECK (monthly_limit_usd > 0),
  alert_threshold_pct numeric(5,2) NOT NULL DEFAULT 80 CHECK (alert_threshold_pct > 0 AND alert_threshold_pct <= 100),
  kill_switch_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_ai_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_ai_budgets_admin_select
  ON public.organization_ai_budgets FOR SELECT TO authenticated
  USING (private.is_admin_of(organization_id) OR private.is_super_admin());

CREATE POLICY organization_ai_budgets_admin_update
  ON public.organization_ai_budgets FOR UPDATE TO authenticated
  USING (private.is_admin_of(organization_id) OR private.is_super_admin())
  WITH CHECK (private.is_admin_of(organization_id) OR private.is_super_admin());

INSERT INTO public.organization_ai_budgets (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

REVOKE ALL ON public.organization_ai_budgets FROM anon;
GRANT SELECT, UPDATE ON public.organization_ai_budgets TO authenticated;
GRANT ALL ON public.organization_ai_budgets TO service_role;
