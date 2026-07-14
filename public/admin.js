const overview = document.querySelector("#adminOverview");
const users = document.querySelector("#adminUsers");
const sources = document.querySelector("#adminSources");
const feedback = document.querySelector("#adminFeedback");
const monitor = document.querySelector("#adminMonitor");
const adminCharts = document.querySelector("#adminCharts");
const adminResetForm = document.querySelector("#adminResetForm");
const adminResetStatus = document.querySelector("#adminResetStatus");
const announcementForm = document.querySelector("#announcementForm");
const announcementStatus = document.querySelector("#announcementStatus");
const productionReadiness = document.querySelector("#productionReadiness");
const adminUserManagement = document.querySelector("#adminUserManagement");
const adminUserSearch = document.querySelector("#adminUserSearch");
const adminModeration = document.querySelector("#adminModeration");
const providerControlsForm = document.querySelector("#providerControlsForm");
const rateLimitsForm = document.querySelector("#rateLimitsForm");
const auditLogs = document.querySelector("#auditLogs");
const errorExplorer = document.querySelector("#errorExplorer");

let adminData = null;

const response = await fetch("/api/admin/overview", { cache: "no-store" });
if (response.status === 401) {
  window.location.href = "/login";
} else if (response.status === 403) {
  overview.innerHTML = `<div class="empty-state">Admin access is required. Log in with the owner account.</div>`;
} else {
  adminData = await response.json();
  renderOverview(adminData.stats);
  renderCharts(adminData.stats, adminData.sourceHealth || []);
  renderUsers(adminData.users || []);
  renderUserManagement(adminData.users || []);
  renderSources(adminData.sourceHealth || []);
  renderFeedback(adminData.feedback || []);
  renderModeration(adminData.moderation || {});
  renderAuditLogs(adminData.auditLogs || []);
  renderErrors(adminData.errors || []);
  hydrateControlForms(adminData.controls || {});
  renderMonitor();
  loadAnnouncementForm();
}

function renderOverview(stats = {}) {
  overview.innerHTML = [
    ["Users", stats.totalUsers || 0],
    ["Validation jobs", stats.totalJobs || 0],
    ["References checked", stats.totalReferences || 0],
    ["Today", stats.validationsToday || 0]
  ].map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderCharts(stats = {}, sourceHealth = []) {
  const counts = stats.resultCounts || {};
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const checks = sourceHealth.reduce((sum, item) => sum + Number(item.checks || 0), 0);
  const errors = sourceHealth.reduce((sum, item) => sum + Number(item.errors || 0), 0);
  adminCharts.innerHTML = `
    <article class="chart-card">
      <h3>Result mix</h3>
      ${chartBar("Verified", counts.Verified || 0, total, "verified")}
      ${chartBar("Partial", counts["Partially verified"] || 0, total, "partial")}
      ${chartBar("Suspicious", (counts.Suspicious || 0) + (counts.Unverifiable || 0), total, "suspicious")}
      ${chartBar("Likely fabricated", counts["Likely hallucinated/fabricated"] || 0, total, "fabricated")}
    </article>
    <article class="chart-card">
      <h3>Source health</h3>
      <div class="metric-grid">
        <span><strong>${sourceHealth.length}</strong><small>Sources</small></span>
        <span><strong>${checks}</strong><small>Checks</small></span>
        <span><strong>${errors}</strong><small>Errors</small></span>
      </div>
      ${chartBar("Healthy checks", Math.max(checks - errors, 0), Math.max(checks, 1), "verified")}
      ${chartBar("Failed checks", errors, Math.max(checks, 1), "fabricated")}
    </article>
  `;
}

function renderUsers(items) {
  users.innerHTML = items.map((user) => `
    <article class="history-card">
      <div><strong>${escapeHtml(user.email)}</strong><span>${escapeHtml(user.name)} - ${escapeHtml(user.role)} - ${escapeHtml(user.status || "active")}</span></div>
      <div><span>${user.jobCount} jobs</span><span>${user.referencesChecked} references</span></div>
    </article>
  `).join("") || `<div class="empty-state">No users yet.</div>`;
}

function renderUserManagement(items) {
  if (!adminUserManagement) return;
  const term = (adminUserSearch?.value || "").toLowerCase();
  const filtered = items.filter((user) => `${user.email} ${user.name}`.toLowerCase().includes(term));
  adminUserManagement.innerHTML = filtered.map((user) => `
    <article class="history-card">
      <div><strong>${escapeHtml(user.email)}</strong><span>${escapeHtml(user.status || "active")} - ${user.jobCount} reports</span></div>
      <button class="download" data-user-status="${escapeHtml(user.id)}" data-next-status="${user.status === "suspended" ? "active" : "suspended"}" type="button">${user.status === "suspended" ? "Activate" : "Suspend"}</button>
    </article>
  `).join("") || `<div class="empty-state">No users match.</div>`;
}

function renderSources(items) {
  sources.innerHTML = items.map((source) => `
    <article class="history-card">
      <div><strong>${escapeHtml(source.source)}</strong><span>${source.checks} checks - ${source.candidates} candidates</span></div>
      <div><span class="badge verified">${source.ok} ok</span><span class="badge fabricated">${source.errors} errors</span></div>
    </article>
  `).join("") || `<div class="empty-state">No source checks logged yet.</div>`;
}

function renderFeedback(items) {
  feedback.innerHTML = items.map((item) => `
    <article class="history-card">
      <div><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.email || "Anonymous")} - ${new Date(item.created_at).toLocaleString()} - ${escapeHtml(item.status || "open")}</span></div>
      <p>${escapeHtml(item.message)}</p>
      <button class="download" data-feedback-status="${escapeHtml(item.id)}" type="button">Mark resolved</button>
    </article>
  `).join("") || `<div class="empty-state">No feedback yet.</div>`;
}

function renderModeration(data) {
  adminModeration.innerHTML = (data.queue || []).map((item) => `
    <article class="history-card">
      <div><strong>${escapeHtml(item.email)}</strong><span>${item.reports} reports - ${item.references} references - ${escapeHtml(item.status || "active")}</span></div>
    </article>
  `).join("") || `<div class="empty-state">No moderation items.</div>`;
}

function renderAuditLogs(items) {
  auditLogs.innerHTML = items.map((item) => `
    <article class="history-card">
      <div><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.email || "system")} - ${new Date(item.created_at).toLocaleString()}</span></div>
    </article>
  `).join("") || `<div class="empty-state">No audit logs.</div>`;
}

function renderErrors(items) {
  errorExplorer.innerHTML = items.map((item) => `
    <article class="history-card">
      <div><strong>${escapeHtml(item.method)} ${escapeHtml(item.path)}</strong><span>${item.status} - ${new Date(item.at).toLocaleString()}</span></div>
    </article>
  `).join("") || `<div class="empty-state">No recent errors.</div>`;
}

async function renderMonitor() {
  const response = await fetch("/api/admin/monitoring", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    monitor.innerHTML = `<div class="empty-state">${escapeHtml(data.error || "Monitoring unavailable")}</div>`;
    return;
  }
  const config = data.configuration || {};
  const runtime = data.runtime || {};
  renderReadiness(config);
  monitor.innerHTML = [
    ["Database", config.database],
    ["Cache", config.cache],
    ["Google OAuth", config.googleOAuth ? "configured" : "not configured"],
    ["Contact email", config.contactEmail ? "configured" : "missing"],
    ["Uptime", `${runtime.uptimeSeconds || 0}s`],
    ["API requests", runtime.apiRequests || 0],
    ["Errors", runtime.errors || 0],
    ["Node", runtime.node || "unknown"]
  ].map(([label, value]) => `<article class="history-card monitor-card"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div></article>`).join("");
}

function renderReadiness(config = {}) {
  const items = [
    ["Google OAuth", Boolean(config.googleOAuth), "Required for real public login."],
    ["PostgreSQL", String(config.database || "").includes("postgresql"), "Recommended before public launch."],
    ["Redis cache", String(config.cache || "").includes("redis"), "Recommended for Crossref/OpenAlex caching."],
    ["Contact email", Boolean(config.contactEmail), "Improves polite metadata API requests."],
    ["Public base URL", Boolean(config.appBaseUrl), "Required for OAuth redirect URLs."]
  ];
  productionReadiness.innerHTML = items.map(([label, ok, detail]) => `
    <article class="readiness-item ${ok ? "ready" : "missing"}">
      <span>${ok ? "OK" : "!"}</span>
      <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div>
    </article>
  `).join("");
}

function hydrateControlForms(controls = {}) {
  const providers = controls.providers || {};
  for (const [key, value] of Object.entries(providers)) {
    if (providerControlsForm?.elements[key]) providerControlsForm.elements[key].checked = Boolean(value);
  }
  const limits = controls.limits || {};
  if (rateLimitsForm) {
    rateLimitsForm.elements.per_minute.value = limits.perMinute || "";
    rateLimitsForm.elements.sync_validation.value = limits.syncValidationLimit || "";
    rateLimitsForm.elements.free_reports.value = limits.freeReports || "";
  }
}

adminUserSearch?.addEventListener("input", () => renderUserManagement(adminData?.users || []));

document.addEventListener("click", async (event) => {
  const userButton = event.target.closest("[data-user-status]");
  if (userButton) {
    await fetch("/api/admin/user-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: userButton.dataset.userStatus, status: userButton.dataset.nextStatus })
    });
    window.location.reload();
  }
  const feedbackButton = event.target.closest("[data-feedback-status]");
  if (feedbackButton) {
    await fetch("/api/admin/feedback-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: feedbackButton.dataset.feedbackStatus, status: "resolved" })
    });
    feedbackButton.textContent = "Resolved";
  }
});

adminResetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminResetStatus.textContent = "Resetting...";
  const body = Object.fromEntries(new FormData(adminResetForm).entries());
  const response = await fetch("/api/admin/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  adminResetStatus.textContent = response.ok ? `Password reset for ${data.user.email}.` : data.error || "Reset failed.";
  if (response.ok) adminResetForm.reset();
});

announcementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  announcementStatus.textContent = "Saving...";
  const body = Object.fromEntries(new FormData(announcementForm).entries());
  const response = await fetch("/api/admin/announcement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: body.message || "",
      enabled: body.enabled === "on",
      severity: body.severity || "info",
      startsAt: body.startsAt ? new Date(body.startsAt).toISOString() : "",
      endsAt: body.endsAt ? new Date(body.endsAt).toISOString() : ""
    })
  });
  const data = await response.json();
  announcementStatus.textContent = response.ok ? "Announcement saved." : data.error || "Save failed.";
});

providerControlsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {};
  for (const element of providerControlsForm.elements) {
    if (element.name) body[element.name] = element.checked;
  }
  await fetch("/api/admin/provider-controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
});

rateLimitsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await fetch("/api/admin/rate-limits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(rateLimitsForm).entries()))
  });
});

async function loadAnnouncementForm() {
  const data = adminData?.announcement || {};
  announcementForm.elements.message.value = data.message || "";
  announcementForm.elements.enabled.checked = Boolean(data.enabled);
  announcementForm.elements.severity.value = data.severity || "info";
  announcementForm.elements.startsAt.value = toLocalDateTime(data.startsAt);
  announcementForm.elements.endsAt.value = toLocalDateTime(data.endsAt);
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function chartBar(label, value, total, kind) {
  const width = Math.round((Number(value || 0) / Math.max(Number(total || 0), 1)) * 100);
  return `<div class="chart-bar ${kind}"><div><span>${escapeHtml(label)}</span><strong>${value}</strong></div><i style="--bar-width:${width}%"></i></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
