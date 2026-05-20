-- Allow users to prune their own bell notification rows (mark-all-read cleanup).

DROP POLICY IF EXISTS "depth4_notifications owner delete" ON public.depth4_notifications;
CREATE POLICY "depth4_notifications owner delete"
  ON public.depth4_notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
