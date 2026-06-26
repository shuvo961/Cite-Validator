PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS validation_jobs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT DEFAULT '',
  input_text TEXT NOT NULL,
  selected_style TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  summary_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES validation_jobs(id) ON DELETE CASCADE,
  reference_index INTEGER NOT NULL,
  original_reference TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  status TEXT NOT NULL,
  hallucination_risk_level TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  hallucination_risk_score REAL NOT NULL,
  detected_citation_style TEXT DEFAULT '',
  output_style TEXT DEFAULT '',
  brief_summary TEXT DEFAULT '',
  summary_output TEXT DEFAULT '',
  corrected_reference TEXT NOT NULL,
  matched_source_json TEXT NOT NULL,
  field_comparisons_json TEXT NOT NULL,
  mismatches_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recommended_action TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT '',
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
