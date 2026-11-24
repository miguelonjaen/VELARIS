begin;

create schema if not exists gaulos_weather;

revoke all on schema gaulos_weather
from public, anon, authenticated;

grant usage on schema gaulos_weather to service_role;

create table gaulos_weather.cache (
    cache_key text primary key,
    payload jsonb not null,
    fetched_at timestamptz not null default now(),
    expires_at timestamptz not null,
    check (length(cache_key) <= 100),
    check (expires_at > fetched_at)
);

create index weather_cache_expiry_idx
on gaulos_weather.cache(expires_at);

create table gaulos_weather.rate_limits (
    scope text not null,
    window_start timestamptz not null,
    requests integer not null default 0,
    primary key (scope, window_start),
    check (requests >= 0)
);

create index weather_rate_limits_expiry_idx
on gaulos_weather.rate_limits(window_start);

alter table gaulos_weather.cache enable row level security;
alter table gaulos_weather.rate_limits enable row level security;

revoke all on all tables in schema gaulos_weather
from public, anon, authenticated;

grant select, insert, update, delete
on all tables in schema gaulos_weather
to service_role;

create function public.weather_proxy_reserve(
    p_user uuid,
    p_cache_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_now timestamptz := now();
    v_minute timestamptz := date_trunc('minute', v_now);
    v_day timestamptz := date_trunc('day', v_now, 'UTC');
    v_count integer;
    v_payload jsonb;
begin
    if p_user is null
       or p_cache_key is null
       or length(p_cache_key) > 100 then
        raise exception 'Invalid weather request';
    end if;

    insert into gaulos_weather.rate_limits as r
        (scope, window_start, requests)
    values
        ('user:' || p_user::text, v_minute, 1)
    on conflict (scope, window_start)
    do update set requests = r.requests + 1
    where r.requests < 30
    returning requests into v_count;

    if not found then
        return jsonb_build_object('status', 'user_limit');
    end if;

    select payload into v_payload
    from gaulos_weather.cache
    where cache_key = p_cache_key
      and expires_at > v_now;

    if found then
        return jsonb_build_object(
            'status', 'cached',
            'payload', v_payload
        );
    end if;

    perform pg_advisory_xact_lock(741205, 1);

    if coalesce((
        select requests
        from gaulos_weather.rate_limits
        where scope = 'global:day'
          and window_start = v_day
    ), 0) >= 800 then
        return jsonb_build_object('status', 'daily_limit');
    end if;

    if coalesce((
        select requests
        from gaulos_weather.rate_limits
        where scope = 'global:minute'
          and window_start = v_minute
    ), 0) >= 40 then
        return jsonb_build_object('status', 'minute_limit');
    end if;

    insert into gaulos_weather.rate_limits as r
        (scope, window_start, requests)
    values
        ('global:minute', v_minute, 1),
        ('global:day', v_day, 1)
    on conflict (scope, window_start)
    do update set requests = r.requests + 1;

    return jsonb_build_object('status', 'reserved');
end;
$$;

create function public.weather_proxy_store(
    p_cache_key text,
    p_payload jsonb,
    p_ttl_seconds integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if p_cache_key is null
       or length(p_cache_key) > 100
       or p_payload is null
       or jsonb_typeof(p_payload) <> 'object'
       or pg_column_size(p_payload) > 524288
       or p_ttl_seconds is null
       or p_ttl_seconds not between 60 and 1800 then
        raise exception 'Invalid weather cache entry';
    end if;

    insert into gaulos_weather.cache (
        cache_key,
        payload,
        fetched_at,
        expires_at
    )
    values (
        p_cache_key,
        p_payload,
        now(),
        now() + make_interval(secs => p_ttl_seconds)
    )
    on conflict (cache_key)
    do update set
        payload = excluded.payload,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at;
end;
$$;

create function public.weather_proxy_cleanup()
returns void
language sql
security invoker
set search_path = ''
as $$
    delete from gaulos_weather.cache
    where expires_at < now() - interval '1 hour';

    delete from gaulos_weather.rate_limits
    where window_start < now() - interval '2 days';
$$;

revoke all on function public.weather_proxy_reserve(uuid, text)
from public, anon, authenticated;

revoke all on function public.weather_proxy_store(text, jsonb, integer)
from public, anon, authenticated;

revoke all on function public.weather_proxy_cleanup()
from public, anon, authenticated;

grant execute on function public.weather_proxy_reserve(uuid, text)
to service_role;

grant execute on function public.weather_proxy_store(text, jsonb, integer)
to service_role;

grant execute on function public.weather_proxy_cleanup()
to service_role;

commit;