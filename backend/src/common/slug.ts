/**
 * Lowercase, dash-separated slug from a display name.
 *
 * Shared by ProductsService (which resolves a category by name) and AdminService
 * (which creates and renames them). Kept in one place because the slug is what
 * the storefront URL and the `?category=` filter use — if the two modules
 * slugified differently, the same category could exist twice under two slugs.
 *
 * Returns an empty string when the name has no letters or digits; callers that
 * write to the database must reject that case themselves.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
