export function toPdf(job) {
  const lines = [
    "Academic Reference Validation Report",
    `Job: ${job.id}`,
    `Created: ${job.createdAt}`,
    `Total references: ${job.summary.total}`,
    `Average confidence: ${job.summary.averageConfidence}`,
    `Average hallucination risk: ${job.summary.averageHallucinationRisk}`,
    "",
    ...job.results.flatMap((result) => [
      `#${result.index} ${result.status} | Risk: ${result.hallucinationRiskLevel} (${result.hallucinationRiskScore}) | Confidence: ${result.confidenceScore}`,
      `Original: ${result.originalReference}`,
      `Corrected: ${result.correctedReference || "No corrected reference available"}`,
      `Matched source: ${result.matchedSource?.sourceName || "none"} ${result.matchedSource?.url || ""}`,
      `Mismatches: ${result.mismatches.length ? result.mismatches.join("; ") : "none"}`,
      `Action: ${result.recommendedAction}`,
      ""
    ])
  ];

  return makeSimplePdf(wrapLines(lines, 98));
}

function wrapLines(lines, width) {
  const wrapped = [];
  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > width) {
      const slice = rest.slice(0, width);
      const breakAt = Math.max(slice.lastIndexOf(" "), 40);
      wrapped.push(rest.slice(0, breakAt));
      rest = rest.slice(breakAt).trimStart();
    }
    if (rest) wrapped.push(rest);
  }
  return wrapped;
}

function makeSimplePdf(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = add("PAGES_PLACEHOLDER");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  for (const pageLines of pages) {
    const content = [
      "BT",
      "/F1 10 Tf",
      "50 780 Td",
      "14 TL",
      ...pageLines.map((line, index) => `${index === 0 ? "" : "T* " }(${escapePdf(line)}) Tj`),
      "ET"
    ].join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function escapePdf(value) {
  return String(value).replace(/[\\()]/g, "\\$&").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}
