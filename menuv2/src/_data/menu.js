// FILE: src/_data/menu.js
import { parse as csvParse } from "csv-parse/sync";
import "dotenv/config";

// ----------------- Helpers -----------------

function withCacheBuster(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("_cb", Date.now().toString());
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}`;
  }
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "✓", "x"].includes(s);
}

function toNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function splitTags(v) {
  return String(v ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function looksLikeHtml({ contentType, body }) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const head = (body ?? "").slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

async function fetchCsv(url, label) {
  if (!url) {
    console.warn(`[menu.js] No URL for ${label}, returning empty.`);
    return [];
  }

  const busted = withCacheBuster(url);
  let res;

  try {
    res = await fetch(busted, {
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.warn(
      `[menu.js] Network error for ${label}:`,
      e?.message || e
    );
    return [];
  }

  if (!res.ok) {
    console.warn(
      `[menu.js] Fetch failed for ${label}: ${res.status} ${res.statusText}`
    );
    return [];
  }

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (looksLikeHtml({ contentType, body: text })) {
    console.warn(
      `[menu.js] ${label} returned HTML. Check Publish-to-web CSV link.`
    );
    console.warn(
      `[menu.js] First 120 chars from ${label}:`,
      text.slice(0, 120)
    );
    return [];
  }

  console.log(
    `[menu.js] First 120 from ${label}:`,
    text.slice(0, 120).replace(/\s+/g, " ")
  );

  try {
    const rows = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    console.log(
      `[menu.js] Loaded ${rows.length} rows from ${label}.`
    );
    return rows;
  } catch (e) {
    console.warn(
      `[menu.js] CSV parse failed for ${label}:`,
      e?.message || e
    );
    return [];
  }
}

// Price breakdown for Flower items
function buildBreakdown(item) {
  const base = toNumber(item.priceNumber);
  if (!base) return [];

  const category = String(item.category ?? "").trim().toLowerCase();
  if (category !== "flower") return [];

  const units = [
    { label: "3.5g", grams: 3.5 },
    { label: "7g", grams: 7 },
    { label: "14g", grams: 14 },
  ];

  return units.map((u) => {
    const raw = base * (u.grams / 28);
    const withTen = raw * 1.2;
    const rounded = Math.ceil(withTen / 5) * 5;
    return { label: u.label, price: rounded };
  });
}

// Map menu rows
function mapItemRow(r) {
  const priceRaw = String(r.price ?? "").trim();

  const item = {
    id: String(r.id ?? "").trim(),
    name: String(r.name ?? "").trim(),
    priceRaw,
    priceNumber: toNumber(priceRaw),
    price: toNumber(priceRaw),
    description: String(r.description ?? "").trim(),
    category: String(r.category ?? "Other").trim() || "Other",
    tags: splitTags(r.tags),
    image_url: String(r.image_url ?? "").trim(),
    available: toBool(r.available),
    featured: toBool(r.featured),
    updated_at: String(r.updated_at ?? "").trim(),
  };

  item.price_breakdown = buildBreakdown(item);
  return item;
}

// Map strains rows
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

// ----------------- Main export -----------------

export default async function () {
  const menuUrl = process.env.MENU_CSV_URL || "";
  const strainsUrl = process.env.STRAINS_CSV_URL || "";

  if (!menuUrl) {
    console.warn(
      "[menu.js] MENU_CSV_URL is not set. Returning empty menu."
    );
    return [];
  }

  const [menuRows, strainRows] = await Promise.all([
    fetchCsv(menuUrl, "menu"),
    strainsUrl ? fetchCsv(strainsUrl, "strains") : Promise.resolve([]),
  ]);

  const items = menuRows.map(mapItemRow);

  // Attach strains by parent_id if we have a strains sheet
  const strainsByParent = {};
  const hasParentId =
    strainRows.length &&
    Object.prototype.hasOwnProperty.call(strainRows[0], "parent_id");

  if (!hasParentId && strainRows.length) {
    console.warn(
      "[menu.js] strains CSV has no parent_id; strains won't attach."
    );
  }

  if (hasParentId) {
    for (const r of strainRows) {
      const s = mapStrainRow(r);
      if (!s.parent_id || !s.name) continue;
      (strainsByParent[s.parent_id] ||= []).push(s);
    }
  }

  for (const it of items) {
    it.strains = strainsByParent[it.id] ?? [];
  }

  const visible = items.filter((i) => i.available && i.name);
  console.log(
    `[menu.js] ${items.length} total items, ${visible.length} available with names.`
  );

  return visible;
}
