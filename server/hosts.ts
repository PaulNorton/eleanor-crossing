/** The host name from a Host header, without port or IPv6 brackets. */
export function hostName(header: string | undefined): string {
  if (!header) return '';
  const h = header.toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'));
  return h.split(':')[0];
}
