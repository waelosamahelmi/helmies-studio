// Helmies Studio — outbound URL guard (SSRF)
//
// Single source of truth for "which remote hosts may this server fetch from?".
// Used by /api/media/proxy and by lib/video-assembly.
//
// ── Why this is not a pure hostname allowlist ─────────────────────────────
// Provider *outputs* do not live on the provider's API host. KIE returns
// `resultUrls` on its own CDN, Alibaba MaaS runs on
// `<workspace>.<region>.maas.aliyuncs.com` and writes results to OSS buckets,
// and `generation-handler` stores `/api/media/proxy?url=<provider url>` as the
// asset URL whenever the local download fails. A two-host allowlist would 403
// media already referenced by rows in the database — every affected gallery
// would break.
//
// The real vulnerability is reaching the *internal* network: cloud metadata at
// 169.254.169.254, services on localhost, and the private LAN. So the guard is:
//
//   1. Known provider domains pass immediately.
//   2. Any other host must be http(s) AND must resolve exclusively to public
//      unicast addresses. Loopback, private, link-local, CGNAT, multicast and
//      reserved ranges are refused — including literal-IP URLs.
//
// Callers must re-validate on every redirect hop: a permitted host can still
// 302 to an internal address.

import { lookup } from "dns/promises";
import net from "net";

export const PROVIDER_DOMAINS = [
  "kie.ai",
  "aiquickdraw.com",   // KIE result CDN
  "aliyuncs.com",      // dashscope, maas, and OSS result buckets
  "alicdn.com",
];

/** Hosts belonging to this deployment. */
export function selfHosts() {
  const hosts = new Set();
  for (const raw of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_URL, process.env.APP_URL]) {
    if (!raw) continue;
    try { hosts.add(new URL(raw).hostname.toLowerCase()); } catch { /* ignore */ }
  }
  return [...hosts];
}

function matches(host, domains) {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function isKnownProvider(hostname) {
  return !!hostname && matches(hostname.toLowerCase(), PROVIDER_DOMAINS);
}

/* ── Address classification ────────────────────────────────────────────── */

function ipv4IsPublic(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;

  if (a === 0) return false;                            // "this" network
  if (a === 10) return false;                           // private
  if (a === 127) return false;                          // loopback
  if (a === 169 && b === 254) return false;             // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return false;    // private
  if (a === 192 && b === 168) return false;             // private
  if (a === 192 && b === 0) return false;               // protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return false;   // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false;                           // multicast + reserved
  return true;
}

function ipv6IsPublic(ip) {
  const v = ip.toLowerCase().split("%")[0];
  if (v === "::" || v === "::1") return false;

  // IPv4-mapped / -compatible — judge by the embedded v4 address
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPublic(mapped[1]);
  if (/^::\d+\.\d+\.\d+\.\d+$/.test(v)) return ipv4IsPublic(v.slice(2));

  if (/^fe[89ab]/.test(v)) return false;      // link-local
  if (/^f[cd]/.test(v)) return false;         // unique-local
  if (v.startsWith("ff")) return false;       // multicast
  if (v.startsWith("64:ff9b")) return false;  // NAT64
  if (v.startsWith("2002:")) return false;    // 6to4
  return true;
}

export function ipIsPublic(ip) {
  const family = net.isIP(ip);
  if (family === 4) return ipv4IsPublic(ip);
  if (family === 6) return ipv6IsPublic(ip);
  return false;
}

/**
 * Resolve a hostname and confirm every address it maps to is public.
 * A host resolving to even one internal address is refused, so an attacker
 * cannot hide 127.0.0.1 behind a multi-record domain.
 */
export async function hostResolvesPublic(hostname) {
  if (net.isIP(hostname)) return ipIsPublic(hostname);
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every((r) => ipIsPublic(r.address));
  } catch {
    return false;
  }
}

/**
 * Validate an outbound URL.
 * @returns {Promise<{ok:true, parsed:URL} | {ok:false, error:string, status:number}>}
 */
export async function validateOutboundUrl(url, { allowSelf = false } = {}) {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Missing url", status: 400 };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL", status: 400 };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https are supported", status: 400 };
  }

  const host = parsed.hostname.toLowerCase();

  if (isKnownProvider(host)) return { ok: true, parsed };
  if (allowSelf && matches(host, selfHosts())) return { ok: true, parsed };

  if (!(await hostResolvesPublic(host))) {
    return { ok: false, error: "Host not allowed", status: 403 };
  }

  return { ok: true, parsed };
}

/** Synchronous check — no DNS. Known providers and self only. */
export function isAllowedHost(hostname, { allowSelf = false } = {}) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  if (isKnownProvider(host)) return true;
  if (allowSelf && matches(host, selfHosts())) return true;
  return false;
}

/** Async host check that matches `validateOutboundUrl` semantics. */
export async function isAllowedHostAsync(hostname, { allowSelf = false } = {}) {
  if (!hostname) return false;
  if (isAllowedHost(hostname, { allowSelf })) return true;
  return hostResolvesPublic(hostname.toLowerCase());
}
