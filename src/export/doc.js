export function toDoc(job) {
  const rows = job.results.map((result) => `
    <h2>Reference #${result.index}: ${escapeHtml(result.status)}</h2>
    <p><strong>Detected style:</strong> ${escapeHtml(result.detectedCitationStyle || "Unknown")}</p>
    <p><strong>Brief:</strong> ${escapeHtml(result.briefSummary || "")}</p>
    <p><strong>Corrected:</strong> ${escapeHtml(result.correctedReference || "No corrected reference available")}</p>
    <p><strong>Original:</strong> ${escapeHtml(result.originalReference)}</p>
  `).join("\n");

  return Buffer.from(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Cite Validator Export</title>
    <style>
      body { font-family: Georgia, serif; line-height: 1.5; }
      h1, h2 { font-family: Arial, sans-serif; }
    </style>
  </head>
  <body>
    <h1>Cite Validator Citation Report</h1>
    <p>Total references: ${job.summary.total}</p>
    <p>Average confidence: ${job.summary.averageConfidence}</p>
    ${rows}
  </body>
</html>`, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
