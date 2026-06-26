import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLog,
  createSession,
  deleteSession,
  getAdminStats,
  getJob,
  getSourceHealth,
  getUserBySession,
  initDb,
  listFeedback,
  listUserJobs,
  listUsers,
  saveFeedback,
  saveJob,
  upsertUser
} from "./src/db.js";
import { validateReferences } from "./src/pipeline.js";
import { splitReferences } from "./src/parser.js";
import { toCsv } from "./src/export/csv.js";
import { toPdf } from "./src/export/pdf.js";
import { toDoc } from "./src/export/doc.js";
import { toBibtexExport } from "./src/export/bibtex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);

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
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(json);
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
  res.setHeader("set-cookie", [
    `cv_session=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}`
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
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, name: "Cite Validator" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = getCurrentUser(req);
    sendJson(res, 200, { user, authenticated: Boolean(user) });
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

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookies = parseCookies(req);
    deleteSession(cookies.cv_session);
    clearSessionCookie(res);
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

  if (req.method === "POST" && url.pathname === "/api/validate") {
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
    const job = await validateReferences({ referencesText, style });
    job.userId = user?.id || "";
    saveJob(job);
    sendJson(res, 200, job);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze-input") {
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
    const references = splitReferences(referencesText).slice(0, 80);
    sendJson(res, 200, {
      count: references.length,
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
      convertedReferences: job.results.map((result) => ({
        index: result.index,
        status: result.status,
        detectedCitationStyle: result.detectedCitationStyle,
        convertedReference: result.correctedReference || result.originalReference
      }))
    });
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === "GET" && jobMatch) {
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

  sendJson(res, 404, { error: "API route not found" });
}

async function handleAuth(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const baseUrl = process.env.APP_BASE_URL || `http://${req.headers.host}`;

  if (req.method === "GET" && url.pathname === "/auth/google") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      redirect(res, "/login.html?mode=demo&reason=google-not-configured");
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader("set-cookie", `cv_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
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
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else if (req.url.startsWith("/auth/")) {
      await handleAuth(req, res);
    } else {
      await handleStatic(req, res);
    }
  } catch (error) {
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
