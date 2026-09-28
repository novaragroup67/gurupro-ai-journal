/**
 * GuruPro AI Foundation — Zero-Dependency Universal IP Validation Utilities
 *
 * Provides IPv4/IPv6 detection without importing Node.js "node:net".
 * Safe for browser client bundles, Node.js server runtimes, and Edge workers.
 */

export function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    if (n < 0 || n > 255) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
  }
  return true;
}

export function isIPv6(ip: string): boolean {
  if (!ip.includes(":")) return false;
  // Handle IPv4-mapped IPv6 like ::ffff:192.168.1.1
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const v4Part = ip.slice(lastColon + 1);
    const v6Prefix = ip.slice(0, lastColon);
    if (!isIPv4(v4Part)) return false;
    return isIPv6(v6Prefix + ":0");
  }
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  const parts = ip.split(":");
  if (doubleColonCount === 1) {
    if (parts.length > 8) return false;
    for (const part of parts) {
      if (part === "") continue;
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
    }
    return true;
  } else {
    if (parts.length !== 8) return false;
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
    }
    return true;
  }
}

export function isIP(ip: string): number {
  if (isIPv4(ip)) return 4;
  if (isIPv6(ip)) return 6;
  return 0;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  let cleanIp = ip.toLowerCase().trim();
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0.0.0.0") return true;
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.slice(7);
  }
  if (isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata (AWS/GCP/Azure)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true; // Benchmark & TEST-NET-2
    if (a === 203 && b === 0) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast & Reserved
    return false;
  }
  if (isIPv6(cleanIp)) {
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // ULA fc00::/7
    if (/^fe[89ab]/i.test(cleanIp)) return true; // Link-local fe80::/10
    if (cleanIp.startsWith("ff")) return true; // Multicast
    if (cleanIp.startsWith("2001:db8:")) return true; // Documentation
    if (cleanIp.startsWith("64:ff9b:")) return true; // NAT64
    return false;
  }
  return true;
}
