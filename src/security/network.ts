import { URL } from 'node:url';
import { isIP } from 'node:net';

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

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL inválida: "${rawUrl}"`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Esquema não permitido: "${parsed.protocol}" — apenas http: e https: são permitidos`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Acesso bloqueado: "${hostname}" é um host interno`);
  }

  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um host interno`);
    }
  }

  if (isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um endereço IP interno/privado`);
    }
  }

  const bracketMatch = hostname.match(/^\[(.+)]$/);
  if (bracketMatch) {
    if (isBlockedIP(bracketMatch[1])) {
      throw new Error(`Acesso bloqueado: "${hostname}" é um endereço IP interno/privado`);
    }
  }

  return parsed;
}

function isBlockedIP(ip: string): boolean {
  for (const pattern of BLOCKED_IPV4_RANGES) {
    if (pattern.test(ip)) return true;
  }

  for (const pattern of BLOCKED_IPV6_PATTERNS) {
    if (pattern.test(ip)) return true;
  }

  if (ip === '0.0.0.0' || ip === '::') return true;

  return false;
}
