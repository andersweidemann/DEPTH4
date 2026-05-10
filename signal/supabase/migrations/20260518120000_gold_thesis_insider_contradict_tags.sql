-- Broaden tag-based thesis–news matching for the GLD / peace-drift catalog thesis:
-- naval / Asia maritime friction should register as contradicting the "peace progress" short-GLD story.

UPDATE public.theses
SET
  insider_flow = jsonb_set(
    COALESCE(insider_flow, '{}'::jsonb),
    '{contradictTags}',
    '[
      "military exercises",
      "naval",
      "blockade",
      "incursion",
      "south china sea",
      "scarborough",
      "spratly",
      "paracel",
      "taiwan strait",
      "second front",
      "kinetic",
      "coast guard"
    ]'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'th-gold';
