const DEFAULT_TIMEOUT_MS = 9000;

export async function fetchJson(url, options = {}) {
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
    return { ok: true, status: response.status, data: await response.json(), error: null };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === "AbortError" ? "Request timed out" : error.message, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url, options = {}) {
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
    return { ok: true, status: response.status, text: await response.text(), error: null };
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
