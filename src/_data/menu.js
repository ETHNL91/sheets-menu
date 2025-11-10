import { parse } from "csv-parse/sync";

/**
 * Loads menu data from Google Sheets CSV (SHEETS_CSV_URL).
 * Image URLs can be relative to the repo (e.g., /assets/images/file.jpg).
 */
export default async function() {
  const url = process.env.SHEETS_CSV_URL;
  if (!url) {
    throw new Error("Missing SHEETS_CSV_URL. Set it locally and in GitHub Actions secrets.");
  }

  // Node 18+ has global fetch
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`Failed to fetch sheet CSV: ${res.status} ${res.statusText}`);
  const csvText = await res.text();

  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const items = records.map(r => ({
    id: r.id?.toString().trim(),
    name: r.name?.toString().trim(),
    price: r.price ? Number(r.price) : null,
    description: r.description || "",
    category: r.category || "Other",
    tags: (r.tags || "").split(",").map(t => t.trim()).filter(Boolean),
    image_url: r.image_url || "",
    available: (r.available || "").toString().toLowerCase() === "true",
    featured: (r.featured || "").toString().toLowerCase() === "true",
    updated_at: r.updated_at || ""
  }));

  // Only show available items
  return items.filter(i => i.available && i.name);
}
