

export type WeatherProxyType = 'weather' | 'forecast';

export class WeatherProxyError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string
    ) {
        super(code);
        this.name = 'WeatherProxyError';
    }
}

export async function fetchWeatherProxy<T>(
    type: WeatherProxyType,
    lat: number,
    lon: number,
    signal?: AbortSignal
): Promise<T> {
    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
    ) {
        throw new WeatherProxyError(400, 'INVALID_COORDINATES');
    }

    signal?.throwIfAborted();

    const { supabase } = await import('../supabaseClient');

    signal?.throwIfAborted();

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
        throw new WeatherProxyError(401, 'SESSION_REQUIRED');
    }

    const baseUrl = import.meta.env.VITE_SUPABASE_URL
        ?.trim()
        .replace(/\/+$/, '')
        .replace(/\/rest\/v1$/i, '');

    const publishableKey =
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

    if (!baseUrl || !publishableKey) {
        throw new WeatherProxyError(503, 'PROXY_NOT_CONFIGURED');
    }

    const timeout = AbortSignal.timeout(20000);

    const requestSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;

    const response = await fetch(
        `${baseUrl}/functions/v1/weather-proxy`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: publishableKey,
                Authorization: `Bearer ${data.session.access_token}`,
            },
            body: JSON.stringify({ type, lat, lon }),
            signal: requestSignal,
            cache: 'no-store',
            redirect: 'error',
        }
    );

    if (!response.ok) {
        let code = `WEATHER_HTTP_${response.status}`;

        try {
            const body = await response.json();

            if (
                typeof body?.error === 'string' &&
                /^[A-Z0-9_]{1,80}$/.test(body.error)
            ) {
                code = body.error;
            }
        } catch {
            // Preserve HTTP status.
        }

        throw new WeatherProxyError(response.status, code);
    }

    return await response.json() as T;
}