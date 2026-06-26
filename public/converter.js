const input = document.querySelector("#converterInput");
const style = document.querySelector("#converterStyle");
const convertBtn = document.querySelector("#convertBtn");
const sampleBtn = document.querySelector("#converterSampleBtn");
const clearBtn = document.querySelector("#converterClearBtn");
const loading = document.querySelector("#converterLoading");
const empty = document.querySelector("#converterEmpty");
const results = document.querySelector("#converterResults");
const docDownload = document.querySelector("#docDownload");
const bibDownload = document.querySelector("#bibDownload");
const health = document.querySelector("#converterHealth");

const sample = `Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.

Harris, C. R., Millman, K. J., van der Walt, S. J., et al. (2020). Array programming with NumPy. Nature, 585, 357-362. https://doi.org/10.1038/s41586-020-2649-2`;

convertBtn.addEventListener("click", convert);
sampleBtn.addEventListener("click", () => {
  input.value = sample;
});
clearBtn.addEventListener("click", () => {
  input.value = "";
  reset();
});

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    health.textContent = response.ok ? "API ready" : "API issue";
  } catch {
    health.textContent = "API offline";
  }
}

async function convert() {
  const referencesText = input.value.trim();
  if (!referencesText) {
    input.focus();
    return;
  }

  setBusy(true);
  reset(false);

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referencesText, style: style.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Conversion failed");
    render(data);
  } catch (error) {
    empty.textContent = error.message;
    empty.classList.remove("hidden");
  } finally {
    setBusy(false);
  }
}

function render(job) {
  empty.classList.add("hidden");
  docDownload.href = `/api/jobs/${job.id}/export.doc`;
  bibDownload.href = `/api/jobs/${job.id}/export.bib`;
  docDownload.classList.remove("disabled");
  bibDownload.classList.remove("disabled");
  results.innerHTML = job.convertedReferences.map((item) => `
    <article class="converted-card">
      <span>${escapeHtml(item.status)}</span>
      <p>${escapeHtml(item.convertedReference)}</p>
      <small>Detected style: ${escapeHtml(item.detectedCitationStyle || "Unknown")}</small>
    </article>
  `).join("");
}

function reset(showEmpty = true) {
  results.innerHTML = "";
  empty.textContent = "Run a conversion to see formatted references.";
  empty.classList.toggle("hidden", !showEmpty);
  docDownload.classList.add("disabled");
  bibDownload.classList.add("disabled");
  docDownload.href = "#";
  bibDownload.href = "#";
}

function setBusy(isBusy) {
  convertBtn.disabled = isBusy;
  loading.classList.toggle("hidden", !isBusy);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

checkHealth();
