/**
 * Accepts the project URL or a PostgREST URL mistakenly ending in `/rest/v1`.
 * Supabase's SDK appends `/auth/v1` and `/rest/v1` itself, so it needs the
 * project base URL rather than an API endpoint.
 */
export function normalizeSupabaseUrl(configuredUrl: string): string {
  const url = new URL(configuredUrl.trim());
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const suffixIndex = pathSegments.length - 2;

  if (
    suffixIndex >= 0 &&
    pathSegments[suffixIndex].toLowerCase() === 'rest' &&
    pathSegments[suffixIndex + 1].toLowerCase() === 'v1'
  ) {
    pathSegments.splice(suffixIndex, 2);
  }

  url.pathname = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
  const normalizedUrl = url.toString();
  return normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;
}