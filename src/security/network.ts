import { URL } from 'node:url';
import { isIP } from 'node:net';

/**
 * Blocked IP ranges for SSRF protection.
 */
const BLOCKED_IPV4_RANGES = [
  /^127\./,                   // loopback
  /^0\./,                     // current network
  /^10\./,                    // private class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // private class B
  /^192\.168\./,              // private class C
  /^169\.254\./,              // link-local / cloud metadata
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,  // CGNAT
];

const BLOCKED_IPV6_PATTERNS = [
  /^::1$/,                    // loopback
  /^fc00:/i,                  // unique local
  /^fd/i,                     // unique local
  /^fe80:/i,                  // link-local
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
];

/**
 * Allowed URL schemes.
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validate a URL for safe external access.
 * Blocks internal networks, cloud metadata endpoints, and dangerous schemes.
 * Throws if the URL is not safe.
 */
export function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL inválida: "${rawUrl}"`);
  }

  // Check scheme
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Esquema não permitido: "${parsed.protocol}" — apenas http: e https: são permitidos`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Acesso bloqueado: "${hostname}" é um host interno`);
  }

  // Check blocked hostname suffixes
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um host interno`);
    }
  }

  // Check if hostname is an IP address
  if (isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um endereço IP interno/privado`);
    }
  }

  // Check for bracket-wrapped IPv6 in hostname
  const bracketMatch = hostname.match(/^\[(.+)]$/);
  if (bracketMatch) {
    if (isBlockedIP(bracketMatch[1])) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um endereço IP interno/privado`);
    }
  }

  return parsed;
}

/**
 * Check if an IP address falls in a blocked range.
 */
function isBlockedIP(ip: string): boolean {
  // IPv4
  for (const pattern of BLOCKED_IPV4_RANGES) {
    if (pattern.test(ip)) return true;
  }

  // IPv6
  for (const pattern of BLOCKED_IPV6_PATTERNS) {
    if (pattern.test(ip)) return true;
  }

  // 0.0.0.0
  if (ip === '0.0.0.0' || ip === '::') return true;

  return false;
}
