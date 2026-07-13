const OWNER_EMAIL = "shovon961@gmail.com";
const statusBox = document.querySelector("#ownerStatus");
const loginForm = document.querySelector("#ownerLoginForm");
const resetRequestForm = document.querySelector("#ownerResetRequestForm");
const resetForm = document.querySelector("#ownerResetForm");
const tabs = document.querySelectorAll("[data-owner-tab]");
const panels = document.querySelectorAll("[data-owner-panel]");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showPanel(tab.dataset.ownerTab));
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(loginForm).entries());
  body.email = OWNER_EMAIL;
  const response = await postJson("/api/auth/login", body);
  if (!response.ok) {
    showStatus(response.data.error || "Admin login failed.");
    return;
  }
  if (response.data.user?.role !== "admin") {
    showStatus("This account is not authorized for admin access.");
    return;
  }
  window.location.href = "/admin";
});

resetRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await postJson("/api/auth/request-reset", { email: OWNER_EMAIL });
  if (!response.ok) {
    showStatus(response.data.error || "Reset request failed.");
    return;
  }
  resetForm?.classList.remove("hidden");
  showStatus(response.data.resetToken ? `Reset token: ${response.data.resetToken}` : response.data.message, "info");
});

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(resetForm).entries());
  body.email = OWNER_EMAIL;
  const response = await postJson("/api/auth/reset-password", body);
  if (!response.ok) {
    showStatus(response.data.error || "Reset failed.");
    return;
  }
  showStatus("Admin password updated. Login now.", "info");
  showPanel("login");
});

function showPanel(name) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.ownerTab === name));
  panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.ownerPanel !== name));
  if (name !== "reset") resetForm?.classList.add("hidden");
  showStatus("", "clear");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { ok: response.ok, data };
}

function showStatus(message, type = "error") {
  if (!statusBox) return;
  if (!message || type === "clear") {
    statusBox.classList.add("hidden");
    statusBox.textContent = "";
    return;
  }
  statusBox.textContent = message;
  statusBox.classList.toggle("info", type === "info");
  statusBox.classList.remove("hidden");
}
