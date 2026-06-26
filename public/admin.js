const overview = document.querySelector("#adminOverview");
const users = document.querySelector("#adminUsers");
const sources = document.querySelector("#adminSources");
const feedback = document.querySelector("#adminFeedback");

const response = await fetch("/api/admin/overview", { cache: "no-store" });
if (response.status === 401) window.location.href = "/login.html";
if (response.status === 403) {
  overview.innerHTML = `<div class="empty-state">Admin access is required. Add your email to ADMIN_EMAILS and log in again.</div>`;
} else {
  const data = await response.json();
  renderOverview(data.stats);
  renderUsers(data.users || []);
  renderSources(data.sourceHealth || []);
  renderFeedback(data.feedback || []);
}

function renderOverview(stats) {
  overview.innerHTML = [
    ["Users", stats.totalUsers],
    ["Validation jobs", stats.totalJobs],
    ["References checked", stats.totalReferences],
    ["Today", stats.validationsToday]
  ].map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`).join("");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
