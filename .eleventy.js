export default function(eleventyConfig) {
  // Copy images straight through
  eleventyConfig.addPassthroughCopy("assets");

  // Helpers
  eleventyConfig.addFilter("currency", (v) =>
  (typeof v === "number" ? v : parseFloat(v)).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
);

  eleventyConfig.addFilter("byCategory", (items) => {
    const map = {};
    (items || []).forEach(i => {
      const cat = i.category || "Other";
      map[cat] ||= [];
      map[cat].push(i);
    });
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    htmlTemplateEngine: "njk"
  };
}
