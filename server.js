import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLog,
  createPasswordReset,
  createPasswordUser,
  createSession,
  deleteSession,
  deleteUserAccount,
  getAdminStats,
  getMetadataCacheStats,
  getJob,
  getSourceHealth,
  getSetting,
  getUserBySession,
  initDb,
  listFeedback,
  listUserJobs,
  listUsers,
  resetPasswordWithToken,
  saveFeedback,
  saveJob,
  setSetting,
  setUserPassword,
  upsertUser,
  verifyPasswordUser
} from "./src/db.js";
import { validateReferences } from "./src/pipeline.js";
import { splitReferences } from "./src/parser.js";
import { formatCitation } from "./src/citation.js";
import { toCsv } from "./src/export/csv.js";
import { toPdf } from "./src/export/pdf.js";
import { toDoc } from "./src/export/doc.js";
import { toBibtexExport } from "./src/export/bibtex.js";
import { toRis } from "./src/export/ris.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);
const rateLimitBuckets = new Map();
const asyncValidationJobs = new Map();
const syncValidationLimit = Number(process.env.SYNC_VALIDATION_LIMIT || 30);
const runtimeMetrics = {
  startedAt: new Date().toISOString(),
  requests: 0,
  apiRequests: 0,
  errors: 0,
  recent: [],
  queuedJobs: 0,
  completedQueuedJobs: 0,
  failedQueuedJobs: 0
};

initDb();

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const cleanRouteMap = new Map([
  ["/validate", "/validate.html"],
  ["/converter", "/converter.html"],
  ["/doi-checker", "/doi-checker.html"],
  ["/doi-validator", "/doi-checker.html"],
  ["/reference-validator", "/validate.html"],
  ["/reference-checker", "/validate.html"],
  ["/citation-checker", "/validate.html"],
  ["/fake-citation-detector", "/fake-citation-detector.html"],
  ["/supported-formats", "/supported-formats.html"],
  ["/how-it-works", "/how-it-works.html"],
  ["/pricing", "/pricing.html"],
  ["/about", "/about.html"],
  ["/privacy", "/privacy.html"],
  ["/terms", "/terms.html"],
  ["/security", "/security.html"],
  ["/login", "/login.html"],
  ["/dashboard", "/dashboard.html"],
  ["/reports", "/dashboard.html"],
  ["/history", "/dashboard.html"],
  ["/settings", "/dashboard.html"],
  ["/ownershuvo", "/shuvo-admin.html"],
  ["/apa-citation-checker", "/validate.html"],
  ["/mla-citation-checker", "/validate.html"],
  ["/ieee-citation-checker", "/validate.html"],
  ["/chicago-citation-checker", "/validate.html"],
  ["/vancouver-citation-checker", "/validate.html"],
  ["/acs-citation-checker", "/validate.html"],
  ["/isbn-checker", "/validate.html"],
  ["/pubmed-citation-checker", "/validate.html"],
  ["/arxiv-citation-checker", "/validate.html"],
  ["/hallucinated-citation-detector", "/fake-citation-detector.html"],
  ["/fabricated-reference-checker", "/fake-citation-detector.html"],
  ["/academic-reference-validator", "/validate.html"],
  ["/best-free-citation-checker", "/validate.html"],
  ["/check-if-doi-is-real", "/doi-checker.html"],
  ["/detect-fake-academic-citations", "/fake-citation-detector.html"],
  ["/clean-references-copied-from-pdf", "/supported-formats.html"],
  ["/apa-citation-validation-guide", "/validate.html"]
]);

const seoRoutes = [
  "/", "/validate", "/converter", "/doi-checker", "/doi-validator", "/reference-validator", "/reference-checker", "/citation-checker",
  "/fake-citation-detector", "/supported-formats", "/how-it-works", "/pricing",
  "/about", "/privacy", "/terms", "/security",
  "/apa-citation-checker", "/mla-citation-checker", "/ieee-citation-checker",
  "/chicago-citation-checker", "/vancouver-citation-checker", "/acs-citation-checker",
  "/isbn-checker", "/pubmed-citation-checker", "/arxiv-citation-checker",
  "/hallucinated-citation-detector", "/fabricated-reference-checker", "/academic-reference-validator",
  "/best-free-citation-checker", "/check-if-doi-is-real", "/detect-fake-academic-citations",
  "/clean-references-copied-from-pdf", "/apa-citation-validation-guide"
];

const baseSeo = {
  title: "Cite Validator - Free Citation Checker for Academia",
  description: "Cite Validator is a free academic reference validation app that checks citations, resolves DOI metadata, detects fabricated references, repairs messy PDF text, and exports transparent reports.",
  keywords: [
    "Cite Validator",
    "free citation checker",
    "reference validation",
    "citation checker",
    "academic reference validator",
    "DOI checker",
    "fake citation detector",
    "hallucinated citation detector",
    "bibliography checker",
    "APA citation checker",
    "IEEE citation checker",
    "MLA citation checker",
    "Chicago citation checker",
    "Vancouver citation checker",
    "ACS citation checker",
    "PubMed citation checker",
    "arXiv citation checker",
    "ISBN checker",
    "Crossref lookup",
    "OpenAlex lookup",
    "academic integrity tool",
    "free academic tool"
  ],
  image: "/og-image.png",
  type: "website",
  pageType: "tool",
  faq: [
    ["Is Cite Validator free?", "Yes. Cite Validator is a totally free academic citation checker and reference validation workspace."],
    ["Does Cite Validator guess when a reference is uncertain?", "No. The app flags uncertain, suspicious, or unverifiable references instead of pretending they are verified."],
    ["Does Cite Validator scrape Google Scholar?", "No. It uses public and official metadata services first, and treats Google Scholar as a manual fallback."]
  ]
};

const seoConfig = {
  "/": {
    title: "Cite Validator - Free Citation Checker, Reference Validator & DOI Checker",
    description: "Free academic citation checker for students, researchers, reviewers, editors, and professors. Validate references, detect fake citations, repair PDF text, resolve DOI metadata, and export reports.",
    pageType: "home"
  },
  "/validate": {
    title: "Validate References Online - Free Academic Citation Validator",
    description: "Paste academic references and validate titles, authors, years, journals, DOI, PMID, ISBN, ISSN, pages, volumes, issues, publishers, citation style, and hallucination risk."
  },
  "/reference-validator": {
    title: "Reference Validator - Check Academic References for Accuracy",
    description: "Free reference validator for academic papers, theses, reports, conference papers, books, chapters, preprints, and journal articles."
  },
  "/reference-checker": {
    title: "Reference Checker - Verify Bibliography Entries for Free",
    description: "Check bibliography entries against trusted metadata sources and identify missing, mismatched, suspicious, duplicate, or fabricated references."
  },
  "/citation-checker": {
    title: "Citation Checker - Free Academic Citation Verification Tool",
    description: "Use a free citation checker to verify DOI metadata, journal titles, author order, years, page ranges, and citation style before submission."
  },
  "/converter": {
    title: "Citation Converter - Convert APA, MLA, IEEE, Chicago, Vancouver & ACS",
    description: "Convert references to APA, MLA, IEEE, Chicago, Vancouver, ACS, and other academic formats. Export converted citations as DOC, BibTeX, RIS, and copied text."
  },
  "/doi-checker": {
    title: "DOI Checker - Verify DOI, Title, Author, Journal and Year",
    description: "Resolve a DOI or DOI URL and verify the article behind it using DOI.org, Crossref, OpenAlex, PubMed, Europe PMC, DataCite, and official metadata sources."
  },
  "/doi-validator": {
    title: "DOI Validator - Check if a DOI is Real and Matches a Citation",
    description: "Validate DOI records, repair broken DOI text copied from PDFs, and detect DOI-title-author mismatches or DOIs attached to the wrong article."
  },
  "/fake-citation-detector": {
    title: "Fake Citation Detector - Detect Fabricated Academic References",
    description: "Detect fake academic citations, real journals paired with nonexistent papers, DOI mismatches, suspicious metadata, invented page ranges, and unverifiable sources."
  },
  "/hallucinated-citation-detector": {
    title: "Hallucinated Citation Detector - Find AI-Fabricated References",
    description: "Check whether AI-generated or suspicious citations are real, partially verified, unverifiable, or likely hallucinated using trusted scholarly metadata."
  },
  "/fabricated-reference-checker": {
    title: "Fabricated Reference Checker - Verify Suspicious Sources",
    description: "Find fabricated references, invented titles, fake journals, mismatched DOIs, and citations that only appear on low-quality or non-authoritative websites."
  },
  "/academic-reference-validator": {
    title: "Academic Reference Validator - Free Source Accuracy Checker",
    description: "Validate academic sources field by field and receive corrected references, confidence scores, hallucination risk, evidence links, and recommended actions."
  },
  "/apa-citation-checker": {
    title: "APA Citation Checker - Validate APA References for Free",
    description: "Check APA references for correct author order, year, title, journal, volume, issue, pages, DOI, publisher, and hallucination risk."
  },
  "/mla-citation-checker": {
    title: "MLA Citation Checker - Verify MLA Works Cited Entries",
    description: "Validate MLA citations and works cited entries against trusted metadata sources before submission or publication."
  },
  "/ieee-citation-checker": {
    title: "IEEE Citation Checker - Validate Numbered References",
    description: "Check IEEE numbered references, DOI metadata, conference papers, journals, page ranges, and author order."
  },
  "/chicago-citation-checker": {
    title: "Chicago Citation Checker - Verify Notes and Bibliography References",
    description: "Validate Chicago-style academic references and detect missing fields, wrong metadata, mismatched DOIs, and suspicious citations."
  },
  "/vancouver-citation-checker": {
    title: "Vancouver Citation Checker - Validate Medical References",
    description: "Check Vancouver references, PMID metadata, DOI records, journal abbreviations, author order, volume, issue, and page ranges."
  },
  "/acs-citation-checker": {
    title: "ACS Citation Checker - Verify Chemistry References",
    description: "Validate ACS-style chemistry references, journal abbreviations, DOI metadata, article pages, authors, and publication years."
  },
  "/isbn-checker": {
    title: "ISBN Checker - Verify Books, Chapters and Publishers",
    description: "Check ISBN metadata, book titles, authors, publishers, publication years, editions, and academic book citations."
  },
  "/pubmed-citation-checker": {
    title: "PubMed Citation Checker - Verify PMID and Biomedical References",
    description: "Validate biomedical citations using PubMed and Europe PMC signals along with DOI and Crossref metadata."
  },
  "/arxiv-citation-checker": {
    title: "arXiv Citation Checker - Verify Preprints and arXiv IDs",
    description: "Validate arXiv IDs, preprint titles, authors, versions, publication dates, DOI links, and citation metadata."
  },
  "/supported-formats": {
    title: "Supported Citation Formats - APA, IEEE, MLA, Chicago, Vancouver, ACS",
    description: "See citation formats, identifiers, bibliography imports, DOI patterns, and messy PDF text formats supported by Cite Validator."
  },
  "/how-it-works": {
    title: "How Cite Validator Works - Transparent Citation Verification",
    description: "Learn how Cite Validator parses references, repairs PDF text, queries trusted metadata sources, compares fields, scores confidence, and flags hallucination risk."
  },
  "/pricing": {
    title: "Pricing - Cite Validator is Totally Free",
    description: "Cite Validator is a free academic citation checker. Login is used to save reports and export history, not to charge users."
  },
  "/about": {
    title: "About Cite Validator - Built for Academic Reference Integrity",
    description: "Learn about Cite Validator, a free academic source checker developed by Sabbir Alom Shuvo for transparent citation validation."
  },
  "/privacy": {
    title: "Privacy Policy - Cite Validator",
    description: "Understand how Cite Validator handles pasted references, user accounts, validation reports, cookies, and metadata lookups."
  },
  "/terms": {
    title: "Terms of Service - Cite Validator",
    description: "Terms for using Cite Validator, a free academic citation checker and reference validation app."
  },
  "/security": {
    title: "Security - Cite Validator",
    description: "Security practices for Cite Validator, including transparency, source reliability, admin controls, and responsible citation checking."
  },
  "/best-free-citation-checker": {
    title: "Best Free Citation Checker for Academic References",
    description: "A free citation checker for validating academic references, detecting hallucinated citations, and exporting citation verification reports."
  },
  "/check-if-doi-is-real": {
    title: "How to Check if a DOI is Real",
    description: "Use Cite Validator to resolve DOI metadata and confirm whether a DOI belongs to the article title, authors, journal, and year provided."
  },
  "/detect-fake-academic-citations": {
    title: "How to Detect Fake Academic Citations",
    description: "Detect fake academic citations by checking DOI matches, author-title consistency, trusted source evidence, journal names, and publication metadata."
  },
  "/clean-references-copied-from-pdf": {
    title: "Clean References Copied from PDF - Repair Bibliography Text",
    description: "Clean broken PDF bibliography text, remove line numbers and page-number garbage, repair DOI line breaks, and split pasted references automatically."
  },
  "/apa-citation-validation-guide": {
    title: "APA Citation Validation Guide - Check APA References",
    description: "Guide to validating APA references with DOI lookup, author order checking, title matching, journal metadata, and corrected reference output."
  }
};

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(json);
}

function productionReadiness(req) {
  const baseUrl = getPublicBaseUrl(req);
  const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasSessionSecret = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  const hasPostgres = Boolean(process.env.DATABASE_URL);
  const hasRedis = Boolean(process.env.REDIS_URL);
  const hasEmail = Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.CONTACT_EMAIL);
  const production = process.env.NODE_ENV === "production";
  const checks = [
    checkItem("googleOAuth", hasGoogle, "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for public Google login."),
    checkItem("sessionSecret", hasSessionSecret, "Set a random SESSION_SECRET with at least 32 characters."),
    checkItem("appBaseUrl", Boolean(process.env.APP_BASE_URL || !production), "Set APP_BASE_URL to the public HTTPS URL before deployment."),
    checkItem("database", hasPostgres || !production, "Use DATABASE_URL with PostgreSQL for production traffic."),
    checkItem("queue", hasRedis || !production, "Use REDIS_URL for durable large-batch queues in production."),
    checkItem("email", hasEmail || !production, "Configure SMTP_HOST or RESEND_API_KEY for production reset emails."),
    checkItem("https", baseUrl.startsWith("https://") || !production, "Serve production over HTTPS.")
  ];
  return {
    ok: checks.every((item) => item.ok),
    environment: process.env.NODE_ENV || "development",
    baseUrl,
    database: hasPostgres ? "postgresql-configured" : "sqlite-local",
    queue: hasRedis ? "redis-configured" : "in-memory-local",
    cache: process.env.REDIS_URL ? "redis-configured" : "sqlite-metadata-cache",
    checks
  };
}

function checkItem(name, ok, message) {
  return { name, ok: Boolean(ok), message: ok ? "Ready" : message };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function normalizeSeoPath(pathname) {
  if (pathname === "/") return "/";
  const clean = pathname.replace(/\.html$/, "");
  if (/^\/reports\/[^/]+$/.test(clean)) return "/reports";
  return cleanRouteMap.has(clean) || seoConfig[clean] ? clean : clean;
}

function getSeoMeta(req, pathname) {
  const route = normalizeSeoPath(pathname);
  const routeMeta = seoConfig[route] || {};
  const baseUrl = getPublicBaseUrl(req);
  const canonicalRoute = route === "/reports" ? "/dashboard" : (seoRoutes.includes(route) ? route : pathname);
  const canonical = `${baseUrl}${canonicalRoute === "/" ? "" : canonicalRoute}`;
  const title = routeMeta.title || baseSeo.title;
  const description = routeMeta.description || baseSeo.description;
  const keywords = [...new Set([...(baseSeo.keywords || []), ...routeKeywords(route), ...String(routeMeta.keywords || "").split(",")])]
    .map((item) => String(item).trim())
    .filter(Boolean);
  const image = new URL(routeMeta.image || baseSeo.image, baseUrl).toString();
  return {
    route,
    canonical,
    title,
    description,
    keywords,
    image,
    type: routeMeta.type || baseSeo.type,
    pageType: routeMeta.pageType || baseSeo.pageType,
    faq: routeMeta.faq || baseSeo.faq
  };
}

function routeKeywords(route) {
  return route
    .split("/")
    .filter(Boolean)
    .flatMap((part) => {
      const phrase = part.replace(/-/g, " ");
      return [phrase, `${phrase} free`, `${phrase} online`];
    });
}

function buildJsonLd(meta, req) {
  const baseUrl = getPublicBaseUrl(req);
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Cite Validator",
    alternateName: ["Citation Checker", "Reference Validator", "DOI Checker", "Fake Citation Detector"],
    url: baseUrl,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    creator: {
      "@type": "Person",
      name: "Sabbir Alom Shuvo",
      url: "https://sashuvo.com"
    },
    featureList: [
      "Academic reference validation",
      "Citation style auto-detection",
      "DOI, ISBN, ISSN, PMID and arXiv identifier checks",
      "Crossref, OpenAlex, PubMed, Europe PMC, DataCite, Google Books and arXiv metadata lookup",
      "Hallucinated and fabricated citation risk detection",
      "PDF/OCR bibliography text cleanup",
      "CSV, PDF, DOC, BibTeX and RIS exports"
    ]
  };
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    description: meta.description,
    url: meta.canonical,
    isPartOf: { "@type": "WebSite", name: "Cite Validator", url: baseUrl },
    about: ["citation validation", "academic references", "DOI metadata", "fabricated citations", "bibliography checking"]
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      ...(meta.route === "/" ? [] : [{ "@type": "ListItem", position: 2, name: meta.title.replace(/ - .+$/, ""), item: meta.canonical }])
    ]
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: meta.faq.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };
  return [app, page, breadcrumbs, faq];
}

function buildMetaHead(req, pathname) {
  const meta = getSeoMeta(req, pathname);
  const baseUrl = getPublicBaseUrl(req);
  const keywords = meta.keywords.join(", ");
  const jsonLd = buildJsonLd(meta, req)
    .map((schema) => `<script type="application/ld+json">${escapeJsonForHtml(schema)}</script>`)
    .join("\n    ");
  return `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}">
    <meta name="keywords" content="${escapeHtml(keywords)}">
    <meta name="author" content="Sabbir Alom Shuvo">
    <meta name="creator" content="Sabbir Alom Shuvo">
    <meta name="publisher" content="Cite Validator">
    <meta name="application-name" content="Cite Validator">
    <meta name="generator" content="Cite Validator">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <meta name="googlebot" content="index, follow, max-image-preview:large">
    <meta name="theme-color" content="#eef6ff">
    <meta name="color-scheme" content="light dark">
    <meta name="rating" content="general">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta name="format-detection" content="telephone=no">
    <meta name="DC.title" content="${escapeHtml(meta.title)}">
    <meta name="DC.description" content="${escapeHtml(meta.description)}">
    <meta name="DC.creator" content="Sabbir Alom Shuvo">
    <meta name="DC.language" content="en">
    <link rel="canonical" href="${escapeHtml(meta.canonical)}">
    <link rel="alternate" hreflang="en" href="${escapeHtml(meta.canonical)}">
    <link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.canonical)}">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="icon" href="/logo.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/og-image.png">
    <meta property="og:site_name" content="Cite Validator">
    <meta property="og:title" content="${escapeHtml(meta.title)}">
    <meta property="og:description" content="${escapeHtml(meta.description)}">
    <meta property="og:type" content="${escapeHtml(meta.type)}">
    <meta property="og:url" content="${escapeHtml(meta.canonical)}">
    <meta property="og:image" content="${escapeHtml(meta.image)}">
    <meta property="og:image:alt" content="${escapeHtml(meta.title)}">
    <meta property="og:locale" content="en_US">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(meta.title)}">
    <meta name="twitter:description" content="${escapeHtml(meta.description)}">
    <meta name="twitter:image" content="${escapeHtml(meta.image)}">
    <meta name="twitter:image:alt" content="${escapeHtml(meta.title)}">
    <meta name="twitter:creator" content="@sashuvo">
    <meta name="citation_title" content="${escapeHtml(meta.title)}">
    <meta name="citation_author" content="Sabbir Alom Shuvo">
    <meta name="citation_publication_date" content="2026">
    <meta name="citation_online_date" content="2026/07/02">
    <meta name="citation_language" content="en">
    <meta name="citation_keywords" content="${escapeHtml(keywords)}">
    <meta name="msapplication-TileColor" content="#eef6ff">
    <meta name="msapplication-config" content="/browserconfig.xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="dns-prefetch" href="//api.crossref.org">
    <link rel="dns-prefetch" href="//api.openalex.org">
    <link rel="dns-prefetch" href="//pubmed.ncbi.nlm.nih.gov">
    <link rel="dns-prefetch" href="//doi.org">
    <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
    ${jsonLd}`.trim();
}

function injectRouteMetadata(html, req, pathname) {
  return html.replace(/<head>[\s\S]*?<\/head>/i, `<head>\n    ${buildMetaHead(req, pathname)}\n  </head>`);
}

function applySecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("origin-agent-cluster", "?1");
  res.setHeader("content-security-policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.crossref.org https://api.openalex.org https://api.semanticscholar.org https://pubmed.ncbi.nlm.nih.gov https://eutils.ncbi.nlm.nih.gov https://doi.org https://api.datacite.org https://export.arxiv.org https://www.googleapis.com https://www.ebi.ac.uk",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "));
  if (process.env.NODE_ENV === "production") {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

function applyCors(req, res) {
  const allowlist = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowlist.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function recordRequest(req, status = 200) {
  runtimeMetrics.requests += 1;
  if (req.url.startsWith("/api/")) runtimeMetrics.apiRequests += 1;
  runtimeMetrics.recent.unshift({
    at: new Date().toISOString(),
    method: req.method,
    path: new URL(req.url, `http://${req.headers.host}`).pathname,
    status
  });
  runtimeMetrics.recent = runtimeMetrics.recent.slice(0, 50);
}

function rateLimit(req, res, { limit = 30, windowMs = 60_000 } = {}) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const key = `${ip}:${new URL(req.url, `http://${req.headers.host}`).pathname}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  if (bucket.count > limit) {
    sendJson(res, 429, { error: "Too many requests. Please wait a moment and try again." });
    return false;
  }
  return true;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  return getUserBySession(cookies.cv_session);
}

function setSessionCookie(res, session) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("set-cookie", [
    `cv_session=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}${secure}`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader("set-cookie", "cv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Login required" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required" });
    return null;
  }
  return user;
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": mimeTypes[".txt"], "cache-control": "public, max-age=3600" });
    res.end(`User-agent: *\nAllow: /\nDisallow: /ownershuvo\nDisallow: /shuvo-admin.html\nDisallow: /api/\nSitemap: ${getPublicBaseUrl(req)}/sitemap.xml\nHost: ${getPublicBaseUrl(req)}\n`);
    return;
  }
  if (url.pathname === "/sitemap.xml") {
    const baseUrl = getPublicBaseUrl(req);
    const today = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${seoRoutes.map((route) => {
      const loc = `${baseUrl}${route === "/" ? "" : route}`;
      const priority = route === "/" ? "1.0" : route.includes("citation-checker") || route.includes("doi") || route.includes("reference") ? "0.9" : "0.7";
      const changefreq = ["/", "/validate", "/doi-checker", "/converter", "/fake-citation-detector"].includes(route) ? "weekly" : "monthly";
      return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
    }).join("\n")}\n</urlset>\n`;
    res.writeHead(200, { "content-type": mimeTypes[".xml"], "cache-control": "public, max-age=3600" });
    res.end(xml);
    return;
  }
  if (url.pathname === "/browserconfig.xml") {
    res.writeHead(200, { "content-type": mimeTypes[".xml"], "cache-control": "public, max-age=86400" });
    res.end(`<?xml version="1.0" encoding="utf-8"?><browserconfig><msapplication><tile><square150x150logo src="/og-image.png"/><TileColor>#eef6ff</TileColor></tile></msapplication></browserconfig>`);
    return;
  }
  const requested = url.pathname === "/"
    ? "/index.html"
    : /^\/reports\/[^/]+$/.test(url.pathname)
      ? "/report.html"
      : cleanRouteMap.get(url.pathname) || url.pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath);
  if (ext === ".html") {
    const html = await readFile(filePath, "utf8");
    res.writeHead(200, {
      "content-type": mimeTypes[ext],
      "cache-control": process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store"
    });
    res.end(injectRouteMetadata(html, req, url.pathname));
    return;
  }

  const isStaticAsset = [".png", ".svg", ".css", ".js", ".webmanifest"].includes(ext);
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
    "cache-control": process.env.NODE_ENV === "production" && isStaticAsset
      ? "public, max-age=86400"
      : "no-store"
  });
  createReadStream(filePath).pipe(res);
}

function getPublicBaseUrl(req) {
  return (process.env.APP_BASE_URL || `http://${req.headers.host}`).replace(/\/$/, "");
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, name: "Cite Validator", readiness: productionReadiness(req) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/system/readiness") {
    sendJson(res, 200, productionReadiness(req));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = getCurrentUser(req);
    sendJson(res, 200, { user, authenticated: Boolean(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/announcement") {
    sendJson(res, 200, {
      message: getSetting("announcement_message", ""),
      enabled: getSetting("announcement_enabled", "false") === "true"
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/demo") {
    const body = await readJson(req);
    const name = String(body.name || "Sabbir Alom Shuvo");
    const email = String(body.email || process.env.DEMO_USER_EMAIL || "demo@citevalidator.local").toLowerCase();
    const user = upsertUser({
      provider: "demo",
      providerId: email,
      name,
      email,
      avatarUrl: "/logo.svg"
    });
    const session = createSession(user.id);
    setSessionCookie(res, session);
    auditLog({ userId: user.id, action: "demo_login" });
    sendJson(res, 200, { user });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || !email || !email.includes("@") || password.length < 8) {
      sendJson(res, 400, { error: "Name, valid email, and password of at least 8 characters are required." });
      return;
    }
    try {
      const user = createPasswordUser({ name, email, password });
      const session = createSession(user.id);
      setSessionCookie(res, session);
      auditLog({ userId: user.id, action: "password_register" });
      sendJson(res, 200, { user });
    } catch (error) {
      sendJson(res, 409, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = verifyPasswordUser({ email, password });
    if (!user) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }
    const session = createSession(user.id);
    setSessionCookie(res, session);
    auditLog({ userId: user.id, action: "password_login" });
    sendJson(res, 200, { user });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/request-reset") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const reset = createPasswordReset(email);
    if (reset) {
      await sendResetEmail({
        to: reset.email,
        token: reset.token,
        baseUrl: getPublicBaseUrl(req)
      });
    }
    sendJson(res, 200, {
      ok: true,
      message: "If an account exists, a reset token has been created.",
      resetToken: process.env.NODE_ENV === "production" ? undefined : reset?.token,
      resetEmail: reset?.email
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    if (!email || !token || password.length < 8) {
      sendJson(res, 400, { error: "Email, reset token, and password of at least 8 characters are required." });
      return;
    }
    try {
      const user = resetPasswordWithToken({ email, token, password });
      auditLog({ userId: user.id, action: "password_reset" });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookies = parseCookies(req);
    deleteSession(cookies.cv_session);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/account") {
    const user = requireUser(req, res);
    if (!user) return;
    deleteUserAccount(user.id);
    clearSessionCookie(res);
    auditLog({ userId: user.id, action: "delete_account" });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/history") {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { jobs: listUserJobs(user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const user = getCurrentUser(req);
    const body = await readJson(req);
    const type = String(body.type || "general").slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 4000);
    if (!message) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }
    const feedback = saveFeedback({ userId: user?.id || "", type, message });
    sendJson(res, 200, { ok: true, feedback });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/overview") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, {
      stats: getAdminStats(),
      users: listUsers(25),
      sourceHealth: getSourceHealth(),
      feedback: listFeedback(20)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/monitoring") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    sendJson(res, 200, {
      runtime: {
        ...runtimeMetrics,
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        node: process.version
      },
      configuration: {
        database: process.env.DATABASE_URL ? "postgresql-configured" : "sqlite-local",
        cache: process.env.REDIS_URL ? "redis-configured" : "memory/local",
        metadataCache: getMetadataCacheStats(),
        googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        contactEmail: Boolean(process.env.CONTACT_EMAIL),
        appBaseUrl: process.env.APP_BASE_URL || ""
      },
      sourceHealth: getSourceHealth()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/reset-password") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || password.length < 8) {
      sendJson(res, 400, { error: "Email and password of at least 8 characters are required." });
      return;
    }
    try {
      const user = setUserPassword({ email, password });
      auditLog({ userId: admin.id, action: "admin_reset_password", detail: { email } });
      sendJson(res, 200, { ok: true, user });
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/announcement") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const message = String(body.message || "").slice(0, 240);
    const enabled = Boolean(body.enabled);
    setSetting("announcement_message", message);
    setSetting("announcement_enabled", enabled ? "true" : "false");
    auditLog({ userId: admin.id, action: "admin_update_announcement", detail: { enabled } });
    sendJson(res, 200, { ok: true, message, enabled });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/validate") {
    if (!rateLimit(req, res, { limit: 20, windowMs: 60_000 })) return;
    const body = await readJson(req);
    const referencesText = String(body.referencesText || "").trim();
    const style = String(body.style || "apa").toLowerCase();
    if (!referencesText) {
      sendJson(res, 400, { error: "referencesText is required" });
      return;
    }
    if (referencesText.length > 120_000) {
      sendJson(res, 413, { error: "Input is too large for the MVP limit of 120,000 characters." });
      return;
    }

    const user = getCurrentUser(req);
    const detectedReferences = splitReferences(referencesText).filter(Boolean);
    if (detectedReferences.length > syncValidationLimit) {
      const queuedJob = queueValidationJob({ referencesText, style, userId: user?.id || "" });
      sendJson(res, 202, queuedJob);
      return;
    }
    const job = await validateReferences({ referencesText, style });
    job.userId = user?.id || "";
    saveJob(job);
    sendJson(res, 200, job);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze-input") {
    if (!rateLimit(req, res, { limit: 80, windowMs: 60_000 })) return;
    const body = await readJson(req);
    const referencesText = String(body.referencesText || "").trim();
    if (!referencesText) {
      sendJson(res, 200, {
        count: 0,
        previews: [],
        aiMode: "built-in-local-reference-ai",
        note: "Built-in local AI is ready. No external AI service is used."
      });
      return;
    }
    const references = splitReferences(referencesText).map((reference) => reference.trim()).filter(Boolean).slice(0, 80);
    sendJson(res, 200, {
      count: references.length,
      references: references.map((reference, index) => ({
        index: index + 1,
        text: reference
      })),
      previews: references.slice(0, 5).map((reference, index) => ({
        index: index + 1,
        text: reference.slice(0, 180)
      })),
      aiMode: "built-in-local-reference-ai",
      note: "Built-in local AI repaired PDF/OCR artifacts, broken DOI URLs, page-number runs, compact author-year boundaries, and pasted-together references."
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/convert") {
    if (!rateLimit(req, res, { limit: 20, windowMs: 60_000 })) return;
    const body = await readJson(req);
    const referencesText = String(body.referencesText || "").trim();
    const style = String(body.style || "apa").toLowerCase();
    if (!referencesText) {
      sendJson(res, 400, { error: "referencesText is required" });
      return;
    }
    const user = getCurrentUser(req);
    const job = await validateReferences({ referencesText, style });
    job.userId = user?.id || "";
    saveJob(job);
    sendJson(res, 200, {
      ...job,
      convertedReferences: job.results.map((result) => {
        const trustedCorrection = result.status === "Verified" ? result.correctedReference : "";
        return {
          index: result.index,
          status: result.status,
          detectedCitationStyle: result.detectedCitationStyle,
          confidenceScore: result.confidenceScore,
          convertedReference: trustedCorrection || formatCitation(result.parsed, style) || result.originalReference,
          sourceLabel: trustedCorrection ? result.matchedSource?.sourceName || "trusted metadata" : "local formatting"
        };
      })
    });
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "GET" && jobMatch) {
    const queued = asyncValidationJobs.get(jobMatch[1]);
    if (queued) {
      sendJson(res, queued.status === "failed" ? 500 : 200, queued);
      return;
    }
    const job = getJob(jobMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  const csvMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.csv$/);
  if (req.method === "GET" && csvMatch) {
    const job = getJob(csvMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reference-validation-${job.id}.csv"`
    });
    res.end(toCsv(job.results));
    return;
  }

  const pdfMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.pdf$/);
  if (req.method === "GET" && pdfMatch) {
    const job = getJob(pdfMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    const pdf = toPdf(job);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="reference-validation-${job.id}.pdf"`
    });
    res.end(pdf);
    return;
  }

  const docMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.doc$/);
  if (req.method === "GET" && docMatch) {
    const job = getJob(docMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": "application/msword; charset=utf-8",
      "content-disposition": `attachment; filename="cite-validator-${job.id}.doc"`
    });
    res.end(toDoc(job));
    return;
  }

  const bibMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.bib$/);
  if (req.method === "GET" && bibMatch) {
    const job = getJob(bibMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": "application/x-bibtex; charset=utf-8",
      "content-disposition": `attachment; filename="cite-validator-${job.id}.bib"`
    });
    res.end(toBibtexExport(job));
    return;
  }

  const risMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/export\.ris$/);
  if (req.method === "GET" && risMatch) {
    const job = getJob(risMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: "Job not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": "application/x-research-info-systems; charset=utf-8",
      "content-disposition": `attachment; filename="cite-validator-${job.id}.ris"`
    });
    res.end(toRis(job));
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function sendResetEmail({ to, token, baseUrl }) {
  if (!to || !token) return { sent: false };
  const resetUrl = `${baseUrl}/ownershuvo`;
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "RESEND_API_KEY is not configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "Cite Validator <noreply@citevalidator.local>",
      to,
      subject: "Cite Validator password reset",
      text: `Use this reset token within 30 minutes:\n\n${token}\n\nOpen: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`
    })
  });
  if (!response.ok) {
    runtimeMetrics.errors += 1;
    console.error("Reset email failed", await response.text());
    return { sent: false };
  }
  return { sent: true };
}

function queueValidationJob({ referencesText, style, userId = "" }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const queued = {
    id,
    createdAt: now,
    status: "queued",
    queued: true,
    progress: 0,
    message: "Queued for background validation.",
    result: null
  };
  asyncValidationJobs.set(id, queued);
  runtimeMetrics.queuedJobs += 1;
  process.nextTick(async () => {
    try {
      queued.status = "running";
      queued.progress = 20;
      queued.message = "Validating references against trusted metadata sources.";
      const result = await validateReferences({ referencesText, style });
      result.id = id;
      result.userId = userId;
      saveJob(result);
      queued.status = "complete";
      queued.progress = 100;
      queued.message = "Validation complete.";
      queued.result = result;
      runtimeMetrics.completedQueuedJobs += 1;
    } catch (error) {
      queued.status = "failed";
      queued.progress = 100;
      queued.message = error.message || "Validation failed.";
      runtimeMetrics.failedQueuedJobs += 1;
      runtimeMetrics.errors += 1;
    }
  });
  return queued;
}

async function handleAuth(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const baseUrl = getPublicBaseUrl(req);

  if (req.method === "GET" && url.pathname === "/auth/google") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      redirect(res, "/login.html?mode=demo&reason=google-not-configured");
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("set-cookie", `cv_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/auth/google/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    redirect(res, authUrl.toString());
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/google/callback") {
    try {
      const cookies = parseCookies(req);
      if (!url.searchParams.get("code") || cookies.cv_oauth_state !== url.searchParams.get("state")) {
        redirect(res, "/login.html?error=oauth-state");
        return;
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: url.searchParams.get("code"),
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${baseUrl}/auth/google/callback`,
          grant_type: "authorization_code"
        })
      });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(token.error_description || "Google token exchange failed");

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` }
      });
      const profile = await profileResponse.json();
      if (!profileResponse.ok) throw new Error("Google profile lookup failed");

      const user = upsertUser({
        provider: "google",
        providerId: profile.sub,
        name: profile.name || profile.email,
        email: profile.email,
        avatarUrl: profile.picture || ""
      });
      const session = createSession(user.id);
      setSessionCookie(res, session);
      auditLog({ userId: user.id, action: "google_login" });
      redirect(res, "/dashboard.html");
    } catch (error) {
      console.error(error);
      redirect(res, `/login.html?error=${encodeURIComponent(error.message)}`);
    }
    return;
  }

  sendJson(res, 404, { error: "Auth route not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(res);
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else if (req.url.startsWith("/auth/")) {
      await handleAuth(req, res);
    } else {
      await handleStatic(req, res);
    }
    recordRequest(req, res.statusCode || 200);
  } catch (error) {
    runtimeMetrics.errors += 1;
    console.error(error);
    sendJson(res, 500, {
      error: "Internal server error",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

server.listen(port, () => {
  console.log(`Cite Validator running at http://localhost:${port}`);
});
