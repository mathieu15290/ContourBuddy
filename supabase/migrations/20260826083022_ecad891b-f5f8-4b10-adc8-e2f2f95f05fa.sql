CREATE TABLE public.site_visits (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  session_id text not null,
  path text not null default '/',
  device text,
  browser text,
  os text,
  lang text,
  referrer_host text
);

CREATE INDEX site_visits_occurred_at_idx ON public.site_visits (occurred_at desc);
CREATE INDEX site_visits_session_idx ON public.site_visits (session_id);

GRANT INSERT ON public.site_visits TO anon, authenticated;
GRANT ALL ON public.site_visits TO service_role;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can record a visit"
  ON public.site_visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.site_visit_stats(_days integer default 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT * FROM public.site_visits
    WHERE occurred_at >= now() - (greatest(least(_days, 365), 1) || ' days')::interval
  )
  SELECT jsonb_build_object(
    'days', greatest(least(_days, 365), 1),
    'generated_at', now(),
    'totals', (SELECT jsonb_build_object(
        'visitors', count(distinct session_id),
        'pageviews', count(*)
      ) FROM scoped),
    'daily', coalesce((SELECT jsonb_agg(x ORDER BY x->>'date')
        FROM (
          SELECT jsonb_build_object(
            'date', to_char(d.day, 'YYYY-MM-DD'),
            'visitors', count(distinct s.session_id),
            'pageviews', count(s.id)
          ) AS x
          FROM generate_series(
            (now() - (greatest(least(_days, 365), 1) || ' days')::interval)::date,
            now()::date,
            '1 day'
          ) AS d(day)
          LEFT JOIN scoped s ON s.occurred_at::date = d.day
          GROUP BY d.day
        ) q), '[]'::jsonb),
    'devices', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(device,'Inconnu'), 'visitors', v) ORDER BY v DESC)
        FROM (SELECT device, count(distinct session_id) v FROM scoped GROUP BY device) q), '[]'::jsonb),
    'browsers', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(browser,'Inconnu'), 'visitors', v) ORDER BY v DESC)
        FROM (SELECT browser, count(distinct session_id) v FROM scoped GROUP BY browser) q), '[]'::jsonb),
    'systems', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(os,'Inconnu'), 'visitors', v) ORDER BY v DESC)
        FROM (SELECT os, count(distinct session_id) v FROM scoped GROUP BY os) q), '[]'::jsonb),
    'languages', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(lang,'Inconnu'), 'visitors', v) ORDER BY v DESC)
        FROM (SELECT lang, count(distinct session_id) v FROM scoped GROUP BY lang) q), '[]'::jsonb),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object('name', coalesce(nullif(referrer_host,''),'Direct'), 'visitors', v) ORDER BY v DESC)
        FROM (SELECT referrer_host, count(distinct session_id) v FROM scoped GROUP BY referrer_host) q), '[]'::jsonb),
    'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('path', path, 'pageviews', v) ORDER BY v DESC)
        FROM (SELECT path, count(*) v FROM scoped GROUP BY path) q), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.site_visit_stats(integer) TO anon, authenticated, service_role;