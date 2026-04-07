"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUrl = validateUrl;
var node_url_1 = require("node:url");
var node_net_1 = require("node:net");
var BLOCKED_IPV4_RANGES = [
    /^127\./, // loopback
    /^0\./, // current network
    /^10\./, // private class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // private class B
    /^192\.168\./, // private class C
    /^169\.254\./, // link-local / cloud metadata
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT
];
var BLOCKED_IPV6_PATTERNS = [
    /^::1$/, // loopback
    /^fc00:/i, // unique local
    /^fd/i, // unique local
    /^fe80:/i, // link-local
];
var BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata',
]);
var BLOCKED_HOSTNAME_SUFFIXES = [
    '.local',
    '.internal',
    '.localhost',
];
var ALLOWED_SCHEMES = new Set(['http:', 'https:']);
function validateUrl(rawUrl) {
    var parsed;
    try {
        parsed = new node_url_1.URL(rawUrl);
    }
    catch (_a) {
        throw new Error("URL inv\u00E1lida: \"".concat(rawUrl, "\""));
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        throw new Error("Esquema n\u00E3o permitido: \"".concat(parsed.protocol, "\" \u2014 apenas http: e https: s\u00E3o permitidos"));
    }
    var hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) {
        throw new Error("Acesso bloqueado: \"".concat(hostname, "\" \u00E9 um host interno"));
    }
    for (var _i = 0, BLOCKED_HOSTNAME_SUFFIXES_1 = BLOCKED_HOSTNAME_SUFFIXES; _i < BLOCKED_HOSTNAME_SUFFIXES_1.length; _i++) {
        var suffix = BLOCKED_HOSTNAME_SUFFIXES_1[_i];
        if (hostname.endsWith(suffix)) {
            throw new Error("Acesso bloqueado: \"".concat(hostname, "\" \u00E9 um host interno"));
        }
    }
    if ((0, node_net_1.isIP)(hostname)) {
        if (isBlockedIP(hostname)) {
            throw new Error("Acesso bloqueado: \"".concat(hostname, "\" \u00E9 um endere\u00E7o IP interno/privado"));
        }
    }
    var bracketMatch = hostname.match(/^\[(.+)]$/);
    if (bracketMatch) {
        if (isBlockedIP(bracketMatch[1])) {
            throw new Error("Acesso bloqueado: \"".concat(hostname, "\" \u00E9 um endere\u00E7o IP interno/privado"));
        }
    }
    return parsed;
}
function isBlockedIP(ip) {
    for (var _i = 0, BLOCKED_IPV4_RANGES_1 = BLOCKED_IPV4_RANGES; _i < BLOCKED_IPV4_RANGES_1.length; _i++) {
        var pattern = BLOCKED_IPV4_RANGES_1[_i];
        if (pattern.test(ip))
            return true;
    }
    for (var _a = 0, BLOCKED_IPV6_PATTERNS_1 = BLOCKED_IPV6_PATTERNS; _a < BLOCKED_IPV6_PATTERNS_1.length; _a++) {
        var pattern = BLOCKED_IPV6_PATTERNS_1[_a];
        if (pattern.test(ip))
            return true;
    }
    if (ip === '0.0.0.0' || ip === '::')
        return true;
    return false;
}
