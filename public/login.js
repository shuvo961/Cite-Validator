const demoBtn = document.querySelector("#demoLoginBtn");
const errorBox = document.querySelector("#loginError");

const params = new URLSearchParams(window.location.search);
if (params.get("reason") === "google-not-configured") {
  showMessage("Google OAuth is not configured yet. Use local demo login now, then add Google keys for production.");
}
if (params.get("error")) showMessage(params.get("error"));

demoBtn?.addEventListener("click", async () => {
  demoBtn.disabled = true;
  try {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sabbir Alom Shuvo" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed");
    window.location.href = "/dashboard.html";
  } catch (error) {
    showMessage(error.message);
    demoBtn.disabled = false;
  }
});

function showMessage(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}
