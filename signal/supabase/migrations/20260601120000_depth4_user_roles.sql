-- Phase 4E — DB-backed internal roles (admin / operator). Replaces env allowlists as source of truth.

CREATE TABLE IF NOT EXISTS public.depth4_user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_depth4_user_roles_role ON public.depth4_user_roles (role);

COMMENT ON TABLE public.depth4_user_roles IS
  'Internal DEPTH4 privileges. Multiple roles per user allowed. Service role writes; users may read own rows.';

CREATE TABLE IF NOT EXISTS public.depth4_user_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator')),
  action text NOT NULL CHECK (action IN ('granted', 'revoked', 'bootstrap_from_env')),
  actor_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_depth4_user_role_audit_user_created
  ON public.depth4_user_role_audit (user_id, created_at DESC);

ALTER TABLE public.depth4_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depth4_user_role_audit ENABLE ROW LEVEL SECURITY;

-- Users can read their own role assignments (for client UI gates).
CREATE POLICY depth4_user_roles_select_own ON public.depth4_user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No direct client writes; mutations via service role API only.
