/**
 * Notification links are stored relative to the community ("/meetings/<id>").
 * Returns a safe in-app path with the community prefix ("/oceana-gardens/meetings/<id>"), or null
 * for anything that is not a plain relative path (external URLs, "//host", "..", spaces).
 */
export function inAppPath(slug: string, link: string | null | undefined) {
  const l = (link ?? "").trim();
  if (!l.startsWith("/") || l.startsWith("//") || /[\s\\]/.test(l) || l.split(/[/?#]/).includes("..")) return null;
  return l === `/${slug}` || l.startsWith(`/${slug}/`) ? l : `/${slug}${l}`;
}
