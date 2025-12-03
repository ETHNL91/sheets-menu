import { parse as csvParse } from "csv-parse/sync";

function getSpreadsheetId() {
  const raw = process.env.SHEETS_DOC_ID || "";

  if (!raw) return null;

  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];

  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
    return raw;
  }

  return null;
}

async function fetchCsv(url, label) {
  if (!url) {
    console.warn(`[menu.js] No URL for ${label}, returning empty.`);
    return [];
  }

  const res = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
  });

  if (!res.ok) {
    console.warn(
      `[menu.js] Failed to fetch ${label} CSV: ${res.status} ${res.statusText}`
    );
    return [];
  }

  const text = await res.text();

  const rows = csvParse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`[menu.js] Loaded ${rows.length} rows from ${label}.`);
  return rows;
}

// more forgiving boolean parser
function toBool(v) {
  const s = (v || "").toString().trim().toLowerCase();
  return ["true", "1", "yes", "y", "✓", "x"].includes(s);
}

// Flower price breakdowns from ounce base:
// +10%, round up to nearest $5
function buildBreakdown(item) {
  const base = item.priceNumber;
  if (!base || isNaN(base)) return [];
  if ((item.category || "").toLowerCase() !== "flower") return [];

  const units = [
    { label: "3.5g (⅛)", grams: 3.5 },
    { label: "7g (¼)", grams: 7 },
    { label: "14g (½)", grams: 14 },
  ];

  return units.map((u) => {
    const raw = base * (u.grams / 28);
    const withTen = raw * 1.1;
    const rounded = Math.ceil(withTen / 5) * 5;
    return {
      label: u.label,
      price: rounded,
    };
  });
}


export default async function () {
  const docId = getSpreadsheetId();

  if (!docId) {
    console.warn(
      "[menu.js] SHEETS_DOC_ID is not set to a valid ID or URL. Returning empty menu."
    );
    return [];
  }

  const menuUrl = `https://docs.google.com/spreadsheets/d/17X6IbkQctEPB63_Q_a3x78DclUIRNdxk1240eh00hPA/edit?gid=0#gid=0`;
  const strainsUrl = `https://docs.google.com/spreadsheets/d/17X6IbkQctEPB63_Q_a3x78DclUIRNdxk1240eh00hPA/edit?gid=0#gid=0`;

  const [menuRecords, strainRecords] = await Promise.all([
    fetchCsv(menuUrl, "menu"),
    fetchCsv(strainsUrl, "strains"),
  ]);

  // parent_id -> [strain...]
  const strainsByParent = {};
  for (const row of strainRecords) {
    const parentId = (row.parent_id || "").toString().trim();
    const name = (row.name || "").toString().trim();
    if (!parentId || !name) continue;

    const priceRaw = (row.price || "").toString().trim();
    const numeric = priceRaw
      ? parseFloat(priceRaw.replace(/[^0-9.]/g, ""))
      : null;

    if (!strainsByParent[parentId]) {
      strainsByParent[parentId] = [];
    }

    strainsByParent[parentId].push({
      name,
      priceNumber: !isNaN(numeric) ? numeric : null,
      priceRaw: priceRaw || null,
    });
  }

  const items = menuRecords.map((r) => {
    const id = (r.id || "").toString().trim();
    const name = (r.name || "").toString().trim();

    const priceRaw = (r.price || "").toString().trim();
    const numeric = priceRaw
      ? parseFloat(priceRaw.replace(/[^0-9.]/g, ""))
      : NaN;

    const tags = (r.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const item = {
      id,
      name,
      priceNumber: !isNaN(numeric) ? numeric : null,
      priceRaw,
      description: r.description || "",
      category: r.category || "Other",
      tags,
      image_url: r.image_url || "",
      available: toBool(r.available),
      featured: toBool(r.featured),
      updated_at: r.updated_at || "",
    };

    item.strains = strainsByParent[id] || [];
    item.price_breakdown = buildBreakdown(item);

    return item;
  });

  const visible = items.filter((i) => i.available && i.name);

  console.log(
    `[menu.js] ${items.length} total items, ${visible.length} available with names.`
  );

  return visible;
}
