// FILE: .eleventy.js
export default function(eleventyConfig) {
  // Copy images/assets straight through
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Filters
  eleventyConfig.addFilter("currency", (v) =>
    (typeof v === "number" ? v : parseFloat(v)).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    })
  );

  // Return an object keyed by category so Nunjucks can do: {% for cat, items in groups %}
  eleventyConfig.addFilter("byCategory", (items) => {
    const grouped = {};
    for (const i of items || []) {
      const cat = (i?.category || "Other").trim() || "Other";
      (grouped[cat] ||= []).push(i);
    }
    // Optional: alphabetical order by category name
    const ordered = {};
    Object.keys(grouped).sort((a, b) => a.localeCompare(b)).forEach(k => { ordered[k] = grouped[k]; });
    return ordered;
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    htmlTemplateEngine: "njk",
  };
}
