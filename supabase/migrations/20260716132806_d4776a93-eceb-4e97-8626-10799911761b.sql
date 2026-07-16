create table public.meteo_station_climate_cache (
  station_id       text not null,
  years_requested  int  not null,
  start_year       int  not null,
  end_year         int  not null,
  station_lat      double precision,
  station_lon      double precision,
  data             jsonb not null,
  computed_at      timestamptz not null default now(),
  primary key (station_id, years_requested, end_year)
);
create index on public.meteo_station_climate_cache (station_lat, station_lon);

grant select on public.meteo_station_climate_cache to authenticated, anon;
grant all    on public.meteo_station_climate_cache to service_role;

alter table public.meteo_station_climate_cache enable row level security;
create policy "climate cache readable by anyone"
  on public.meteo_station_climate_cache for select using (true);