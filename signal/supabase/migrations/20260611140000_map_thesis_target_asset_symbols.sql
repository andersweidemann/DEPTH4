-- Backfill missing target_asset on map-visible theses (symbol shows as "—" on /map).

update public.theses
set body = jsonb_set(coalesce(body, '{}'::jsonb), '{target_asset}', '"USO"'::jsonb)
where (body->>'target_asset' is null or body->>'target_asset' in ('', '—'))
  and (
    slug ilike '%oil%'
    or slug ilike '%crude%'
    or slug ilike '%iran%escalat%'
    or title ilike '%oil%'
    or title ilike '%crude%'
    or micro_label ilike '%oil%'
  );

update public.theses
set body = jsonb_set(coalesce(body, '{}'::jsonb), '{target_asset}', '"DAX"'::jsonb)
where (body->>'target_asset' is null or body->>'target_asset' in ('', '—'))
  and (
    slug ilike '%dax%'
    or title ilike '%dax%'
    or micro_label ilike '%dax%'
  );

update public.theses
set body = jsonb_set(coalesce(body, '{}'::jsonb), '{target_asset}', '"XAUUSD"'::jsonb)
where (body->>'target_asset' is null or body->>'target_asset' in ('', '—'))
  and (
    slug ilike '%gold%'
    or title ilike '%gold%'
    or micro_label ilike '%gold%'
    or slug ilike '%xau%'
  );
