const input = document.querySelector("#doiInput");
const contextInput = document.querySelector("#doiContextInput");
const checkBtn = document.querySelector("#doiCheckBtn");
const sampleBtn = document.querySelector("#doiSampleBtn");
const clearBtn = document.querySelector("#doiClearBtn");
const loading = document.querySelector("#doiLoading");
const empty = document.querySelector("#doiEmpty");
const resultEl = document.querySelector("#doiResult");
const modeBadge = document.querySelector("#doiModeBadge");

const sample = "10.1038/s41586-020-2649-2";
const sampleContext = "Harris, C. R., Millman, K. J., van der Walt, S. J., et al. (2020). Array programming with NumPy. Nature, 585, 357-362. https://doi.org/10.1038/s41586-020-2649-2";

checkBtn?.addEventListener("click", checkDoi);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkDoi();
});
sampleBtn?.addEventListener("click", () => {
  input.value = sample;
  contextInput.value = sampleContext;
  modeBadge.textContent = "Sample loaded";
});
clearBtn?.addEventListener("click", () => {
  input.value = "";
  contextInput.value = "";
  resultEl.innerHTML = "";
  empty.classList.remove("hidden");
  empty.innerHTML = `
    <img src="/icons/slider/doi.svg" alt="">
    <strong>No DOI checked yet</strong>
    <span>Enter a DOI above to see the source, confidence, risk, and corrected citation.</span>
  `;
  modeBadge.textContent = "Ready";
});

async function checkDoi() {
  const value = input.value.trim();
  const context = contextInput.value.trim();
  if (!value) {
    input.focus();
    return;
  }
  setBusy(true);
  resultEl.innerHTML = "";
  empty.classList.add("hidden");
  modeBadge.textContent = "Checking";
  try {
    const referencesText = context ? `${context} ${value}` : (value.includes("10.") ? value : `DOI: ${value}`);
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText, style: "auto" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "DOI check failed");
    render(data.results[0], data.id);
    modeBadge.textContent = "Complete";
  } catch (error) {
    empty.textContent = error.message;
    empty.classList.remove("hidden");
    modeBadge.textContent = "Error";
  } finally {
    setBusy(false);
  }
}

function render(result, jobId) {
  loading?.classList.add("hidden");
  if (!result) {
    empty.textContent = "No result was returned.";
    empty.classList.remove("hidden");
    return;
  }
  const status = statusClass(result.status);
  const doi = result.parsed?.doi || result.matchedSource?.doi || extractDoi(result.originalReference);
  const matchedUrl = result.matchedSource?.url || (doi ? `https://doi.org/${doi}` : "");
  const sourceLabel = result.matchedSource ? result.matchedSource.sourceName : "No authoritative DOI record matched";
  resultEl.innerHTML = `
    <article class="doi-result-card ${status}">
      <div class="doi-verdict-row">
        <div class="doi-status-mark ${status}" aria-hidden="true">${statusSymbol(result.status)}</div>
        <div class="doi-verdict-copy">
          <span>Verification status</span>
          <h3>${escapeHtml(result.status)}</h3>
          <p>${escapeHtml(sourceLabel)}</p>
        </div>
        <div class="doi-score-meter">
          <strong>${Math.round(result.confidenceScore * 100)}%</strong>
          <span>confidence</span>
        </div>
      </div>
      <div class="doi-identity-strip">
        <div><span>DOI</span><strong>${escapeHtml(doi || "Not detected")}</strong></div>
        <div><span>Risk</span><strong>${escapeHtml(result.hallucinationRiskLevel)}</strong></div>
        <div><span>Source</span><strong>${escapeHtml(sourceLabel)}</strong></div>
      </div>
      <p class="doi-result-summary">${escapeHtml(result.summaryOutput || result.briefSummary || "")}</p>
      <div class="doi-result-actions">
        ${matchedUrl ? `<a href="${matchedUrl}" target="_blank" rel="noreferrer">Open DOI/source</a>` : ""}
        <a href="/api/jobs/${jobId}/export.pdf">Download report</a>
        <a href="/validate">Validate full bibliography</a>
      </div>
      <details class="doi-details">
        <summary>Field-level DOI report</summary>
        <div class="reference-block"><h4>Input checked</h4><p>${escapeHtml(result.originalReference)}</p></div>
        <div class="reference-block corrected-wrap"><h4>Corrected reference</h4><p>${escapeHtml(result.correctedReference || "No corrected reference available.")}</p></div>
        ${renderFieldRows(result.fieldComparisons)}
      </details>
    </article>
  `;
}

function setBusy(isBusy) {
  checkBtn.disabled = isBusy;
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
  return "?";
}

function extractDoi(value = "") {
  const match = String(value).match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[.,;)\]]+$/, "").toLowerCase() : "";
}

function renderFieldRows(fields = []) {
  const important = fields.filter((field) => ["title", "authors", "year", "container", "doi", "pages"].includes(field.field));
  if (!important.length) return "";
  return `
    <div class="doi-field-grid">
      ${important.map((field) => `
        <div class="doi-field-row ${escapeHtml(field.severity || "ok")}">
          <span>${escapeHtml(field.label || field.field)}</span>
          <p>${escapeHtml(field.explanation || "Compared against matched metadata.")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
