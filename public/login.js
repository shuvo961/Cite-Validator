const errorBox = document.querySelector("#loginError");

const params = new URLSearchParams(window.location.search);
if (params.get("reason") === "google-not-configured") {
  showMessage("Google OAuth is not configured yet. Add Google credentials in production to enable public login.", "info");
}
if (params.get("error")) showMessage(params.get("error"));

function showMessage(message, type = "error") {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.toggle("info", type === "info");
  errorBox.classList.remove("hidden");
}
