const profileCard = document.querySelector("#profileCard");
const historyList = document.querySelector("#historyList");
const logoutBtn = document.querySelector("#logoutBtn");
const adminLink = document.querySelector("#adminLink");

const meResponse = await fetch("/api/me", { cache: "no-store" });
const me = await meResponse.json();
if (!me.user) window.location.href = "/login.html";

renderProfile(me.user);
loadHistory();

logoutBtn?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
});

async function loadHistory() {
  const response = await fetch("/api/history", { cache: "no-store" });
  const data = await response.json();
  const jobs = data.jobs || [];
  if (!jobs.length) {
    historyList.innerHTML = `<div class="empty-state">No saved validations yet. Start with the full validator workspace.</div>`;
    return;
  }
  historyList.innerHTML = jobs.map((job) => `
    <article class="history-card">
      <div>
        <strong>${new Date(job.createdAt).toLocaleString()}</strong>
        <span>${job.sourceCount} references · ${job.style.toUpperCase()}</span>
      </div>
      <div>
        <span class="badge verified">${job.summary.counts?.Verified || 0} verified</span>
        <span class="badge suspicious">${(job.summary.counts?.Suspicious || 0) + (job.summary.counts?.Unverifiable || 0)} review</span>
      </div>
      <a class="download" href="/api/jobs/${job.id}/export.pdf">PDF</a>
    </article>
  `).join("");
}

function renderProfile(user) {
  if (adminLink && user.role === "admin") adminLink.classList.remove("hidden");
  profileCard.innerHTML = `
    <img src="${escapeHtml(user.avatarUrl || "/logo.svg")}" alt="">
    <div>
      <h2>${escapeHtml(user.name)}</h2>
      <p>${escapeHtml(user.email)}</p>
      <span class="status-pill">${escapeHtml(user.role)} account</span>
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
