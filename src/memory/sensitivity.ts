export function isSensitiveMemoryKey(key: string): boolean {
  return /(?:password|passwd|senha|secret|credential|token|api[-_]?key)/iu.test(key);
}
