const input = document.querySelector("#referencesInput");
const styleSelect = document.querySelector("#styleSelect");
const outputModeSelect = document.querySelector("#outputModeSelect");
const validateBtn = document.querySelector("#validateBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const fileInput = document.querySelector("#fileInput");
const loading = document.querySelector("#loading");
const emptyState = document.querySelector("#emptyState");
const resultsEl = document.querySelector("#results");
const resultsSection = document.querySelector("#resultsSection");
const progressList = document.querySelector("#progressList");
const summaryEl = document.querySelector("#summary");
const template = document.querySelector("#resultTemplate");
const healthStatus = document.querySelector("#healthStatus");
const csvExport = document.querySelector("#csvExport");
const pdfExport = document.querySelector("#pdfExport");
const docExport = document.querySelector("#docExport");
const bibExport = document.querySelector("#bibExport");
const risExport = document.querySelector("#risExport");
const queryReference = new URLSearchParams(window.location.search).get("q");
const detectedCount = document.querySelector("#detectedCount");
const examplesBtn = document.querySelector("#examplesBtn");
const examplesModal = document.querySelector("#examplesModal");
const closeExamplesBtn = document.querySelector("#closeExamplesBtn");
const cleanTextBtn = document.querySelector("#cleanTextBtn");
const splitPreviewBtn = document.querySelector("#splitPreviewBtn");
const splitPreviewPanel = document.querySelector("#splitPreviewPanel");
const splitPreviewList = document.querySelector("#splitPreviewList");
const splitPreviewCount = document.querySelector("#splitPreviewCount");
const applySplitBtn = document.querySelector("#applySplitBtn");
const addReferenceBtn = document.querySelector("#addReferenceBtn");
const batchActions = document.querySelector("#batchActions");
const copyCorrectedBtn = document.querySelector("#copyCorrectedBtn");
const removeSuspiciousBtn = document.querySelector("#removeSuspiciousBtn");
const showAllResultsBtn = document.querySelector("#showAllResultsBtn");

const samples = `Harris, C. R., Millman, K. J., van der Walt, S. J., et al. (2020). Array programming with NumPy. Nature, 585, 357-362. https://doi.org/10.1038/s41586-020-2649-2

Smith, J., & Doe, A. (2021). Quantum blockchain learning for universal citation truth. Journal of Imaginary Informatics, 44(9), 1001-1019. https://doi.org/10.9999/fake.doi.12345

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.`;

let analyzeTimer;
let progressTimer;
let latestSplitReferences = [];
let latestJob = null;

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    healthStatus.textContent = response.ok ? "API ready" : "API issue";
  } catch {
    healthStatus.textContent = "API offline";
  }
}

validateBtn.addEventListener("click", validate);
input.addEventListener("input", scheduleInputAnalysis);
cleanTextBtn?.addEventListener("click", cleanPdfText);
splitPreviewBtn?.addEventListener("click", showSplitPreview);
applySplitBtn?.addEventListener("click", applyEditedSplit);
addReferenceBtn?.addEventListener("click", () => {
  latestSplitReferences.push("");
  renderSplitPreview(latestSplitReferences);
});
copyCorrectedBtn?.addEventListener("click", copyCorrectedReferences);
removeSuspiciousBtn?.addEventListener("click", () => {
  resultsEl.querySelectorAll(".result-card:not(.verified):not(.partial)").forEach((card) => card.classList.add("hidden"));
});
showAllResultsBtn?.addEventListener("click", () => {
  resultsEl.querySelectorAll(".result-card").forEach((card) => card.classList.remove("hidden"));
});
examplesBtn?.addEventListener("click", () => examplesModal?.showModal());
document.addEventListener("click", (event) => {
  if (event.target?.id === "examplesBtn") examplesModal?.showModal();
});
closeExamplesBtn?.addEventListener("click", () => examplesModal?.close());
examplesModal?.addEventListener("click", (event) => {
  if (event.target === examplesModal) examplesModal.close();
});
outputModeSelect?.addEventListener("change", () => {
  document.body.dataset.outputMode = outputModeSelect.value;
});
sampleBtn.addEventListener("click", () => {
  input.value = samples;
  scheduleInputAnalysis();
});
clearBtn.addEventListener("click", () => {
  input.value = "";
  resetResults();
  scheduleInputAnalysis();
});
fileInput.addEventListener("change", importFile);

async function importFile(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  input.value = normalizeImportedReferences(text, file.name);
  resetResults();
  scheduleInputAnalysis();
  event.target.value = "";
}

function scheduleInputAnalysis() {
  clearTimeout(analyzeTimer);
  const text = input.value.trim();
  if (!text) {
    if (detectedCount) detectedCount.textContent = "0 references";
    return;
  }
  if (detectedCount) detectedCount.textContent = "Analyzing...";
  analyzeTimer = setTimeout(() => analyzeInput(text), 350);
}

async function analyzeInput(referencesText) {
  try {
    const response = await fetch("/api/analyze-input", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analysis failed");
    latestSplitReferences = (data.references || data.previews || []).map((item) => item.text).filter(Boolean);
    const visibleCount = latestSplitReferences.length || Number(data.count || 0);
    if (detectedCount) detectedCount.textContent = `${visibleCount} reference${visibleCount === 1 ? "" : "s"} detected`;
    if (splitPreviewPanel && !splitPreviewPanel.classList.contains("hidden")) renderSplitPreview(latestSplitReferences);
    return { ...data, count: visibleCount };
  } catch {
    if (detectedCount) detectedCount.textContent = "Count unavailable";
    return null;
  }
}

function cleanPdfText() {
  const original = input.value;
  const cleaned = cleanReferenceText(original);
  input.value = cleaned;
  resetResults();
  scheduleInputAnalysis();
  splitPreviewPanel?.classList.remove("hidden");
  analyzeInput(cleaned);
}

async function showSplitPreview() {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  splitPreviewPanel?.classList.remove("hidden");
  const analysis = await analyzeInput(text);
  renderSplitPreview((analysis?.references || []).map((item) => item.text));
}

function renderSplitPreview(references) {
  latestSplitReferences = references.length ? references : [""];
  if (splitPreviewCount) {
    splitPreviewCount.textContent = `${latestSplitReferences.length} reference${latestSplitReferences.length === 1 ? "" : "s"}`;
  }
  if (!splitPreviewList) return;
  splitPreviewList.innerHTML = latestSplitReferences.map((reference, index) => `
    <article class="split-reference-card" data-index="${index}">
      <div class="split-reference-toolbar">
        <strong>Reference ${index + 1}</strong>
        <div>
          <button class="ghost split-before" type="button">Split below</button>
          <button class="ghost merge-next" type="button">Merge next</button>
          <button class="ghost remove-ref" type="button">Remove</button>
        </div>
      </div>
      <textarea data-split-editor="${index}" spellcheck="false">${escapeHtml(reference)}</textarea>
    </article>
  `).join("");
}

splitPreviewList?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  syncSplitEditors();
  const card = button.closest(".split-reference-card");
  const index = Number(card?.dataset.index || 0);
  if (button.classList.contains("split-before")) {
    const value = latestSplitReferences[index] || "";
    const midpoint = Math.max(value.indexOf(". ", Math.min(120, value.length - 1)) + 1, Math.floor(value.length / 2));
    latestSplitReferences.splice(index, 1, value.slice(0, midpoint).trim(), value.slice(midpoint).trim());
  }
  if (button.classList.contains("merge-next") && index < latestSplitReferences.length - 1) {
    latestSplitReferences.splice(index, 2, `${latestSplitReferences[index]} ${latestSplitReferences[index + 1]}`.trim());
  }
  if (button.classList.contains("remove-ref")) {
    latestSplitReferences.splice(index, 1);
  }
  renderSplitPreview(latestSplitReferences.filter(Boolean));
});

function syncSplitEditors() {
  latestSplitReferences = [...splitPreviewList.querySelectorAll("[data-split-editor]")]
    .map((editor) => editor.value.trim())
    .filter(Boolean);
}

function applyEditedSplit() {
  syncSplitEditors();
  input.value = latestSplitReferences.join("\n\n");
  scheduleInputAnalysis();
}

function cleanReferenceText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/([A-Za-z])\n([a-z])/g, "$1 $2")
    .replace(/https:\s*\/\s*\/\s*doi\s*\.?\s*org\s*\/\s*/gi, "https://doi.org/")
    .replace(/doi\s*\.\s*org\s*\/\s*/gi, "doi.org/")
    .replace(/\b(10\.\d{4,9}\/)\s+/gi, "$1")
    .replace(/(?:^|\n)\s*(?:\d{2,6}\s*\n){4,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderProgress(previews, count) {
  if (!progressList) return;
  const total = Math.max(Number(count || latestSplitReferences.length || previews.length || 1), 1);
  const visible = Math.min(total, 12);
  progressList.innerHTML = Array.from({ length: visible }, (_, index) => {
    const preview = previews[index]?.text || `Reference ${index + 1}`;
    return `
      <div class="progress-item">
        <span class="progress-dot"></span>
        <span class="progress-text">Reference ${index + 1}: preparing search</span>
        <small>${escapeHtml(preview)}</small>
      </div>
    `;
  }).join("") + (total > visible ? `<p class="progress-extra">+ ${total - visible} more references queued</p>` : "");
}

function startProgressAnimation() {
  const stages = [
    "repairing pasted text",
    "checking DOI metadata",
    "searching Crossref and OpenAlex",
    "checking books and biomedical indexes",
    "comparing fields",
    "scoring confidence"
  ];
  let tick = 0;
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const items = progressList?.querySelectorAll(".progress-item") || [];
    items.forEach((item, index) => {
      const text = item.querySelector(".progress-text");
      if (text) text.textContent = `Reference ${index + 1}: ${stages[(tick + index) % stages.length]}`;
    });
    tick += 1;
  }, 900);
}

function stopProgressAnimation() {
  clearInterval(progressTimer);
  progressTimer = null;
}

function normalizeImportedReferences(text, filename) {
  if (/\.bib$/i.test(filename)) return parseBibtex(text);
  if (/\.ris$/i.test(filename)) return parseRis(text);
  return text.trim();
}

function parseBibtex(text) {
  const entries = text.match(/@\w+\s*\{[\s\S]*?(?=\n@\w+\s*\{|$)/g) || [];
  return entries.map((entry) => {
    const field = (name) => entry.match(new RegExp(`${name}\\s*=\\s*[{"]([^}"]+)`, "i"))?.[1] || "";
    const authors = field("author").replace(/\s+and\s+/gi, "; ");
    const title = field("title");
    const year = field("year");
    const container = field("journal") || field("booktitle");
    const volume = field("volume");
    const issue = field("number");
    const pages = field("pages").replace(/--/g, "-");
    const doi = field("doi");
    return [authors, year && `(${year}).`, title, container, volume && `${volume}${issue ? `(${issue})` : ""}`, pages, doi && `https://doi.org/${doi}`]
      .filter(Boolean)
      .join(". ");
  }).join("\n\n") || text.trim();
}

function parseRis(text) {
  const records = text.split(/\nER\s+-/i).map((record) => record.trim()).filter(Boolean);
  return records.map((record) => {
    const all = (tag) => [...record.matchAll(new RegExp(`^${tag}\\s+-\\s+(.+)$`, "gim"))].map((m) => m[1].trim());
    const first = (tag) => all(tag)[0] || "";
    const authors = all("AU").join("; ");
    const title = first("TI") || first("T1");
    const year = first("PY") || first("Y1").slice(0, 4);
    const container = first("JO") || first("JF") || first("T2");
    const doi = first("DO");
    const pages = [first("SP"), first("EP")].filter(Boolean).join("-");
    return [authors, year && `(${year}).`, title, container, pages, doi && `https://doi.org/${doi}`]
      .filter(Boolean)
      .join(". ");
  }).join("\n\n") || text.trim();
}

async function validate() {
  const referencesText = input.value.trim();
  if (!referencesText) {
    input.focus();
    return;
  }

  resetResults(false);
  resultsSection?.classList.remove("hidden");
  setBusy(true);

  try {
    const analysis = await analyzeInput(referencesText);
    renderProgress(analysis?.previews || [], analysis?.count || 1);
    startProgressAnimation();
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText, style: styleSelect.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Validation failed");
    if (data.queued) {
      await waitForQueuedJob(data);
    } else {
      renderJob(data);
    }
    document.querySelector("#resultsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    emptyState.textContent = error.message;
    emptyState.classList.remove("hidden");
  } finally {
    stopProgressAnimation();
    setBusy(false);
    if (progressList) progressList.innerHTML = "";
  }
}

async function waitForQueuedJob(job) {
  updateQueuedProgress(job);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(1200);
    const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok && data.status !== "failed") throw new Error(data.error || "Queued validation failed");
    updateQueuedProgress(data);
    if (data.status === "complete" && data.result) {
      renderJob(data.result);
      return;
    }
    if (data.status === "failed") throw new Error(data.message || "Queued validation failed");
  }
  throw new Error("Large batch validation is still running. Please try opening the report again in a moment.");
}

function updateQueuedProgress(job) {
  if (!progressList) return;
  const value = Math.max(0, Math.min(100, Number(job.progress || 0)));
  progressList.innerHTML = `
    <div class="progress-item queued-progress">
      <span class="progress-dot"></span>
      <span class="progress-text">${escapeHtml(job.message || "Processing queued validation...")}</span>
      <small>${value}% complete. Large batches are processed in the background so the page stays responsive.</small>
    </div>
  `;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderJob(job) {
  latestJob = job;
  if (progressList) progressList.innerHTML = "";
  loading?.classList.add("hidden");
  emptyState.classList.add("hidden");
  batchActions?.classList.remove("hidden");
  renderSummary(job.summary);
  const renderedCount = job.results?.length || job.aiAssist?.detectedReferences || 0;
  if (detectedCount) detectedCount.textContent = `${renderedCount} reference${renderedCount === 1 ? "" : "s"} detected`;
  csvExport.href = `/api/jobs/${job.id}/export.csv`;
  pdfExport.href = `/api/jobs/${job.id}/export.pdf`;
  docExport.href = `/api/jobs/${job.id}/export.doc`;
  bibExport.href = `/api/jobs/${job.id}/export.bib`;
  risExport.href = `/api/jobs/${job.id}/export.ris`;
  csvExport.classList.remove("disabled");
  pdfExport.classList.remove("disabled");
  docExport.classList.remove("disabled");
  bibExport.classList.remove("disabled");
  risExport.classList.remove("disabled");

  for (const result of job.results) {
    resultsEl.appendChild(renderResult(result));
  }
}

async function copyCorrectedReferences() {
  const text = latestJob?.results
    ?.map((result) => result.correctedReference || result.originalReference)
    .filter(Boolean)
    .join("\n\n");
  if (!text) return;
  await navigator.clipboard.writeText(text);
  copyCorrectedBtn.textContent = "Copied";
  setTimeout(() => {
    copyCorrectedBtn.textContent = "Copy corrected";
  }, 1400);
}

function renderSummary(summary) {
  const items = [
    ["Total", summary.total],
    ["Verified", summary.counts.Verified || 0],
    ["Needs review", (summary.counts["Partially verified"] || 0) + (summary.counts.Suspicious || 0) + (summary.counts.Unverifiable || 0)],
    ["Likely fabricated", summary.counts["Likely hallucinated/fabricated"] || 0]
  ];
  summaryEl.innerHTML = items.map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`).join("");
  summaryEl.classList.remove("hidden");
}

function renderResult(result) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.add(statusClass(result.status));
  const icon = node.querySelector(".status-icon");
  icon.textContent = statusSymbol(result.status);
  icon.classList.add(statusClass(result.status));
  node.querySelector("h3").textContent = `Reference #${result.index}`;
  node.querySelector(".source-line").textContent = result.matchedSource
    ? `Matched in ${result.matchedSource.sourceName}`
    : "No authoritative metadata match";
  const badge = node.querySelector(".badge");
  badge.textContent = result.status;
  badge.classList.add(statusClass(result.status));
  const risk = node.querySelector(".risk");
  risk.textContent = `${percent(result.confidenceScore)} confidence`;
  risk.classList.add(statusClass(result.status));
  node.querySelector(".original").textContent = result.originalReference;
  node.querySelector(".corrected").textContent = result.correctedReference || "No corrected reference can be produced until a source record is verified.";
  node.querySelector(".confidence").textContent = `Risk: ${result.hallucinationRiskLevel}`;
  node.querySelector(".action").textContent = `Action: ${result.recommendedAction}`;
  node.querySelector(".detected-style").textContent = `Style: ${result.detectedCitationStyle || result.parsed?.styleGuess || "Unknown"}`;
  node.querySelector(".result-summary").textContent = result.briefSummary || result.summaryOutput || "";
  const mismatchSummary = summarizeMismatches(result);
  const sourceLine = node.querySelector(".source-line");
  if (mismatchSummary.length) {
    const chips = document.createElement("div");
    chips.className = "mismatch-chips";
    chips.innerHTML = mismatchSummary.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    sourceLine.insertAdjacentElement("afterend", chips);
  }

  const table = node.querySelector(".field-table");
  table.innerHTML = result.fieldComparisons.map((field) => `
    <div class="field-row">
      <span class="field-label">${escapeHtml(field.label)}</span>
      <span><strong>Provided:</strong> ${escapeHtml(field.provided || "missing")}</span>
      <span><strong>Source:</strong> ${escapeHtml(field.source || "missing")}</span>
      <span class="severity ${field.severity}">${escapeHtml(field.severity)}</span>
    </div>
  `).join("");

  const evidence = node.querySelector(".evidence");
  const sourceLines = result.evidence.searchedSources
    .map((source) => `${source.source}: ${source.ok ? `${source.count} candidates` : source.error}`)
    .join("<br>");
  evidence.innerHTML = `
    <p>${escapeHtml(result.evidence.explanation)}</p>
    <p><strong>Mismatches:</strong> ${escapeHtml(result.mismatches.join(" | ") || "none")}</p>
    <p><strong>Sources searched:</strong><br>${sourceLines}</p>
    ${result.matchedSource?.url ? `<p><a href="${result.matchedSource.url}" target="_blank" rel="noreferrer">Open matched source</a></p>` : ""}
  `;
  return node;
}

function summarizeMismatches(result) {
  const fieldIssues = (result.fieldComparisons || [])
    .filter((field) => ["mismatch", "missing", "severe"].includes(String(field.severity || "").toLowerCase()))
    .map((field) => field.label || field.field)
    .filter(Boolean);
  const textIssues = (result.mismatches || [])
    .map((item) => String(item).replace(/^(.{1,52}).*$/, "$1").trim())
    .filter(Boolean);
  return [...new Set([...fieldIssues, ...textIssues])].slice(0, 3);
}

function resetResults(resetText = true) {
  latestJob = null;
  resultsEl.innerHTML = "";
  if (progressList) progressList.innerHTML = "";
  loading?.classList.add("hidden");
  summaryEl.innerHTML = "";
  summaryEl.classList.add("hidden");
  emptyState.textContent = resetText ? "Run a validation to see status, risk, field comparisons, and source evidence." : "";
  emptyState.classList.toggle("hidden", !resetText);
  resultsSection?.classList.toggle("hidden", resetText);
  batchActions?.classList.add("hidden");
  csvExport.classList.add("disabled");
  pdfExport.classList.add("disabled");
  docExport?.classList.add("disabled");
  bibExport?.classList.add("disabled");
  risExport?.classList.add("disabled");
  csvExport.href = "#";
  pdfExport.href = "#";
  if (docExport) docExport.href = "#";
  if (bibExport) bibExport.href = "#";
  if (risExport) risExport.href = "#";
  if (detectedCount) detectedCount.textContent = "Ready";
}

function setBusy(isBusy) {
  validateBtn.disabled = isBusy;
  loading?.classList.toggle("hidden", !isBusy);
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
  if (status === "Suspicious") return "?";
  return "?";
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

checkHealth();
const savedStyle = localStorage.getItem("cv_default_style");
const savedOutput = localStorage.getItem("cv_default_output");
if (savedStyle && styleSelect) styleSelect.value = savedStyle;
if (savedOutput && outputModeSelect) outputModeSelect.value = savedOutput;
document.body.dataset.outputMode = outputModeSelect?.value || "summary";

if (queryReference?.trim()) {
  input.value = queryReference.trim();
  if (detectedCount) detectedCount.textContent = "AI repair ready";
  scheduleInputAnalysis();
} else {
  scheduleInputAnalysis();
}
