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

const response = await fetch("/api/admin/overview", { cache: "no-store" });
if (response.status === 401) {
  window.location.href = "/login";
} else if (response.status === 403) {
  overview.innerHTML = `<div class="empty-state">Admin access is required. Log in with the owner account.</div>`;
} else {
  const data = await response.json();
  renderOverview(data.stats);
  renderCharts(data.stats, data.sourceHealth || []);
  renderUsers(data.users || []);
  renderSources(data.sourceHealth || []);
  renderFeedback(data.feedback || []);
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
  if (!adminCharts) return;
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
      <div><strong>${escapeHtml(user.email)}</strong><span>${escapeHtml(user.name)} · ${escapeHtml(user.role)}</span></div>
      <div><span>${user.jobCount} jobs</span><span>${user.referencesChecked} references</span></div>
    </article>
  `).join("") || `<div class="empty-state">No users yet.</div>`;
}

function renderSources(items) {
  sources.innerHTML = items.map((source) => `
    <article class="history-card">
      <div><strong>${escapeHtml(source.source)}</strong><span>${source.checks} checks · ${source.candidates} candidates</span></div>
      <div><span class="badge verified">${source.ok} ok</span><span class="badge fabricated">${source.errors} errors</span></div>
    </article>
  `).join("") || `<div class="empty-state">No source checks logged yet.</div>`;
}

function renderFeedback(items) {
  feedback.innerHTML = items.map((item) => `
    <article class="history-card">
      <div><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.email || "Anonymous")} · ${new Date(item.created_at).toLocaleString()}</span></div>
      <p>${escapeHtml(item.message)}</p>
    </article>
  `).join("") || `<div class="empty-state">No feedback yet.</div>`;
}

async function renderMonitor() {
  if (!monitor) return;
  try {
    const response = await fetch("/api/admin/monitoring", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Monitoring unavailable");
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
    ].map(([label, value]) => `
      <article class="history-card monitor-card">
        <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>
      </article>
    `).join("");
  } catch (error) {
    monitor.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderReadiness(config = {}) {
  if (!productionReadiness) return;
  const items = [
    ["Google OAuth", Boolean(config.googleOAuth), "Required for real public login."],
    ["PostgreSQL", String(config.database || "").includes("postgresql"), "Recommended before public launch."],
    ["Redis cache", String(config.cache || "").includes("redis"), "Recommended for Crossref/OpenAlex caching."],
    ["Contact email", Boolean(config.contactEmail), "Improves polite metadata API requests."],
    ["Public base URL", Boolean(config.appBaseUrl), "Required for OAuth redirect URLs."]
  ];
  productionReadiness.innerHTML = items.map(([label, ok, detail]) => `
    <article class="readiness-item ${ok ? "ready" : "missing"}">
      <span>${ok ? "✓" : "!"}</span>
      <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div>
    </article>
  `).join("");
}

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
  adminResetStatus.textContent = response.ok
    ? `Password reset for ${data.user.email}.`
    : data.error || "Reset failed.";
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
      enabled: body.enabled === "on"
    })
  });
  const data = await response.json();
  announcementStatus.textContent = response.ok ? "Announcement saved." : data.error || "Save failed.";
});

async function loadAnnouncementForm() {
  if (!announcementForm) return;
  const response = await fetch("/api/announcement", { cache: "no-store" });
  const data = await response.json();
  announcementForm.elements.message.value = data.message || "";
  announcementForm.elements.enabled.checked = Boolean(data.enabled);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
