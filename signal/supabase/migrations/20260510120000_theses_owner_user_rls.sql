-- Allow authenticated users to create/update their own thesis rows (for Insider Flow + sync).
-- System theses remain owner-less and are not updatable via these policies.

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_theses_owner_user_id ON public.theses (owner_user_id) WHERE owner_user_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can insert own theses" ON public.theses;
CREATE POLICY "Users can insert own theses"
  ON public.theses
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own theses" ON public.theses;
CREATE POLICY "Users can update own theses"
  ON public.theses
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
