const input = document.querySelector("#fakeInput");
const checkBtn = document.querySelector("#fakeCheckBtn");
const sampleBtn = document.querySelector("#fakeSampleBtn");
const loading = document.querySelector("#fakeLoading");
const empty = document.querySelector("#fakeEmpty");
const results = document.querySelector("#fakeResults");

const sample = `Smith, J., & Doe, A. (2021). Quantum blockchain learning for universal citation truth. Journal of Imaginary Informatics, 44(9), 1001-1019. https://doi.org/10.9999/fake.doi.12345

Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.`;

checkBtn?.addEventListener("click", checkFakeCitations);
sampleBtn?.addEventListener("click", () => {
  input.value = sample;
});

async function checkFakeCitations() {
  const referencesText = input.value.trim();
  if (!referencesText) {
    input.focus();
    return;
  }
  setBusy(true);
  results.innerHTML = "";
  empty.classList.add("hidden");
  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText, style: "auto" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Detection failed");
    render(data);
  } catch (error) {
    empty.textContent = error.message;
    empty.classList.remove("hidden");
  } finally {
    setBusy(false);
  }
}

function render(job) {
  loading?.classList.add("hidden");
  results.innerHTML = job.results.map((result) => {
    const klass = statusClass(result.status);
    const source = result.matchedSource?.sourceName || "No trusted source matched";
    const confidence = Math.round(result.confidenceScore * 100);
    const risk = Math.round(result.hallucinationRiskScore * 100);
    const chips = summarizeIssues(result).map((issue) => `<span>${escapeHtml(issue)}</span>`).join("");
    return `
      <article class="result-card risk-result-card ${klass}">
        <div class="result-header">
          <div class="status-icon ${klass}" aria-hidden="true">${statusSymbol(result.status)}</div>
          <div>
            <h3>Reference #${result.index}</h3>
            <p class="source-line">${escapeHtml(result.status)} · ${escapeHtml(source)}</p>
            ${chips ? `<div class="mismatch-chips">${chips}</div>` : ""}
          </div>
          <div class="score-stack">
            <span class="risk-score ${klass}">${risk}% risk</span>
            <span class="badge ${klass}">${confidence}% confidence</span>
          </div>
        </div>
        <details class="full-report">
          <summary>Why was this flagged?</summary>
          <div class="risk-report-grid">
            <div class="risk-report-note">
              <span>Assessment</span>
              <p>${escapeHtml(result.summaryOutput || result.briefSummary || "")}</p>
            </div>
            <div class="risk-report-note">
              <span>Recommended action</span>
              <p>${escapeHtml(actionLabel(result.recommendedAction))}</p>
            </div>
          </div>
          <div class="reference-block"><h4>Original reference</h4><p>${escapeHtml(result.originalReference)}</p></div>
          ${renderIssueList(result)}
          <div class="reference-block corrected-wrap"><h4>Safe correction</h4><p>${escapeHtml(result.correctedReference || "No safe corrected reference is available for this risk level.")}</p></div>
          ${result.matchedSource?.url ? `<div class="risk-report-actions"><a href="${result.matchedSource.url}" target="_blank" rel="noreferrer">Open matched source</a></div>` : ""}
        </details>
      </article>
    `;
  }).join("");
}

function renderIssueList(result) {
  const issues = (result.mismatches || []).filter(Boolean);
  if (!issues.length) {
    return `<div class="risk-issue-list empty"><strong>No hard mismatches returned</strong><span>Use the matched source and confidence score to decide whether manual review is needed.</span></div>`;
  }
  return `
    <div class="risk-issue-list">
      <strong>Key issues</strong>
      ${issues.slice(0, 5).map((issue) => `<span>${escapeHtml(issue)}</span>`).join("")}
    </div>
  `;
}

function actionLabel(action = "") {
  const labels = {
    use: "Safe to use after normal citation review.",
    correct: "Use the corrected metadata or verify the disputed field before submission.",
    remove: "Do not use this citation unless you can confirm it from an authoritative source.",
    review: "Review manually before using this citation."
  };
  return labels[String(action).toLowerCase()] || "Review manually before using this citation.";
}

function summarizeIssues(result) {
  const fields = (result.fieldComparisons || [])
    .filter((field) => field.severity === "mismatch")
    .map((field) => field.label || field.field);
  const text = (result.mismatches || [])
    .map((item) => String(item).replace(/^(.{1,48}).*$/, "$1").trim());
  return [...new Set([...fields, ...text])].filter(Boolean).slice(0, 3);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
