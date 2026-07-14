restoreDashboardHeader();

const isSettingsPage = location.pathname.replace(/\.html$/, "") === "/settings";
const profileCard = document.querySelector("#profileCard");
const historyList = document.querySelector("#historyList");
const dashboardCharts = document.querySelector("#dashboardCharts");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const passwordForm = document.querySelector("#passwordForm");
const passwordStatus = document.querySelector("#passwordStatus");
const deleteAccountBtn = document.querySelector("#deleteAccountBtn");
const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
const historyActionStatus = document.querySelector("#historyActionStatus");
const historySearch = document.querySelector("#historySearch");
const historyFilter = document.querySelector("#historyFilter");
const folderFilter = document.querySelector("#folderFilter");
const accountMenu = document.querySelector("#accountMenu");
const accountMenuBtn = document.querySelector("#accountMenuBtn");
const accountMenuName = document.querySelector("#accountMenuName");
const adminLink = document.querySelector("#adminLink");
const adminMenuLink = document.querySelector("#adminMenuLink");
const workspaceSettings = document.querySelector("#workspaceSettings");
const settingsAccountCard = document.querySelector("#settingsAccountCard");
const settingsReportCount = document.querySelector("#settingsReportCount");
const settingsReferenceCount = document.querySelector("#settingsReferenceCount");
const themeToggle = document.querySelector("[data-theme-toggle]");
const workspaceTools = {
  folderForm: document.querySelector("#folderForm"),
  folderAssignForm: document.querySelector("#folderAssignForm"),
  folderAssignStatus: document.querySelector("#folderAssignStatus"),
  folders: document.querySelector("#projectFolders"),
  repairQueue: document.querySelector("#repairQueue"),
  compareForm: document.querySelector("#compareForm"),
  comparisonResult: document.querySelector("#comparisonResult"),
  buildBibliographyBtn: document.querySelector("#buildBibliographyBtn"),
  bibliographyOutput: document.querySelector("#bibliographyOutput"),
  presetForm: document.querySelector("#presetForm"),
  presets: document.querySelector("#exportPresets"),
  sourceTimeline: document.querySelector("#sourceTimeline"),
  noteForm: document.querySelector("#noteForm"),
  notes: document.querySelector("#reportNotes"),
  shareForm: document.querySelector("#shareForm"),
  shares: document.querySelector("#shareLinks"),
  uploadRecordForm: document.querySelector("#uploadRecordForm"),
  uploads: document.querySelector("#uploadLibrary"),
  notifications: document.querySelector("#notificationCenter"),
  advancedPreferenceForm: document.querySelector("#advancedPreferenceForm")
};

let historyJobs = [];
let currentUser = null;
let workspaceData = null;

const meResponse = await fetch("/api/me", { cache: "no-store" });
const me = await meResponse.json();
if (!me.user) window.location.href = "/login";

currentUser = me.user;
applyDashboardMode();
renderProfile(currentUser);
renderAccountMenu(currentUser);
wireDashboardThemeToggle();
loadSettings();
await loadHistory();
await loadWorkspace();

historySearch?.addEventListener("input", renderHistoryList);
historyFilter?.addEventListener("change", renderHistoryList);
folderFilter?.addEventListener("change", renderHistoryList);
wireWorkspaceTools();

accountMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = accountMenu?.classList.toggle("is-open");
  accountMenuBtn.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target.closest?.("[data-logout]")) {
    event.preventDefault();
    logout();
    return;
  }
  if (!accountMenu?.contains(target)) closeAccountMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAccountMenu();
});

settingsForm?.addEventListener("submit", async (event) => {
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
  await fetch("/api/workspace/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values)
  });
  settingsStatus.textContent = "Preferences saved.";
});

passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(passwordForm).entries());
  if (values.password !== values.confirmPassword) {
    passwordStatus.textContent = "Passwords do not match.";
    return;
  }
  passwordStatus.textContent = "Updating password...";
  const response = await fetch("/api/account/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: values.password })
  });
  const data = await response.json();
  passwordStatus.textContent = response.ok ? "Password updated." : data.error || "Password update failed.";
  if (response.ok) passwordForm.reset();
});

clearHistoryBtn?.addEventListener("click", async () => {
  if (!confirm("Clear all saved validation history for this account?")) return;
  historyActionStatus.textContent = "Clearing history...";
  const response = await fetch("/api/history", { method: "DELETE" });
  const data = await response.json();
  if (response.ok) {
    historyJobs = [];
    renderCharts(historyJobs);
    renderHistoryList();
    renderSettingsStats();
    historyActionStatus.textContent = `History cleared. Removed ${data.deleted || 0} saved reports.`;
  } else {
    historyActionStatus.textContent = data.error || "Could not clear history.";
  }
});

deleteAccountBtn?.addEventListener("click", async () => {
  if (!confirm("Delete your account and unlink saved reports from your profile?")) return;
  deleteAccountBtn.disabled = true;
  const response = await fetch("/api/account", { method: "DELETE" });
  if (response.ok) window.location.href = "/";
  else {
    const data = await response.json();
    settingsStatus.textContent = data.error || "Delete failed.";
    deleteAccountBtn.disabled = false;
  }
});

historyList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-corrected]");
  if (!button) return;
  const job = historyJobs.find((item) => item.id === button.dataset.jobId);
  if (!job) return;
  const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/corrected.txt`, { cache: "no-store" });
  const text = response.ok ? await response.text() : correctedText(job);
  await navigator.clipboard.writeText(text);
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Copy corrected";
  }, 1400);
});

function restoreDashboardHeader() {
  const header = document.querySelector(".site-header.product-nav");
  const nav = header?.querySelector(".site-nav");
  const actions = header?.querySelector(".nav-actions");
  if (!header || !nav || !actions) return;

  nav.setAttribute("aria-label", "Workspace navigation");
  nav.innerHTML = `
    <a href="/dashboard">Overview</a>
    <a href="/validate">Validator</a>
    <a href="/converter">Converter</a>
    <a href="/doi-checker">DOI Checker</a>
    <a id="adminLink" class="hidden" href="/ownershuvo">Admin</a>
  `;

  actions.innerHTML = `
    <button class="theme-toggle" type="button" data-theme-toggle>Dark</button>
    <div class="account-menu" id="accountMenu">
      <button id="accountMenuBtn" class="account-menu-button" type="button" aria-expanded="false">
        <span id="accountMenuName">Account</span>
      </button>
      <div class="account-menu-panel" id="accountMenuPanel">
        <a href="/dashboard">Overview</a>
        <a href="/settings">Settings</a>
        <a href="/validate">New validation</a>
        <a href="/converter">Converter</a>
        <a id="adminMenuLink" class="hidden" href="/ownershuvo">Admin</a>
        <button data-logout type="button">Log out</button>
      </div>
    </div>
  `;
}

function applyDashboardMode() {
  document.body.classList.toggle("settings-mode", isSettingsPage);
  document.body.classList.toggle("dashboard-mode", !isSettingsPage);
  workspaceSettings?.classList.toggle("hidden", !isSettingsPage);
  document.querySelectorAll(".dashboard-page > section:not(#workspaceSettings)").forEach((section) => {
    section.classList.toggle("hidden", isSettingsPage);
  });
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const path = new URL(link.href, location.origin).pathname;
    link.classList.toggle("active", path === (isSettingsPage ? "/settings" : "/dashboard"));
  });
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

async function loadHistory() {
  if (historyList) historyList.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;
  const response = await fetch("/api/history", { cache: "no-store" });
  const data = await response.json();
  historyJobs = data.jobs || [];
  renderCharts(historyJobs);
  renderHistoryList();
  renderSettingsStats();
}

function renderHistoryList() {
  if (!historyList) return;
  const jobs = filterHistory(historyJobs);
  if (!jobs.length) {
    historyList.innerHTML = `<div class="empty-state">No matching saved validations. Start with the full validator workspace.</div>`;
    return;
  }

  historyList.innerHTML = jobs.map((job) => `
    <article class="history-card workspace-report-card">
      <div class="report-card-main">
        <span class="report-date">${new Date(job.createdAt).toLocaleString()}</span>
        <strong>${Number(job.sourceCount || 0)} references - ${escapeHtml(String(job.style || "auto").toUpperCase())}</strong>
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
        <button class="download" data-copy-corrected data-job-id="${job.id}" type="button">Copy corrected</button>
        <a class="download" href="/api/jobs/${job.id}/corrected.txt">Corrected TXT</a>
      </div>
    </article>
  `).join("");
}

async function loadWorkspace() {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) return;
  workspaceData = await response.json();
  renderWorkspaceTools();
}

function wireWorkspaceTools() {
  workspaceTools.folderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await postWorkspace("/api/workspace/folders", Object.fromEntries(new FormData(workspaceTools.folderForm).entries()));
    workspaceTools.folderForm.reset();
  });
  workspaceTools.folderAssignForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await fetch("/api/workspace/assign-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(workspaceTools.folderAssignForm).entries()))
    });
    const data = await response.json();
    workspaceTools.folderAssignStatus.textContent = response.ok ? "Report assigned." : data.error || "Assignment failed.";
    if (response.ok) {
      await loadHistory();
      await loadWorkspace();
    }
  });
  workspaceTools.presetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(workspaceTools.presetForm).entries());
    await postWorkspace("/api/workspace/presets", { name: values.name, style: localStorage.getItem("cv_default_style") || "auto", formats: String(values.formats || "").split(",").map((item) => item.trim()).filter(Boolean) });
    workspaceTools.presetForm.reset();
  });
  workspaceTools.noteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await postWorkspace("/api/workspace/notes", Object.fromEntries(new FormData(workspaceTools.noteForm).entries()));
    workspaceTools.noteForm.reset();
  });
  workspaceTools.shareForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await postWorkspace("/api/workspace/share-links", Object.fromEntries(new FormData(workspaceTools.shareForm).entries()));
  });
  workspaceTools.uploadRecordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(workspaceTools.uploadRecordForm);
    const file = formData.get("file");
    const contentText = file?.size ? await readUploadText(file) : "";
    const name = String(formData.get("name") || file?.name || "Imported bibliography.txt");
    await postWorkspace("/api/workspace/uploads", {
      name,
      type: file?.type || inferUploadType(name),
      size: file?.size || contentText.length,
      contentText
    });
    workspaceTools.uploadRecordForm.reset();
  });
  workspaceTools.compareForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await fetch("/api/workspace/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(workspaceTools.compareForm).entries()))
    });
    const data = await response.json();
    workspaceTools.comparisonResult.innerHTML = response.ok ? renderComparison(data.comparison) : `<div class="empty-state">${escapeHtml(data.error || "Compare failed")}</div>`;
  });
  workspaceTools.buildBibliographyBtn?.addEventListener("click", async () => {
    const response = await fetch("/api/workspace/bibliography", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobIds: filterHistory(historyJobs).map((job) => job.id) })
    });
    const data = await response.json();
    workspaceTools.bibliographyOutput.value = data.bibliography || "";
  });
  workspaceTools.advancedPreferenceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(workspaceTools.advancedPreferenceForm).entries());
    await postWorkspace("/api/workspace/preferences", values);
  });
}

document.addEventListener("click", async (event) => {
  const copyShare = event.target.closest("[data-copy-share]");
  if (copyShare) {
    await navigator.clipboard?.writeText(copyShare.dataset.copyShare);
    copyShare.textContent = "Copied";
    return;
  }
  const revokeShare = event.target.closest("[data-revoke-share]");
  if (revokeShare) {
    await fetch("/api/workspace/share-links/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shareId: revokeShare.dataset.revokeShare })
    });
    await loadWorkspace();
  }
});

function readUploadText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsText(file);
  });
}

function inferUploadType(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".bib")) return "application/x-bibtex";
  if (lower.endsWith(".ris")) return "application/x-research-info-systems";
  if (lower.endsWith(".csv")) return "text/csv";
  return "text/plain";
}

async function postWorkspace(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.ok) await loadWorkspace();
}

function renderWorkspaceTools() {
  const workspace = workspaceData?.workspace || {};
  const optionHtml = historyJobs.map((job) => `<option value="${job.id}">${new Date(job.createdAt).toLocaleDateString()} - ${job.sourceCount} refs</option>`).join("");
  document.querySelectorAll("#compareForm select, #noteForm select, #shareForm select").forEach((select) => {
    select.innerHTML = optionHtml || `<option value="">No reports</option>`;
  });
  document.querySelectorAll("#folderAssignForm select[name='jobId']").forEach((select) => {
    select.innerHTML = optionHtml || `<option value="">No reports</option>`;
  });
  document.querySelectorAll("#folderAssignForm select[name='folderId']").forEach((select) => {
    select.innerHTML = (workspace.folders || []).map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("") || `<option value="">No folders</option>`;
  });
  if (folderFilter) {
    const selected = folderFilter.value || "all";
    folderFilter.innerHTML = `<option value="all">All folders</option><option value="">Unfiled reports</option>${(workspace.folders || []).map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("")}`;
    folderFilter.value = [...folderFilter.options].some((option) => option.value === selected) ? selected : "all";
  }
  renderMiniList(workspaceTools.folders, workspace.folders, (item) => `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description || "Project folder")}</small>`);
  renderMiniList(workspaceTools.presets, workspace.presets, (item) => `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.style)} - ${escapeHtml(item.formats_json || "[]")}</small>`);
  renderMiniList(workspaceTools.notes, workspace.notes, (item) => `<strong>${escapeHtml(item.job_id)}</strong><small>${escapeHtml(item.note)}</small>`);
  renderMiniList(workspaceTools.shares, workspace.shares, (item) => {
    const url = `${location.origin}/shared/${item.token}`;
    return `<strong>${escapeHtml(item.job_id)}</strong><small><a href="/shared/${escapeHtml(item.token)}">Open</a> - expires ${new Date(item.expires_at).toLocaleDateString()}</small><span class="mini-actions"><button class="download" data-copy-share="${escapeHtml(url)}" type="button">Copy</button><button class="download danger-button" data-revoke-share="${escapeHtml(item.id)}" type="button">Revoke</button></span>`;
  });
  renderMiniList(workspaceTools.uploads, workspace.uploads, (item) => `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type)} - ${formatBytes(item.size)} - ${new Date(item.created_at).toLocaleDateString()}</small><a class="download" href="/api/workspace/uploads/${escapeHtml(item.id)}/download">Download</a>`);
  renderMiniList(workspaceTools.repairQueue, workspaceData?.repairQueue, (item) => `<strong>${escapeHtml(item.status)} - #${item.index}</strong><small>${escapeHtml(item.reference)}</small>`);
  renderMiniList(workspaceTools.sourceTimeline, workspaceData?.sourceTimeline, (item) => `<strong>${escapeHtml(item.source)}</strong><small>${escapeHtml(item.status)} - ${Math.round(Number(item.confidence || 0) * 100)}%</small>`);
  renderMiniList(workspaceTools.notifications, workspaceData?.notifications, (item) => `<strong>${escapeHtml(item.type)}</strong><small>${escapeHtml(item.message)}</small>`);
}

function renderMiniList(node, items = [], render) {
  if (!node) return;
  node.innerHTML = items?.length
    ? items.slice(0, 8).map((item) => `<div class="mini-list-item">${render(item)}</div>`).join("")
    : `<div class="empty-state">No items yet.</div>`;
}

function renderComparison(comparison) {
  return Object.entries(comparison.counts || {}).map(([key, item]) => `
    <div class="mini-list-item"><strong>${escapeHtml(key)}</strong><small>${item.before} to ${item.after} (${item.delta >= 0 ? "+" : ""}${item.delta})</small></div>
  `).join("") || `<div class="empty-state">No comparison data.</div>`;
}

function filterHistory(jobs) {
  const term = (historySearch?.value || "").trim().toLowerCase();
  const filter = historyFilter?.value || "all";
  const folder = folderFilter?.value ?? "all";
  return jobs.filter((job) => {
    const counts = job.summary?.counts || {};
    const fabricated = counts["Likely hallucinated/fabricated"] || 0;
    const verified = counts.Verified || 0;
    const text = `${job.id} ${job.style} ${job.createdAt} ${reportSummary(job)}`.toLowerCase();
    if (term && !text.includes(term)) return false;
    if (folder !== "all" && String(job.folderId || "") !== folder) return false;
    if (filter === "has-fabricated") return fabricated > 0;
    if (filter === "all-clean") return verified >= Math.max(Number(job.sourceCount || 0) - 1, 1);
    return true;
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reportSummary(job) {
  const counts = job.summary?.counts || {};
  const review = (counts["Partially verified"] || 0) + (counts.Suspicious || 0) + (counts.Unverifiable || 0);
  return `${counts.Verified || 0} verified, ${review} need review, ${counts["Likely hallucinated/fabricated"] || 0} likely fabricated`;
}

function loadSettings() {
  if (settingsForm) {
    settingsForm.elements.defaultStyle.value = localStorage.getItem("cv_default_style") || "auto";
    settingsForm.elements.defaultOutput.value = localStorage.getItem("cv_default_output") || "summary";
    settingsForm.elements.defaultExport.value = localStorage.getItem("cv_default_export") || "pdf";
    settingsForm.elements.themePreference.value = localStorage.getItem("cv_theme") || "system";
  }
  if (settingsAccountCard && currentUser) {
    settingsAccountCard.innerHTML = `
      <img src="${escapeHtml(currentUser.avatarUrl || "/logo.svg")}" alt="">
      <div>
        <strong>${escapeHtml(currentUser.name || "Cite Validator user")}</strong>
        <span>${escapeHtml(currentUser.email || "")}</span>
        <small>${escapeHtml(currentUser.provider || "password")} login - ${escapeHtml(currentUser.role || "user")} account</small>
      </div>
    `;
  }
}

function renderCharts(jobs) {
  if (!dashboardCharts) return;
  const totals = collectTotals(jobs);
  if (!jobs.length) {
    dashboardCharts.innerHTML = `
      <article class="chart-card"><h3>No reports yet</h3><p>Run a validation to fill this dashboard.</p></article>
      <article class="chart-card"><h3>Exports ready</h3><p>CSV, PDF, DOC, BibTeX, RIS, and corrected text exports appear after validation.</p></article>
    `;
    return;
  }

  dashboardCharts.innerHTML = `
    <article class="chart-card">
      <h3>Reference outcomes</h3>
      ${chartBar("Verified", totals.verified, totals.references, "verified")}
      ${chartBar("Partial", totals.partial, totals.references, "partial")}
      ${chartBar("Needs review", totals.suspicious + totals.unverifiable, totals.references, "suspicious")}
      ${chartBar("Likely fabricated", totals.fabricated, totals.references, "fabricated")}
    </article>
    <article class="chart-card chart-card-rich">
      <h3>Workspace totals</h3>
      <div class="metric-grid">
        <span><strong>${jobs.length}</strong><small>Reports</small></span>
        <span><strong>${totals.references}</strong><small>References</small></span>
        <span><strong>${Math.round((totals.verified / Math.max(totals.references, 1)) * 100)}%</strong><small>Verified rate</small></span>
      </div>
      <div class="donut-chart" style="--verified:${Math.round((totals.verified / Math.max(totals.references, 1)) * 100)}%; --review:${Math.round(((totals.partial + totals.suspicious + totals.unverifiable) / Math.max(totals.references, 1)) * 100)}%;">
        <strong>${Math.round((totals.verified / Math.max(totals.references, 1)) * 100)}%</strong>
        <span>verified</span>
      </div>
    </article>
    <article class="chart-card wide-chart-card">
      <h3>Recent activity</h3>
      <div class="timeline-chart">
        ${jobs.slice(0, 8).map((job) => `<span style="--height:${Math.max(18, Math.min(100, Number(job.sourceCount || 1) * 18))}%"><em>${Number(job.sourceCount || 0)}</em></span>`).join("")}
      </div>
    </article>
  `;
}

function renderSettingsStats() {
  const totals = collectTotals(historyJobs);
  if (settingsReportCount) settingsReportCount.textContent = String(historyJobs.length);
  if (settingsReferenceCount) settingsReferenceCount.textContent = String(totals.references);
}

function collectTotals(jobs) {
  return jobs.reduce((acc, job) => {
    const counts = job.summary?.counts || {};
    acc.references += Number(job.sourceCount || 0);
    acc.verified += counts.Verified || 0;
    acc.partial += counts["Partially verified"] || 0;
    acc.suspicious += counts.Suspicious || 0;
    acc.unverifiable += counts.Unverifiable || 0;
    acc.fabricated += counts["Likely hallucinated/fabricated"] || 0;
    return acc;
  }, { references: 0, verified: 0, partial: 0, suspicious: 0, unverifiable: 0, fabricated: 0 });
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
  if (!user || !profileCard) return;
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

function wireDashboardThemeToggle() {
  if (!themeToggle) return;
  const applyLabel = () => {
    themeToggle.textContent = document.documentElement.dataset.theme === "dark" ? "Light" : "Dark";
  };
  applyLabel();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("cv_theme", next);
    applyLabel();
  });
}

function closeAccountMenu() {
  accountMenu?.classList.remove("is-open");
  accountMenuBtn?.setAttribute("aria-expanded", "false");
}

function correctedText(job) {
  const counts = job.summary?.counts || {};
  return [
    `Cite Validator corrected citations`,
    `Report: ${job.id}`,
    `Created: ${new Date(job.createdAt).toLocaleString()}`,
    `Summary: ${reportSummary(job)}`,
    "",
    `Use the report export files for full field evidence. Corrected citations are available in PDF/DOC/CSV exports when trusted metadata exists.`,
    `Verified references: ${counts.Verified || 0}`
  ].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
