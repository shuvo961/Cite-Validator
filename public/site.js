async function getMe() {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function updateAuthLinks(user) {
  document.querySelectorAll("[data-auth-link]").forEach((link) => {
    if (user) {
      link.textContent = user.name?.split(" ")[0] || "Dashboard";
      link.href = "/dashboard.html";
    } else {
      link.textContent = "Login";
      link.href = "/login.html";
    }
  });
}

function wireLanguageSelects() {
  document.querySelectorAll(".language-select").forEach((select) => {
    select.addEventListener("change", () => {
      if (select.selectedIndex > 0) {
        select.title = "More languages are coming soon.";
      }
    });
  });
}

const data = await getMe();
updateAuthLinks(data?.user);
wireLanguageSelects();
