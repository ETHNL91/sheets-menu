// FILE: src/_data/menu.js
// Requires: "csv-parse" (sync) installed and Eleventy running in ESM mode.
// Purpose: Load items + strains CSV, robustly normalize, and return visible items.

import { parse as csvParse } from "csv-parse/sync";

/** Adds a cache-busting query param to avoid stale CSVs from intermediaries. */
function withCacheBuster(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("_cb", String(Date.now()));
    return u.toString();
  } catch {
    // If URL constructor fails, fallback to best-effort append
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}_cb=${Date.now()}`;
  }
}

/** Lenient bool parser for Sheets; defaults false when ambiguous. */
function toBool(v) {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (!s) return false;
  return ["true", "1", "yes", "y", "✓", "x"].includes(s);
}

/** Extract a number from strings like "$120", "120.00", " 120 ". Returns null on NaN. */
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Split comma-delimited tags into array. */
function splitTags(v) {
  return String(v ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Detect an HTML response (e.g., login/suspended/prompt) from CSV URL. */
function looksLikeHtml({ contentType, body }) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const head = (body ?? "").slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

/** Defensive CSV fetch + parse. */
async function fetchCsv(url, label) {
  if (!url) {
    console.warn(`[menu.js] No URL for ${label}; returning empty array.`);
    return [];
  }

  const busted = withCacheBuster(url);
  const res = await fetch(busted, {
    // Cache-control on request is advisory; cache-buster above is the real win.
    headers: { "Cache-Control": "no-cache" },
  }).catch((e) => {
    console.warn(`[menu.js] Network error for ${label}:`, e?.message || e);
    return null;
  });

  if (!res || !res.ok) {
    console.warn(
      `[menu.js] Failed to fetch ${label} CSV: ${res?.status ?? "?"} ${res?.statusText ?? ""}`
    );
    return [];
  }

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  // Guard: HTML instead of CSV (wrong link / permission / unpublished)
  if (looksLikeHtml({ contentType, body: text })) {
    console.warn(
      `[menu.js] ${label} returned HTML, not CSV. Check "Publish to the web" CSV link. Content-Type="${contentType}".`
    );
    console.warn(`[menu.js] First 120 chars from ${label} (HTML):`, text.slice(0, 120));
    return [];
  }

  console.log(`[menu.js] First 120 chars from ${label}:`, text.slice(0, 120));

  let rows = [];
  try {
    rows = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (e) {
    console.warn(`[menu.js] CSV parse failed for ${label}:`, e?.message || e);
    return [];
  }

  console.log(`[menu.js] Loaded ${rows.length} rows from ${label}.`);
  return rows;
}

/** Price breakdown for Flower by weight; ceil to nearest $5 after +10%. */
function buildBreakdown(item) {
  const base = toNumber(item.priceNumber);
  if (!base) return [];
  if (String(item.category ?? "").trim().toLowerCase() !== "flower") return [];

  const units = [
    { label: "3.5g (⅛)", grams: 3.5 },
    { label: "7g (¼)", grams: 7 },
    { label: "14g (½)", grams: 14 },
  ];

  return units.map((u) => {
    const raw = base * (u.grams / 28);
    const withTen = raw * 1.1;
    const rounded = Math.ceil(withTen / 5) * 5;
    return { label: u.label, price: rounded };
  });
}

/** Shape your final visible item object. */
function mapItemRow(r) {
  const id = String(r.id ?? "").trim();
  const name = String(r.name ?? "").trim();
  const priceRaw = String(r.price ?? "").trim();
  const priceNumber = toNumber(priceRaw);
  const category = r.category ? String(r.category).trim() : "Other";

  return {
    id,
    name,
    priceRaw,
    priceNumber,
    description: String(r.description ?? "").trim(),
    category,
    tags: splitTags(r.tags),
    image_url: String(r.image_url ?? "").trim(),
    available: toBool(r.available),
    featured: toBool(r.featured),
    updated_at: String(r.updated_at ?? "").trim(),
  };
}

/** Shape a strain row. */
function mapStrainRow(r) {
  return {
    parent_id: String(r.parent_id ?? "").trim(),
    name: String(r.name ?? "").trim(),
    priceRaw: String(r.price ?? "").trim(),
    priceNumber: toNumber(r.price),
    available: toBool(r.available),
    description: String(r.description ?? "").trim(),
    updated_at: String(r.updated_at ?? "").trim(),
  };
}

export default async function () {
  // === CSV LINKS ===
  // Use "Publish to the web" CSV links (File → Share → Publish to web → Link → entire sheet → CSV)
  // Example (change to your actual IDs):
  const menuUrl =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRga6Mj8T4T5O2xqeT6qA9jT-kw_jxUv5r7Dgi_CzlEpeYeiWpnUhobhMRLoI1t0eJigpo2-jksrtoN/pub?output=csv";

  const strainsUrl =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRga6Mj8T4T5O2xqeT6qA9jT-kw_jxUv5r7Dgi_CzlEpeYeiWpnUhobhMRLoI1t0eJigpo2-jksrtoN/pub?output=csv";

  // Load CSVs (strains can be empty or same URL; we handle gracefully)
  const [menuRecordsRaw, strainRecordsRaw] = await Promise.all([
    fetchCsv(menuUrl, "menu"),
    fetchCsv(strainsUrl, "strains"),
  ]);

  // Normalize items
  const items = menuRecordsRaw.map(mapItemRow);

  // Build strainsByParent if parent_id exists in the dataset
  let strainsByParent = {};
  const hasParentIdColumn =
    strainRecordsRaw.length > 0 &&
    Object.prototype.hasOwnProperty.call(strainRecordsRaw[0], "parent_id");

  if (!hasParentIdColumn && strainRecordsRaw.length) {
    console.warn(
      "[menu.js] strains.csv has no parent_id column; strains cannot attach. Add header: parent_id"
    );
  }

  if (hasParentIdColumn) {
    for (const r of strainRecordsRaw) {
      const s = mapStrainRow(r);
      if (!s.parent_id || !s.name) continue;
      if (!strainsByParent[s.parent_id]) strainsByParent[s.parent_id] = [];
      strainsByParent[s.parent_id].push(s);
    }
  }

  // Attach strains and computed breakdown
  for (const item of items) {
    item.strains = strainsByParent[item.id] ?? [];
    item.price_breakdown = buildBreakdown(item);
  }

  // Visible = available + has name
  const visible = items.filter((i) => i.available && i.name);

  console.log(
    `[menu.js] ${items.length} total items, ${visible.length} available with names.`
  );

  return visible;
}
