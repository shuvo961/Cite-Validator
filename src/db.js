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
const ADMIN_EMAIL = "shovon961@gmail.com";

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
     corrected_reference, metadata_completeness_json, matched_source_json, field_comparisons_json,
     mismatches_json, evidence_json, recommended_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(result.metadataCompleteness || {}),
      JSON.stringify(result.matchedSource),
      JSON.stringify(result.fieldComparisons),
      JSON.stringify(result.mismatches),
      JSON.stringify(result.evidence),
      result.recommendedAction
    );
  }
}

export function assignJobFolder({ userId, jobId, folderId }) {
  const job = db.prepare("SELECT * FROM validation_jobs WHERE id = ? AND user_id = ?").get(jobId, userId);
  if (!job) throw new Error("Report not found.");
  const folder = db.prepare("SELECT * FROM project_folders WHERE id = ? AND user_id = ?").get(folderId, userId);
  if (!folder) throw new Error("Folder not found.");
  db.prepare("UPDATE validation_jobs SET folder_id = ? WHERE id = ?").run(folderId, jobId);
  return { jobId, folderId };
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
    folderId: jobRow.folder_id || "",
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
      metadataCompleteness: JSON.parse(row.metadata_completeness_json || "{}"),
      matchedSource: JSON.parse(row.matched_source_json),
      fieldComparisons: JSON.parse(row.field_comparisons_json),
      mismatches: JSON.parse(row.mismatches_json),
      evidence: JSON.parse(row.evidence_json),
      recommendedAction: row.recommended_action
    }))
  };
}

export function getReportNote({ userId, jobId }) {
  return db.prepare("SELECT * FROM report_notes WHERE user_id = ? AND job_id = ?").get(userId, jobId) || null;
}

export function getShareByToken(token) {
  const row = db.prepare("SELECT * FROM share_links WHERE token = ? AND revoked_at = '' AND expires_at > ?").get(String(token || ""), new Date().toISOString());
  if (!row) return null;
  return row;
}

export function revokeShareLink({ userId, shareId }) {
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE share_links SET revoked_at = ? WHERE id = ? AND user_id = ?")
    .run(now, shareId, userId);
  if (!result.changes) throw new Error("Share link not found.");
  return { id: shareId, revoked_at: now };
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

export function createPasswordUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    if (existing.password_hash) throw new Error("An account already exists for this email.");
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET provider = ?, provider_id = ?, name = ?, password_hash = ?, role = ?, last_login_at = ?
      WHERE id = ?
    `).run("password", normalizedEmail, name, hashPassword(password), roleForEmail(normalizedEmail), now, existing.id);
    return getUser(existing.id);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users
    (id, provider, provider_id, name, email, password_hash, avatar_url, role, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, "password", normalizedEmail, name, normalizedEmail, hashPassword(password), "", roleForEmail(normalizedEmail), now, now);
  return getUser(id);
}

export function verifyPasswordUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET last_login_at = ?, role = ? WHERE id = ?").run(now, roleForEmail(normalizedEmail), row.id);
  return getUser(row.id);
}

export function setUserPassword({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!row) throw new Error("Account not found.");
  db.prepare(`
    UPDATE users
    SET password_hash = ?, provider = CASE WHEN provider = 'demo' THEN 'password' ELSE provider END, role = ?
    WHERE id = ?
  `).run(hashPassword(password), roleForEmail(normalizedEmail), row.id);
  return getUser(row.id);
}

export function createPasswordReset(email) {
  const normalizedEmail = normalizeEmail(email);
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!row) return null;
  const rawToken = crypto.randomBytes(28).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 30);
  db.prepare(`
    INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), row.id, hashResetToken(rawToken), now.toISOString(), expires.toISOString());
  return { token: rawToken, expiresAt: expires.toISOString(), email: normalizedEmail };
}

export function resetPasswordWithToken({ email, token, password }) {
  const normalizedEmail = normalizeEmail(email);
  const row = db.prepare(`
    SELECT password_resets.*, users.email
    FROM password_resets
    JOIN users ON users.id = password_resets.user_id
    WHERE users.email = ? AND password_resets.used_at = '' AND password_resets.expires_at > ?
    ORDER BY password_resets.created_at DESC
    LIMIT 1
  `).get(normalizedEmail, new Date().toISOString());
  if (!row || row.token_hash !== hashResetToken(token)) throw new Error("Invalid or expired reset token.");
  db.prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return setUserPassword({ email: normalizedEmail, password });
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

export function deleteUserAccount(userId) {
  const user = getUser(userId);
  if (!user) return false;
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
  db.prepare("UPDATE validation_jobs SET user_id = '' WHERE user_id = ?").run(userId);
  db.prepare("UPDATE user_feedback SET user_id = '' WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}

export function setUserStatus({ userId, status }) {
  const allowed = new Set(["active", "suspended"]);
  const next = allowed.has(status) ? status : "active";
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(next, userId);
  return getUser(userId);
}

export function clearUserHistory(userId) {
  if (!userId) return 0;
  const result = db.prepare("DELETE FROM validation_jobs WHERE user_id = ?").run(userId);
  return result.changes || 0;
}

export function listWorkspaceData(userId) {
  return {
    folders: db.prepare("SELECT * FROM project_folders WHERE user_id = ? ORDER BY created_at DESC").all(userId),
    notes: db.prepare("SELECT * FROM report_notes WHERE user_id = ? ORDER BY updated_at DESC").all(userId),
    shares: db.prepare("SELECT * FROM share_links WHERE user_id = ? ORDER BY created_at DESC").all(userId),
    uploads: db.prepare("SELECT id, user_id, name, type, size, created_at FROM upload_library WHERE user_id = ? ORDER BY created_at DESC").all(userId),
    presets: db.prepare("SELECT * FROM export_presets WHERE user_id = ? ORDER BY created_at DESC").all(userId),
    preferences: Object.fromEntries(db.prepare("SELECT key, value FROM user_preferences WHERE user_id = ?").all(userId).map((row) => [row.key, row.value]))
  };
}

export function createProjectFolder({ userId, name, description = "" }) {
  const now = new Date().toISOString();
  const item = { id: crypto.randomUUID(), user_id: userId, name: String(name || "Untitled project").slice(0, 120), description: String(description || "").slice(0, 500), created_at: now };
  db.prepare("INSERT INTO project_folders (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(item.id, item.user_id, item.name, item.description, item.created_at);
  return item;
}

export function saveReportNote({ userId, jobId, note }) {
  const now = new Date().toISOString();
  const id = `${userId}:${jobId}`;
  db.prepare(`
    INSERT INTO report_notes (id, user_id, job_id, note, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
  `).run(id, userId, jobId, String(note || "").slice(0, 2000), now);
  return { id, user_id: userId, job_id: jobId, note: String(note || "").slice(0, 2000), updated_at: now };
}

export function createShareLink({ userId, jobId, expiresDays = 7 }) {
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Math.min(Number(expiresDays || 7), 30)) * 86400000);
  const item = {
    id: crypto.randomUUID(),
    user_id: userId,
    job_id: jobId,
    token: crypto.randomBytes(18).toString("hex"),
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    revoked_at: ""
  };
  db.prepare("INSERT INTO share_links (id, user_id, job_id, token, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(item.id, item.user_id, item.job_id, item.token, item.created_at, item.expires_at, item.revoked_at);
  return item;
}

export function saveUploadRecord({ userId, name, type, size, contentText = "" }) {
  const now = new Date().toISOString();
  const content = String(contentText || "").slice(0, 500_000);
  const item = { id: crypto.randomUUID(), user_id: userId, name: String(name || "Upload").slice(0, 180), type: String(type || "text/plain").slice(0, 80), size: Number(size || content.length || 0), content_text: content, created_at: now };
  db.prepare("INSERT INTO upload_library (id, user_id, name, type, size, content_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(item.id, item.user_id, item.name, item.type, item.size, item.content_text, item.created_at);
  return item;
}

export function getUploadRecord({ userId, uploadId }) {
  return db.prepare("SELECT * FROM upload_library WHERE id = ? AND user_id = ?").get(uploadId, userId) || null;
}

export function saveExportPreset({ userId, name, style, formats }) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: String(name || "Export preset").slice(0, 120),
    style: String(style || "auto").slice(0, 40),
    formats_json: JSON.stringify(Array.isArray(formats) ? formats.slice(0, 8) : []),
    created_at: now
  };
  db.prepare("INSERT INTO export_presets (id, user_id, name, style, formats_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(item.id, item.user_id, item.name, item.style, item.formats_json, item.created_at);
  return item;
}

export function setUserPreference({ userId, key, value }) {
  db.prepare(`
    INSERT INTO user_preferences (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, String(key).slice(0, 80), String(value ?? "").slice(0, 1000));
  return { key, value };
}

export function listUserJobs(userId, limit = 20) {
  return db.prepare(`
    SELECT id, created_at, folder_id, selected_style, source_count, summary_json
    FROM validation_jobs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    folderId: row.folder_id || "",
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

export function updateFeedbackStatus({ id, status }) {
  db.prepare("UPDATE user_feedback SET status = ? WHERE id = ?").run(String(status || "open").slice(0, 40), id);
  return { id, status };
}

export function listAuditLogs(limit = 100) {
  return db.prepare(`
    SELECT audit_logs.*, users.email
    FROM audit_logs
    LEFT JOIN users ON users.id = audit_logs.user_id
    ORDER BY audit_logs.created_at DESC
    LIMIT ?
  `).all(limit);
}

export function getAdminControlSettings() {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM app_settings").all().map((row) => [row.key, row.value]));
  return {
    providers: {
      crossref: settings.provider_crossref !== "false",
      openalex: settings.provider_openalex !== "false",
      doi: settings.provider_doi !== "false",
      pubmed: settings.provider_pubmed !== "false",
      semanticScholar: settings.provider_semantic_scholar !== "false"
    },
    limits: {
      syncValidationLimit: settings.limit_sync_validation || "",
      perMinute: settings.limit_per_minute || "",
      freeReports: settings.limit_free_reports || "unlimited"
    }
  };
}

export function auditLog({ userId = "", action, detail = {} }) {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, action, JSON.stringify(detail), new Date().toISOString());
}

export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value ?? ""));
  return { key, value: String(value ?? "") };
}

export function getMetadataCache(cacheKey) {
  if (!db || !cacheKey) return null;
  const row = db.prepare(`
    SELECT *
    FROM metadata_cache
    WHERE cache_key = ? AND expires_at > ?
  `).get(cacheKey, new Date().toISOString());
  if (!row) return null;
  return {
    ok: row.status >= 200 && row.status < 300,
    status: row.status,
    contentType: row.content_type,
    payloadText: row.payload_text,
    cached: true
  };
}

export function setMetadataCache({ cacheKey, source = "metadata", url = "", status = 200, payloadText = "", contentType = "application/json", ttlSeconds = 60 * 60 * 24 }) {
  if (!db || !cacheKey || !payloadText) return;
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);
  db.prepare(`
    INSERT INTO metadata_cache
    (cache_key, source, url, status, payload_text, content_type, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      source = excluded.source,
      url = excluded.url,
      status = excluded.status,
      payload_text = excluded.payload_text,
      content_type = excluded.content_type,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  `).run(cacheKey, source, url, status, payloadText, contentType, now.toISOString(), expires.toISOString());
}

export function getMetadataCacheStats() {
  if (!db) return { entries: 0, expired: 0 };
  const now = new Date().toISOString();
  const entries = db.prepare("SELECT COUNT(*) AS count FROM metadata_cache").get().count;
  const expired = db.prepare("SELECT COUNT(*) AS count FROM metadata_cache WHERE expires_at <= ?").get(now).count;
  return { entries, expired };
}

function migrate() {
  const columns = db.prepare("PRAGMA table_info(validation_results)").all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ["validation_jobs", "user_id", "TEXT DEFAULT ''"],
    ["detected_citation_style", "TEXT DEFAULT ''"],
    ["output_style", "TEXT DEFAULT ''"],
    ["brief_summary", "TEXT DEFAULT ''"],
    ["summary_output", "TEXT DEFAULT ''"],
    ["metadata_completeness_json", "TEXT DEFAULT '{}'"]
  ];
  if (!tableColumnExists("validation_jobs", "user_id")) {
    db.exec("ALTER TABLE validation_jobs ADD COLUMN user_id TEXT DEFAULT ''");
  }
  if (!tableColumnExists("validation_jobs", "folder_id")) {
    db.exec("ALTER TABLE validation_jobs ADD COLUMN folder_id TEXT DEFAULT ''");
  }
  if (!tableColumnExists("users", "password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''");
  }
  if (!tableColumnExists("users", "status")) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!tableColumnExists("user_feedback", "status")) {
    db.exec("ALTER TABLE user_feedback ADD COLUMN status TEXT DEFAULT 'open'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      note TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS upload_library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      content_text TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS export_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      style TEXT DEFAULT 'auto',
      formats_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY(user_id, key)
    );
    CREATE TABLE IF NOT EXISTS metadata_cache (
      cache_key TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      status INTEGER NOT NULL,
      payload_text TEXT NOT NULL,
      content_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metadata_cache_expires_at ON metadata_cache(expires_at);
  `);
  for (const [name, definition] of additions.slice(1)) {
    if (!names.has(name)) db.exec(`ALTER TABLE validation_results ADD COLUMN ${name} ${definition}`);
  }
  if (!tableColumnExists("upload_library", "content_text")) {
    db.exec("ALTER TABLE upload_library ADD COLUMN content_text TEXT DEFAULT ''");
  }
  db.prepare("UPDATE users SET role = 'admin' WHERE lower(email) = ?").run(ADMIN_EMAIL);
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
    status: row.status || "active",
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

function isAdminEmail(email) {
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return roleForEmail(email) === "admin" || allowed.includes(String(email || "").toLowerCase());
}

function roleForEmail(email) {
  return normalizeEmail(email) === ADMIN_EMAIL ? "admin" : "user";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return `pbkdf2$sha256$210000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [kind, digest, iterations, salt, expected] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || digest !== "sha256" || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
