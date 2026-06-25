import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, saveJob, getJob } from "./src/db.js";
import { validateReferences } from "./src/pipeline.js";
import { splitReferences } from "./src/parser.js";
import { toCsv } from "./src/export/csv.js";
import { toPdf } from "./src/export/pdf.js";
import { toDoc } from "./src/export/doc.js";
import { toBibtexExport } from "./src/export/bibtex.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

initDb();

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

    const job = await validateReferences({ referencesText, style });
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
    const job = await validateReferences({ referencesText, style });
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
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
