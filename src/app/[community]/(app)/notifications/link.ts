/**
 * Notification links are stored relative to the community ("/meetings/<id>"). Only plain in-app
 * paths are followed, so a stored link can never send someone to another site.
 */
export function notificationHref(slug: string, link: string | null | undefined): string | null {
  if (!link) return null;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%#+]*$/.test(link) || link.includes("..")) return null;
  return link === `/${slug}` || link.startsWith(`/${slug}/`) ? link : `/${slug}${link}`;
}
