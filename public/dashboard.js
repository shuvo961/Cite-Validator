restoreDashboardHeader();

const profileCard = document.querySelector("#profileCard");
const historyList = document.querySelector("#historyList");
const logoutBtn = document.querySelector("#logoutBtn");
const adminLink = document.querySelector("#adminLink");
const dashboardCharts = document.querySelector("#dashboardCharts");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const deleteAccountBtn = document.querySelector("#deleteAccountBtn");
const historySearch = document.querySelector("#historySearch");
const historyFilter = document.querySelector("#historyFilter");
const accountMenu = document.querySelector("#accountMenu");
const accountMenuBtn = document.querySelector("#accountMenuBtn");
const accountMenuName = document.querySelector("#accountMenuName");
const accountMenuPanel = document.querySelector("#accountMenuPanel");
const adminMenuLink = document.querySelector("#adminMenuLink");
const openSettingsBtn = document.querySelector("#openSettingsBtn");
const closeSettingsBtn = document.querySelector("#closeSettingsBtn");
const workspaceSettings = document.querySelector("#workspaceSettings");

let historyJobs = [];

const meResponse = await fetch("/api/me", { cache: "no-store" });
const me = await meResponse.json();
if (!me.user) window.location.href = "/login";

renderProfile(me.user);
renderAccountMenu(me.user);
loadHistory();
loadSettings();

historySearch?.addEventListener("input", renderHistoryList);
historyFilter?.addEventListener("change", renderHistoryList);

logoutBtn?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
});

accountMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = accountMenu?.classList.toggle("is-open");
  accountMenuBtn.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

document.addEventListener("click", (event) => {
  if (!accountMenu?.contains(event.target)) closeAccountMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAccountMenu();
    hideSettings();
  }
});

openSettingsBtn?.addEventListener("click", () => {
  showSettings();
  closeAccountMenu();
});

closeSettingsBtn?.addEventListener("click", hideSettings);

settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(settingsForm).entries());
  localStorage.setItem("cv_default_style", values.defaultStyle || "auto");
  localStorage.setItem("cv_default_output", values.defaultOutput || "summary");
  localStorage.setItem("cv_default_export", values.defaultExport || "pdf");
  if (values.themePreference === "system") {
    localStorage.removeItem("cv_theme");
    document.documentElement.dataset.theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else if (["light", "dark"].includes(values.themePreference)) {
    localStorage.setItem("cv_theme", values.themePreference);
    document.documentElement.dataset.theme = values.themePreference;
  }
  settingsStatus.textContent = "Settings saved.";
});

deleteAccountBtn?.addEventListener("click", async () => {
  const confirmed = window.confirm("Delete your account and unlink saved reports from your profile?");
  if (!confirmed) return;
  deleteAccountBtn.disabled = true;
  const response = await fetch("/api/account", { method: "DELETE" });
  if (response.ok) window.location.href = "/";
  else {
    const data = await response.json();
    settingsStatus.textContent = data.error || "Delete failed.";
    deleteAccountBtn.disabled = false;
  }
});

function restoreDashboardHeader() {
  const header = document.querySelector(".site-header.product-nav");
  const nav = header?.querySelector(".site-nav");
  const actions = header?.querySelector(".nav-actions");
  if (!header || !nav || !actions) return;

  nav.setAttribute("aria-label", "Workspace navigation");
  nav.innerHTML = `
    <a href="/dashboard" class="active">Overview</a>
    <a href="/validate">Validator</a>
    <a href="/converter">Converter</a>
    <a href="/doi-checker">DOI Checker</a>
    <a id="adminLink" class="hidden" href="/ownershuvo">Admin</a>
  `;

  actions.querySelectorAll(".language-select, [data-auth-link], .login-link").forEach((item) => item.remove());
  if (!actions.querySelector("[data-theme-toggle]")) {
    actions.insertAdjacentHTML("afterbegin", `<button class="theme-toggle" type="button" data-theme-toggle>Dark</button>`);
  }
  if (!actions.querySelector("#accountMenu")) {
    actions.insertAdjacentHTML("beforeend", `
      <div class="account-menu" id="accountMenu">
        <button id="accountMenuBtn" class="account-menu-button" type="button" aria-expanded="false">
          <span id="accountMenuName">Account</span>
        </button>
        <div class="account-menu-panel" id="accountMenuPanel">
          <a href="/dashboard">Overview</a>
          <button id="openSettingsBtn" type="button">Settings</button>
          <a href="/validate">New validation</a>
          <a href="/converter">Converter</a>
          <a id="adminMenuLink" class="hidden" href="/ownershuvo">Admin</a>
          <button id="logoutBtn" type="button">Log out</button>
        </div>
      </div>
    `);
  }
}

async function loadHistory() {
  historyList.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;
  const response = await fetch("/api/history", { cache: "no-store" });
  const data = await response.json();
  historyJobs = data.jobs || [];
  renderCharts(historyJobs);
  renderHistoryList();
}

function renderHistoryList() {
  const jobs = filterHistory(historyJobs);
  if (!jobs.length) {
    historyList.innerHTML = `<div class="empty-state">No matching saved validations. Start with the full validator workspace.</div>`;
    return;
  }

  historyList.innerHTML = jobs.map((job) => `
    <article class="history-card workspace-report-card">
      <div class="report-card-main">
        <span class="report-date">${new Date(job.createdAt).toLocaleString()}</span>
        <strong>${Number(job.sourceCount || 0)} references · ${escapeHtml(String(job.style || "auto").toUpperCase())}</strong>
        <small>${escapeHtml(reportSummary(job))}</small>
      </div>
      <div class="report-pill-row">
        <span class="badge verified">${job.summary?.counts?.Verified || 0} verified</span>
        <span class="badge suspicious">${(job.summary?.counts?.Suspicious || 0) + (job.summary?.counts?.Unverifiable || 0)} review</span>
        <span class="badge fabricated">${job.summary?.counts?.["Likely hallucinated/fabricated"] || 0} fabricated</span>
      </div>
      <div class="history-actions">
        <a class="download" href="/reports/${job.id}">Open</a>
        <a class="download" href="/api/jobs/${job.id}/export.pdf">PDF</a>
        <a class="download" href="/api/jobs/${job.id}/export.csv">CSV</a>
        <a class="download" href="/api/jobs/${job.id}/export.doc">DOC</a>
        <a class="download" href="/api/jobs/${job.id}/export.ris">RIS</a>
      </div>
    </article>
  `).join("");
}

function filterHistory(jobs) {
  const term = (historySearch?.value || "").trim().toLowerCase();
  const filter = historyFilter?.value || "all";
  return jobs.filter((job) => {
    const counts = job.summary?.counts || {};
    const fabricated = counts["Likely hallucinated/fabricated"] || 0;
    const verified = counts.Verified || 0;
    const text = `${job.id} ${job.style} ${job.createdAt}`.toLowerCase();
    if (term && !text.includes(term)) return false;
    if (filter === "has-fabricated") return fabricated > 0;
    if (filter === "all-clean") return verified >= Math.max(Number(job.sourceCount || 0) - 1, 1);
    return true;
  });
}

function reportSummary(job) {
  const counts = job.summary?.counts || {};
  const review = (counts["Partially verified"] || 0) + (counts.Suspicious || 0) + (counts.Unverifiable || 0);
  return `${counts.Verified || 0} verified, ${review} need review, ${counts["Likely hallucinated/fabricated"] || 0} likely fabricated`;
}

function loadSettings() {
  if (!settingsForm) return;
  settingsForm.elements.defaultStyle.value = localStorage.getItem("cv_default_style") || "auto";
  settingsForm.elements.defaultOutput.value = localStorage.getItem("cv_default_output") || "summary";
  settingsForm.elements.defaultExport.value = localStorage.getItem("cv_default_export") || "pdf";
  settingsForm.elements.themePreference.value = localStorage.getItem("cv_theme") || "system";
  if (window.location.hash === "#settings") showSettings();
}

function renderCharts(jobs) {
  if (!dashboardCharts) return;
  const totals = jobs.reduce((acc, job) => {
    const counts = job.summary?.counts || {};
    acc.references += Number(job.sourceCount || 0);
    acc.verified += counts.Verified || 0;
    acc.partial += counts["Partially verified"] || 0;
    acc.suspicious += counts.Suspicious || 0;
    acc.unverifiable += counts.Unverifiable || 0;
    acc.fabricated += counts["Likely hallucinated/fabricated"] || 0;
    return acc;
  }, { references: 0, verified: 0, partial: 0, suspicious: 0, unverifiable: 0, fabricated: 0 });

  if (!jobs.length) {
    dashboardCharts.innerHTML = `
      <article class="chart-card"><h3>No reports yet</h3><p>Run a validation to fill this dashboard.</p></article>
      <article class="chart-card"><h3>Exports ready</h3><p>CSV, PDF, DOC, BibTeX, and RIS exports appear after validation.</p></article>
    `;
    return;
  }

  dashboardCharts.innerHTML = `
    <article class="chart-card">
      <h3>Reference outcomes</h3>
      ${chartBar("Verified", totals.verified, totals.references, "verified")}
      ${chartBar("Partial", totals.partial, totals.references, "partial")}
      ${chartBar("Suspicious", totals.suspicious + totals.unverifiable, totals.references, "suspicious")}
      ${chartBar("Likely fabricated", totals.fabricated, totals.references, "fabricated")}
    </article>
    <article class="chart-card">
      <h3>Workspace totals</h3>
      <div class="metric-grid">
        <span><strong>${jobs.length}</strong><small>Reports</small></span>
        <span><strong>${totals.references}</strong><small>References</small></span>
        <span><strong>${Math.round((totals.verified / Math.max(totals.references, 1)) * 100)}%</strong><small>Verified rate</small></span>
      </div>
    </article>
  `;
}

function chartBar(label, value, total, kind) {
  const width = Math.round((Number(value || 0) / Math.max(Number(total || 0), 1)) * 100);
  return `
    <div class="chart-bar ${kind}">
      <div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
      <i style="--bar-width:${width}%"></i>
    </div>
  `;
}

function renderProfile(user) {
  if (!user) return;
  if (adminLink && user.role === "admin") adminLink.classList.remove("hidden");
  profileCard.innerHTML = `
    <img src="${escapeHtml(user.avatarUrl || "/logo.svg")}" alt="">
    <div>
      <span class="profile-kicker">Signed in</span>
      <h2>${escapeHtml(user.name || "Cite Validator user")}</h2>
      <p>${escapeHtml(user.email || "")}</p>
      <span class="status-pill">${escapeHtml(user.role || "user")} account</span>
    </div>
  `;
}

function renderAccountMenu(user) {
  if (!user) return;
  if (accountMenuName) accountMenuName.textContent = user.name?.split(" ")[0] || "Account";
  if (adminMenuLink && user.role === "admin") adminMenuLink.classList.remove("hidden");
}

function closeAccountMenu() {
  accountMenu?.classList.remove("is-open");
  accountMenuBtn?.setAttribute("aria-expanded", "false");
}

function showSettings() {
  workspaceSettings?.classList.remove("hidden");
  workspaceSettings?.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", "#settings");
}

function hideSettings() {
  workspaceSettings?.classList.add("hidden");
  if (window.location.hash === "#settings") history.replaceState(null, "", window.location.pathname);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
