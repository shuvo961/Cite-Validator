const reportId = window.location.pathname.split("/").filter(Boolean).pop();
const meta = document.querySelector("#reportMeta");
const summary = document.querySelector("#reportSummary");
const results = document.querySelector("#reportResults");
const rerunBtn = document.querySelector("#rerunReportBtn");
const links = {
  pdf: document.querySelector("#reportPdf"),
  csv: document.querySelector("#reportCsv"),
  doc: document.querySelector("#reportDoc"),
  bib: document.querySelector("#reportBib"),
  ris: document.querySelector("#reportRis")
};

let currentJob;
loadReport();

rerunBtn?.addEventListener("click", async () => {
  if (!currentJob) return;
  rerunBtn.disabled = true;
  rerunBtn.textContent = "Re-running...";
  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText: currentJob.inputText, style: currentJob.style || "auto" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Re-run failed");
    window.location.href = `/reports/${data.id}`;
  } catch (error) {
    rerunBtn.textContent = error.message;
  } finally {
    rerunBtn.disabled = false;
  }
});

async function loadReport() {
  try {
    const response = await fetch(`/api/jobs/${reportId}`, { cache: "no-store" });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "Report not found");
    currentJob = job;
    renderJob(job);
  } catch (error) {
    meta.textContent = error.message;
    summary.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderJob(job) {
  meta.textContent = `${new Date(job.createdAt).toLocaleString()} · ${job.results.length} references · ${String(job.style || "auto").toUpperCase()}`;
  for (const [type, link] of Object.entries(links)) {
    link.href = `/api/jobs/${job.id}/export.${type}`;
    link.classList.remove("disabled");
  }
  renderSummary(job);
  results.innerHTML = job.results.map(renderResult).join("");
}

function renderSummary(job) {
  const counts = job.summary?.counts || {};
  const total = job.results.length;
  summary.innerHTML = `
    <article class="chart-card">
      <h3>Outcomes</h3>
      ${chartBar("Verified", counts.Verified || 0, total, "verified")}
      ${chartBar("Partial", counts["Partially verified"] || 0, total, "partial")}
      ${chartBar("Suspicious", (counts.Suspicious || 0) + (counts.Unverifiable || 0), total, "suspicious")}
      ${chartBar("Likely fabricated", counts["Likely hallucinated/fabricated"] || 0, total, "fabricated")}
    </article>
    <article class="chart-card">
      <h3>Scores</h3>
      <div class="metric-grid">
        <span><strong>${Math.round((job.summary.averageConfidence || 0) * 100)}%</strong><small>Average confidence</small></span>
        <span><strong>${Math.round((job.summary.averageHallucinationRisk || 0) * 100)}%</strong><small>Average risk</small></span>
        <span><strong>${total}</strong><small>References</small></span>
      </div>
    </article>
  `;
}

function renderResult(result) {
  const klass = statusClass(result.status);
  return `
    <article class="result-card ${klass}">
      <div class="result-header">
        <div class="status-icon ${klass}" aria-hidden="true">${statusSymbol(result.status)}</div>
        <div>
          <h3>Reference #${result.index}</h3>
          <p class="source-line">${escapeHtml(result.matchedSource ? `Matched in ${result.matchedSource.sourceName}` : "No authoritative metadata match")}</p>
        </div>
        <div class="score-stack">
          <span class="badge ${klass}">${escapeHtml(result.status)}</span>
          <span class="risk">${Math.round(result.confidenceScore * 100)}% confidence</span>
        </div>
      </div>
      <p class="result-summary">${escapeHtml(result.summaryOutput || result.briefSummary || "")}</p>
      <details class="full-report">
        <summary>Full depth report</summary>
        <div class="reference-block"><h4>Original</h4><p>${escapeHtml(result.originalReference)}</p></div>
        <div class="reference-block corrected-wrap"><h4>Corrected</h4><p>${escapeHtml(result.correctedReference || "No correction available.")}</p></div>
        <div class="evidence"><p>${escapeHtml(result.evidence?.explanation || "")}</p><p><strong>Mismatches:</strong> ${escapeHtml(result.mismatches?.join(" | ") || "none")}</p></div>
      </details>
    </article>
  `;
}

function chartBar(label, value, total, kind) {
  const width = Math.round((Number(value || 0) / Math.max(Number(total || 0), 1)) * 100);
  return `<div class="chart-bar ${kind}"><div><span>${escapeHtml(label)}</span><strong>${value}</strong></div><i style="--bar-width:${width}%"></i></div>`;
}

function statusClass(status) {
  if (status === "Verified") return "verified";
  if (status === "Partially verified") return "partial";
  if (status === "Likely hallucinated/fabricated") return "fabricated";
  if (status === "Unverifiable") return "unverifiable";
  return "suspicious";
}

function statusSymbol(status) {
  if (status === "Verified") return "✓";
  if (status === "Partially verified") return "!";
  if (status === "Likely hallucinated/fabricated") return "×";
  return "?";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
