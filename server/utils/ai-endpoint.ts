/**
 * Where an AI request is allowed to go.
 *
 * The endpoint is admin-supplied and the server POSTs an API key to it, so an
 * unchecked value is worse than ordinary request forgery: a tenant admin could
 * point it at their own host and collect the platform's key. Only the official
 * provider hosts are accepted.
 */
const OFFICIAL: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const ALLOWED_HOSTS = [/(^|\.)openai\.com$/i, /(^|\.)anthropic\.com$/i];

export function officialEndpoint(provider?: string): string {
  return OFFICIAL[String(provider || "").toLowerCase()] || OFFICIAL.openai;
}

/** True when this endpoint may be called with an API key attached. */
export function isAllowedAiEndpoint(endpoint?: string | null): boolean {
  if (!endpoint) return true; // absent means "use the official one"
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOSTS.some((re) => re.test(host));
}

/**
 * The endpoint to actually call. An address that is not allowed is replaced by
 * the provider's own — a row saved before this check existed must not be able
 * to leak a key either.
 */
export function safeAiEndpoint(provider?: string, endpoint?: string | null): string {
  if (endpoint && isAllowedAiEndpoint(endpoint)) return endpoint;
  if (endpoint) {
    console.warn(`[AI] Ignoring disallowed endpoint: ${endpoint}`);
  }
  return officialEndpoint(provider);
}
