import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "cite-validator.sqlite");

let db;

export function initDb() {
  mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  const schema = readFileSync(path.join(rootDir, "schema.sql"), "utf8");
  db.exec(schema);
  migrate();
}

export function saveJob(job) {
  const insertJob = db.prepare(`
    INSERT INTO validation_jobs
    (id, created_at, user_id, input_text, selected_style, source_count, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertJob.run(
    job.id,
    job.createdAt,
    job.userId || "",
    job.inputText,
    job.style,
    job.results.length,
    JSON.stringify(job.summary)
  );

  const insertResult = db.prepare(`
    INSERT INTO validation_results
    (id, job_id, reference_index, original_reference, parsed_json, status,
     hallucination_risk_level, confidence_score, hallucination_risk_score,
     detected_citation_style, output_style, brief_summary, summary_output,
     corrected_reference, matched_source_json, field_comparisons_json,
     mismatches_json, evidence_json, recommended_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of job.results) {
    insertResult.run(
      result.id,
      job.id,
      result.index,
      result.originalReference,
      JSON.stringify(result.parsed),
      result.status,
      result.hallucinationRiskLevel,
      result.confidenceScore,
      result.hallucinationRiskScore,
      result.detectedCitationStyle || "",
      result.outputStyle || "",
      result.briefSummary || "",
      result.summaryOutput || "",
      result.correctedReference,
      JSON.stringify(result.matchedSource),
      JSON.stringify(result.fieldComparisons),
      JSON.stringify(result.mismatches),
      JSON.stringify(result.evidence),
      result.recommendedAction
    );
  }
}

export function getJob(id) {
  const jobRow = db.prepare("SELECT * FROM validation_jobs WHERE id = ?").get(id);
  if (!jobRow) return null;

  const resultRows = db
    .prepare("SELECT * FROM validation_results WHERE job_id = ? ORDER BY reference_index ASC")
    .all(id);

  return {
    id: jobRow.id,
    createdAt: jobRow.created_at,
    userId: jobRow.user_id || "",
    inputText: jobRow.input_text,
    style: jobRow.selected_style,
    summary: JSON.parse(jobRow.summary_json),
    results: resultRows.map((row) => ({
      id: row.id,
      index: row.reference_index,
      originalReference: row.original_reference,
      parsed: JSON.parse(row.parsed_json),
      status: row.status,
      hallucinationRiskLevel: row.hallucination_risk_level,
      confidenceScore: row.confidence_score,
      hallucinationRiskScore: row.hallucination_risk_score,
      detectedCitationStyle: row.detected_citation_style,
      outputStyle: row.output_style,
      briefSummary: row.brief_summary,
      summaryOutput: row.summary_output,
      correctedReference: row.corrected_reference,
      matchedSource: JSON.parse(row.matched_source_json),
      fieldComparisons: JSON.parse(row.field_comparisons_json),
      mismatches: JSON.parse(row.mismatches_json),
      evidence: JSON.parse(row.evidence_json),
      recommendedAction: row.recommended_action
    }))
  };
}

export function upsertUser(profile) {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(profile.email);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET provider = ?, provider_id = ?, name = ?, avatar_url = ?, last_login_at = ?
      WHERE id = ?
    `).run(profile.provider, profile.providerId, profile.name, profile.avatarUrl || "", now, existing.id);
    return getUser(existing.id);
  }

  const id = crypto.randomUUID();
  const role = isAdminEmail(profile.email) ? "admin" : "user";
  db.prepare(`
    INSERT INTO users
    (id, provider, provider_id, name, email, avatar_url, role, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, profile.provider, profile.providerId, profile.name, profile.email, profile.avatarUrl || "", role, now, now);
  return getUser(id);
}

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 14);
  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, createdAt.toISOString(), expiresAt.toISOString());
  return { id, expiresAt };
}

export function deleteSession(id) {
  if (!id) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function getUserBySession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > ?
  `).get(sessionId, new Date().toISOString());
  return row ? serializeUser(row) : null;
}

export function getUser(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? serializeUser(row) : null;
}

export function listUserJobs(userId, limit = 20) {
  return db.prepare(`
    SELECT id, created_at, selected_style, source_count, summary_json
    FROM validation_jobs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    style: row.selected_style,
    sourceCount: row.source_count,
    summary: JSON.parse(row.summary_json)
  }));
}

export function listUsers(limit = 100) {
  return db.prepare(`
    SELECT users.*,
      COUNT(validation_jobs.id) AS job_count,
      COALESCE(SUM(validation_jobs.source_count), 0) AS references_checked
    FROM users
    LEFT JOIN validation_jobs ON validation_jobs.user_id = users.id
    GROUP BY users.id
    ORDER BY users.created_at DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    ...serializeUser(row),
    jobCount: row.job_count,
    referencesChecked: row.references_checked
  }));
}

export function getAdminStats() {
  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const totalJobs = db.prepare("SELECT COUNT(*) AS count FROM validation_jobs").get().count;
  const totalReferences = db.prepare("SELECT COALESCE(SUM(source_count), 0) AS count FROM validation_jobs").get().count;
  const resultCounts = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM validation_results
    GROUP BY status
  `).all();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const validationsToday = db.prepare("SELECT COUNT(*) AS count FROM validation_jobs WHERE created_at >= ?").get(today.toISOString()).count;
  return {
    totalUsers,
    totalJobs,
    totalReferences,
    validationsToday,
    resultCounts: Object.fromEntries(resultCounts.map((row) => [row.status, row.count]))
  };
}

export function getSourceHealth() {
  const rows = db.prepare("SELECT evidence_json FROM validation_results ORDER BY rowid DESC LIMIT 250").all();
  const sources = new Map();
  for (const row of rows) {
    let evidence;
    try {
      evidence = JSON.parse(row.evidence_json);
    } catch {
      continue;
    }
    for (const source of evidence.searchedSources || []) {
      const item = sources.get(source.source) || { source: source.source, checks: 0, ok: 0, errors: 0, candidates: 0 };
      item.checks += 1;
      if (source.ok) item.ok += 1;
      else item.errors += 1;
      item.candidates += Number(source.count || 0);
      sources.set(source.source, item);
    }
  }
  return [...sources.values()].sort((a, b) => a.source.localeCompare(b.source));
}

export function saveFeedback({ userId = "", type, message }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO user_feedback (id, user_id, type, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, type, message, new Date().toISOString());
  return { id };
}

export function listFeedback(limit = 50) {
  return db.prepare(`
    SELECT user_feedback.*, users.email
    FROM user_feedback
    LEFT JOIN users ON users.id = user_feedback.user_id
    ORDER BY user_feedback.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function auditLog({ userId = "", action, detail = {} }) {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, action, JSON.stringify(detail), new Date().toISOString());
}

function migrate() {
  const columns = db.prepare("PRAGMA table_info(validation_results)").all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ["validation_jobs", "user_id", "TEXT DEFAULT ''"],
    ["detected_citation_style", "TEXT DEFAULT ''"],
    ["output_style", "TEXT DEFAULT ''"],
    ["brief_summary", "TEXT DEFAULT ''"],
    ["summary_output", "TEXT DEFAULT ''"]
  ];
  if (!tableColumnExists("validation_jobs", "user_id")) {
    db.exec("ALTER TABLE validation_jobs ADD COLUMN user_id TEXT DEFAULT ''");
  }
  for (const [name, definition] of additions.slice(1)) {
    if (!names.has(name)) db.exec(`ALTER TABLE validation_results ADD COLUMN ${name} ${definition}`);
  }
}

function tableColumnExists(table, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((column) => column.name === columnName);
}

function serializeUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url || "",
    role: row.role || "user",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

function isAdminEmail(email) {
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(email || "").toLowerCase());
}
