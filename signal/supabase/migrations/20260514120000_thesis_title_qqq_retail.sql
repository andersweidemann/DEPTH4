-- QQQ / AI thesis: retail title with explicit action (don't add vs vague "avoid adds").

UPDATE public.theses
SET
  title = 'Don''t buy more QQQ yet because AI spending will hit margins this earnings season',
  updated_at = now()
WHERE slug = 'ai-capex-squeeze-qqq-rotation';
