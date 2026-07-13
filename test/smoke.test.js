import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3317;
const baseUrl = `http://127.0.0.1:${port}`;

let server;

test.before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      SYNC_VALIDATION_LIMIT: "3"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForHealth();
});

test.after(() => {
  server?.kill();
});

test("main pages render with shared layout", async () => {
  const routes = [
    "/",
    "/validate",
    "/converter",
    "/doi-checker",
    "/fake-citation-detector",
    "/login",
    "/pricing",
    "/supported-formats",
    "/how-it-works",
    "/privacy",
    "/terms",
    "/security"
  ];

  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should return 200`);
    const html = await response.text();
    assert.match(html, /Cite Validator/i, `${route} should include app brand`);
    assert.match(html, /<h1[\s>]/i, `${route} should include one main heading`);
  }
});

test("readiness endpoint reports production configuration checks", async () => {
  const response = await fetch(`${baseUrl}/api/system/readiness`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.environment, "test");
  assert.ok(Array.isArray(data.checks));
  assert.ok(data.checks.some((item) => item.name === "googleOAuth"));
  assert.ok(data.checks.some((item) => item.name === "database"));
});

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await delay(150);
    }
  }
  throw new Error("Smoke-test server did not start.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
