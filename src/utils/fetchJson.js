/**
 * Fetch JSON with a small helper to surface HTTP errors.
 */
export async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}
