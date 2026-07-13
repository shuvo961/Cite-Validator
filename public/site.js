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
      link.href = "/dashboard";
    } else {
      link.textContent = "Login";
      link.href = "/login";
    }
  });
}

function wireLanguageSelects() {
  const savedLanguage = localStorage.getItem("cv_language") || "English";
  document.querySelectorAll(".language-select").forEach((select) => {
    select.value = [...select.options].some((option) => option.value === savedLanguage || option.textContent === savedLanguage)
      ? savedLanguage
      : "English";
    select.addEventListener("change", () => {
      localStorage.setItem("cv_language", select.value);
      document.documentElement.lang = languageCode(select.value);
      applyLanguage(select.value);
    });
  });
  document.documentElement.lang = languageCode(savedLanguage);
  applyLanguage(savedLanguage);
}

function wireScrollReveal() {
  const revealTargets = document.querySelectorAll(
    ".landing-hero, .trust-strip, .source-network-section, .split-band, .dashboard-preview-section, .how-flow, .feature-grid, .importance-section, .comparison-section, .testimonial-section, .free-section, .faq-section, .builder-section, .guide-cta, .site-footer"
  );

  revealTargets.forEach((target) => target.classList.add("reveal"));

  if (!("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );

  revealTargets.forEach((target) => observer.observe(target));
}

function wireMobileNavigation() {
  document.querySelectorAll(".mobile-menu-toggle").forEach((button) => {
    const header = button.closest(".site-header");
    button.addEventListener("click", () => {
      const isOpen = header?.classList.toggle("nav-open");
      button.setAttribute("aria-expanded", String(Boolean(isOpen)));
    });
  });
}

function wireNavDropdowns() {
  document.querySelectorAll(".nav-menu").forEach((menu) => {
    const button = menu.querySelector(".nav-menu-button");
    if (!button) return;
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !menu.classList.contains("is-open");
      document.querySelectorAll(".nav-menu.is-open").forEach((openMenu) => {
        openMenu.classList.remove("is-open");
        openMenu.querySelector(".nav-menu-button")?.setAttribute("aria-expanded", "false");
      });
      menu.classList.toggle("is-open", willOpen);
      button.setAttribute("aria-expanded", String(willOpen));
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".nav-menu.is-open").forEach((menu) => {
      menu.classList.remove("is-open");
      menu.querySelector(".nav-menu-button")?.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".nav-menu.is-open").forEach((menu) => {
      menu.classList.remove("is-open");
      menu.querySelector(".nav-menu-button")?.setAttribute("aria-expanded", "false");
    });
  });
}

function liftFixedHeader() {
  const header = document.querySelector(".site-header.product-nav");
  if (!header || header.parentElement === document.body) return;
  document.body.insertBefore(header, document.body.firstChild);
}

function normalizePublicHeader() {
  const header = document.querySelector(".site-header.product-nav");
  if (!header || document.body.classList.contains("admin-page")) return;
  const normalizedPath = location.pathname.replace(/\.html$/, "") || "/";
  if (normalizedPath === "/login") return;
  const isAdminShell = location.pathname.includes("ownershuvo") || location.pathname.includes("admin");
  if (isAdminShell) return;
  let nav = header.querySelector(".site-nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "site-nav";
    header.querySelector(".brand")?.insertAdjacentElement("afterend", nav);
  }
  nav.setAttribute("aria-label", "Primary navigation");
  nav.innerHTML = `
    <div class="nav-menu">
      <button class="nav-menu-button" type="button" aria-expanded="false">Apps</button>
      <div class="nav-menu-panel">
        <a href="/validate">Citation Validator</a>
        <a href="/doi-checker">DOI Checker</a>
        <a href="/converter">Citation Converter</a>
        <a href="/fake-citation-detector">Fake Citation Detector</a>
      </div>
    </div>
    <a href="/pricing">Pricing</a>
    <a href="/how-it-works">How it works</a>
    <a href="/supported-formats">Formats</a>
  `;
  let actions = header.querySelector(".nav-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "nav-actions";
    header.appendChild(actions);
  }
  if (!actions.querySelector(".language-select")) {
    actions.insertAdjacentHTML("afterbegin", `
      <select class="language-select" aria-label="Language">
        <option>English</option>
        <option>Bengali</option>
        <option>Arabic</option>
        <option>Spanish</option>
      </select>
    `);
  }
  actions.querySelectorAll(".language-select option").forEach((option) => {
    option.textContent = option.textContent.replace(/\s+soon$/i, "");
    option.value = option.textContent;
  });
  if (!actions.querySelector("[data-theme-toggle]")) {
    actions.insertAdjacentHTML("beforeend", `<button class="theme-toggle" type="button" data-theme-toggle>Dark</button>`);
  }
  if (!actions.querySelector("[data-auth-link]")) {
    actions.insertAdjacentHTML("beforeend", `<a class="login-link" data-auth-link href="/login">Login</a>`);
  }
}

function wireThemeToggle() {
  const saved = localStorage.getItem("cv_theme") || "light";
  document.documentElement.dataset.theme = saved;
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = saved === "dark" ? "Light" : "Dark";
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("cv_theme", next);
      applyLanguage(localStorage.getItem("cv_language") || "English");
    });
  });
}

function ensureSharedFooter() {
  const shell = document.querySelector(".ambient-page") || document.body;
  document.querySelectorAll(".site-footer.product-footer").forEach((footer) => footer.remove());
  const footer = document.createElement("footer");
  footer.className = "site-footer product-footer compact-footer shared-footer";
  const hasExamplesModal = Boolean(document.querySelector("#examplesModal"));
  footer.innerHTML = `
    <div class="footer-brand-block">
      <a class="brand footer-brand" href="/"><img src="/logo.svg" alt="" class="brand-logo"><span>Cite Validator</span></a>
      <p>Verify academic citations, detect hallucinated references, and export clean reports for free.</p>
      <div class="footer-badges"><span>Free</span><span>Transparent</span><span>Academic</span></div>
    </div>
    <nav aria-label="Tools">
      <strong>Tools</strong>
      <a href="/validate">Validator</a>
      <a href="/converter">Converter</a>
      <a href="/doi-checker">DOI Checker</a>
      <a href="/fake-citation-detector">Fake Citation Detector</a>
    </nav>
    <nav aria-label="Resources">
      <strong>Resources</strong>
      <a href="/supported-formats">Supported formats</a>
      <a href="/how-it-works">How it works</a>
      ${hasExamplesModal ? '<button id="examplesBtn" class="footer-button-link" type="button">Paste examples</button>' : ""}
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/security">Security</a>
    </nav>
    <div class="footer-contact-card">
      <strong>Developed by Sabbir Alom Shuvo</strong>
      <a href="https://sashuvo.com" target="_blank" rel="noreferrer">sashuvo.com</a>
      <span>Built for free academic reference checking.</span>
    </div>
    <div class="footer-bottom">
      <span>&copy; 2026 Cite Validator. Totally free.</span>
      <select class="language-select" aria-label="Footer language"><option>English</option><option>Bengali</option><option>Arabic</option><option>Spanish</option></select>
    </div>
  `;
  shell.appendChild(footer);
}

async function loadAnnouncement() {
  try {
    const response = await fetch("/api/announcement", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.enabled || !data.message) return;
    const banner = document.createElement("div");
    banner.className = "announcement-banner";
    banner.textContent = data.message;
    document.documentElement.classList.add("has-announcement");
    document.body.prepend(banner);
  } catch {
    // Announcement is optional.
  }
}

function normalizeInternalLinks() {
  const replacements = new Map([
    ["/validate.html", "/validate"],
    ["/converter.html", "/converter"],
    ["/doi-checker.html", "/doi-checker"],
    ["/fake-citation-detector.html", "/fake-citation-detector"],
    ["/supported-formats.html", "/supported-formats"],
    ["/how-it-works.html", "/how-it-works"],
    ["/pricing.html", "/pricing"],
    ["/login.html", "/login"],
    ["/dashboard.html", "/dashboard"],
    ["/about.html", "/about"]
  ]);
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (replacements.has(href)) link.setAttribute("href", replacements.get(href));
  });
}

function markActiveLinks() {
  const current = window.location.pathname.replace(/\.html$/, "") || "/";
  const appPaths = new Set(["/validate", "/doi-checker", "/converter", "/fake-citation-detector"]);
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const path = new URL(link.href, window.location.origin).pathname.replace(/\.html$/, "");
    link.classList.toggle("active", path === current || (current === "/validate" && ["/citation-checker", "/reference-checker"].includes(path)));
  });
  document.querySelectorAll(".nav-menu").forEach((menu) => {
    const hasActiveApp = [...menu.querySelectorAll("a")].some((link) => {
      const path = new URL(link.href, window.location.origin).pathname.replace(/\.html$/, "");
      return path === current || (appPaths.has(current) && appPaths.has(path));
    });
    menu.classList.toggle("active", hasActiveApp);
    menu.querySelector(".nav-menu-button")?.classList.toggle("active", hasActiveApp);
  });
}

function languageCode(language) {
  if (/bengali/i.test(language)) return "bn";
  if (/arabic/i.test(language)) return "ar";
  if (/spanish/i.test(language)) return "es";
  return "en";
}

function applyLanguage(language) {
  const dictionary = {
    English: {
      login: "Login",
      try: "Try validator",
      validate: "Validate references",
      clean: "Clean PDF text",
      preview: "Preview split",
      sample: "Load samples",
      clear: "Clear",
      dark: "Dark",
      light: "Light"
    },
    Bengali: {
      login: "লগইন",
      try: "ভ্যালিডেটর চালান",
      validate: "রেফারেন্স যাচাই",
      clean: "PDF লেখা পরিষ্কার",
      preview: "বিভাগ দেখুন",
      sample: "নমুনা লোড",
      clear: "মুছুন",
      dark: "ডার্ক",
      light: "লাইট"
    },
    Arabic: {
      login: "تسجيل الدخول",
      try: "جرّب المدقق",
      validate: "تحقق من المراجع",
      clean: "تنظيف نص PDF",
      preview: "معاينة التقسيم",
      sample: "تحميل أمثلة",
      clear: "مسح",
      dark: "داكن",
      light: "فاتح"
    },
    Spanish: {
      login: "Iniciar sesión",
      try: "Probar validador",
      validate: "Validar referencias",
      clean: "Limpiar texto PDF",
      preview: "Vista de división",
      sample: "Cargar ejemplos",
      clear: "Limpiar",
      dark: "Oscuro",
      light: "Claro"
    }
  };
  const normalizedLanguage = String(language || "English").replace(/ soon$/i, "");
  const copy = dictionary[normalizedLanguage] || dictionary.English;
  if (!data?.user) {
    document.querySelectorAll("[data-auth-link]").forEach((link) => {
      link.textContent = copy.login;
    });
  }
  document.querySelectorAll("[data-i18n='try-validator']").forEach((item) => {
    item.textContent = copy.try;
  });
  setText("#validateBtn", copy.validate);
  setText("#cleanTextBtn", copy.clean);
  setText("#splitPreviewBtn", copy.preview);
  setText("#sampleBtn", copy.sample);
  setText("#clearBtn", copy.clear);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = document.documentElement.dataset.theme === "dark" ? copy.light : copy.dark;
  });
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) node.textContent = text;
}

const data = await getMe();
normalizeInternalLinks();
normalizePublicHeader();
updateAuthLinks(data?.user);
liftFixedHeader();
ensureSharedFooter();
loadAnnouncement();
wireLanguageSelects();
wireScrollReveal();
wireMobileNavigation();
wireNavDropdowns();
wireThemeToggle();
markActiveLinks();

