// Resolves URLs for the bundled KONTi reference images that ship in
// `public/seed-images/`. Seed data and Drive-stripped photo records store
// these as root-relative paths (e.g. `/seed-images/konti-living-space.png`)
// so the API never has to know about the dashboard's deployed base path.
//
// In this monorepo every artifact is mounted under a base path
// (`/konti-dashboard/`, `/`, etc.) via Vite's `base` option, so a raw
// `/seed-images/...` URL would escape the artifact and 404. We prepend
// `import.meta.env.BASE_URL` (which always has a trailing slash) so the
// final URL stays inside the artifact regardless of where it's deployed.
//
// Non-seed-image URLs (Drive proxy URLs, data:, http(s):, anything that's
// not a `/seed-images/` path) are returned unchanged.
export function resolveSeedImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (!url.startsWith("/seed-images/")) return url;
  // BASE_URL always ends with `/`, so strip the leading `/` from the path
  // to avoid `//` in the final URL.
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}${url.slice(1)}`;
}
