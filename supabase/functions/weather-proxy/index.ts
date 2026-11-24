
import { createClient } from "npm:@supabase/supabase-js@2.106.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const weatherKey = Deno.env.get("OPENWEATHER_API_KEY");

    if (!url || !serviceKey || !weatherKey) {
      return reply({ error: "PROVIDER_NOT_CONFIGURED" }, 503);
    }

    const authorization = req.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      return reply({ error: "UNAUTHORIZED" }, 401);
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: authData, error: authError } =
      await admin.auth.getUser(token);

    const user = authData?.user;

    if (authError || !user || user.is_anonymous) {
      return reply({ error: "UNAUTHORIZED" }, 401);
    }

    const raw = await req.text();

    if (new TextEncoder().encode(raw).length > 2048) {
      return reply({ error: "REQUEST_TOO_LARGE" }, 413);
    }

    let body;

    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "INVALID_JSON" }, 400);
    }

    if (!body || typeof body !== "object") {
      return reply({ error: "INVALID_REQUEST" }, 400);
    }

    const { type, lat, lon } = body;

    if (
      (type !== "weather" && type !== "forecast") ||
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return reply({ error: "INVALID_PARAMETERS" }, 400);
    }

    const latitude = lat.toFixed(2);
    const longitude = lon.toFixed(2);

    const cacheKey =
      `openweather:v1:${type}:${latitude}:${longitude}`;

    const { data: reservation, error: reserveError } =
      await admin.rpc("weather_proxy_reserve", {
        p_user: user.id,
        p_cache_key: cacheKey,
      });

    if (reserveError || !reservation) {
      console.error("WEATHER_RESERVATION_FAILED");
      return reply({ error: "WEATHER_SERVICE_UNAVAILABLE" }, 503);
    }

    if (reservation.status === "cached") {
      return reply(reservation.payload);
    }

    if (
      ["user_limit", "daily_limit", "minute_limit"]
        .includes(reservation.status)
    ) {
      return reply({
        error: "WEATHER_RATE_LIMIT",
        reason: reservation.status,
      }, 429);
    }

    if (reservation.status !== "reserved") {
      return reply({ error: "WEATHER_SERVICE_UNAVAILABLE" }, 503);
    }

    const endpoint = new URL(
      `https://api.openweathermap.org/data/2.5/${type}`,
    );

    endpoint.searchParams.set("lat", latitude);
    endpoint.searchParams.set("lon", longitude);
    endpoint.searchParams.set("appid", weatherKey);
    endpoint.searchParams.set("units", "metric");
    endpoint.searchParams.set("lang", "es");

    let upstream: Response;

    try {
      upstream = await fetch(endpoint, {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      return reply({ error: "WEATHER_PROVIDER_TIMEOUT" }, 504);
    }

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return reply({ error: "WEATHER_PROVIDER_LIMIT" }, 429);
      }

      console.error("WEATHER_PROVIDER_ERROR", upstream.status);

      return reply({ error: "WEATHER_PROVIDER_UNAVAILABLE" }, 502);
    }

    const payload = await upstream.json();

    if (!payload || typeof payload !== "object" ||
        Array.isArray(payload)) {
      return reply({ error: "INVALID_PROVIDER_RESPONSE" }, 502);
    }

    if (
      (type === "weather" && !payload.main) ||
      (type === "forecast" && !Array.isArray(payload.list))
    ) {
      return reply({ error: "INVALID_PROVIDER_RESPONSE" }, 502);
    }

    const { error: storeError } =
      await admin.rpc("weather_proxy_store", {
        p_cache_key: cacheKey,
        p_payload: payload,
        p_ttl_seconds: type === "weather" ? 600 : 1800,
      });

    if (storeError) {
      console.error("WEATHER_CACHE_WRITE_FAILED");
    }

    return reply(payload);

  } catch {
    console.error("WEATHER_PROXY_INTERNAL_ERROR");
    return reply({ error: "INTERNAL_ERROR" }, 500);
  }
});