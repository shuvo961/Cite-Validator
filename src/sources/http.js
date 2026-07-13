import crypto from "node:crypto";
import { getMetadataCache, setMetadataCache } from "../db.js";

const DEFAULT_TIMEOUT_MS = 9000;

export async function fetchJson(url, options = {}) {
  const cacheKey = cacheKeyFor("json", url, options);
  const cached = options.cache !== false ? getMetadataCache(cacheKey) : null;
  if (cached) {
    try {
      return { ok: cached.ok, status: cached.status, data: JSON.parse(cached.payloadText), error: null, cached: true };
    } catch {
      // Fall through to network if an old cache entry cannot be parsed.
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": userAgent(),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}`, data: null };
    }
    const text = await response.text();
    setMetadataCache({
      cacheKey,
      source: sourceName(url),
      url,
      status: response.status,
      payloadText: text,
      contentType: "application/json",
      ttlSeconds: options.ttlSeconds || 60 * 60 * 24
    });
    return { ok: true, status: response.status, data: JSON.parse(text), error: null };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === "AbortError" ? "Request timed out" : error.message, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url, options = {}) {
  const cacheKey = cacheKeyFor("text", url, options);
  const cached = options.cache !== false ? getMetadataCache(cacheKey) : null;
  if (cached) {
    return { ok: cached.ok, status: cached.status, text: cached.payloadText, error: null, cached: true };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "accept": options.accept || "text/plain",
        "user-agent": userAgent(),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}`, text: "" };
    }
    const text = await response.text();
    setMetadataCache({
      cacheKey,
      source: sourceName(url),
      url,
      status: response.status,
      payloadText: text,
      contentType: options.accept || "text/plain",
      ttlSeconds: options.ttlSeconds || 60 * 60 * 24
    });
    return { ok: true, status: response.status, text, error: null };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === "AbortError" ? "Request timed out" : error.message, text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function userAgent() {
  const email = process.env.CONTACT_EMAIL;
  return email
    ? `CiteValidator/0.1 (mailto:${email})`
    : "CiteValidator/0.1 (free academic reference validation and citation checker)";
}

function cacheKeyFor(kind, url, options = {}) {
  const vary = JSON.stringify({ kind, url, accept: options.accept || "", headers: options.headers || {} });
  return crypto.createHash("sha256").update(vary).digest("hex");
}

function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "metadata";
  }
}
