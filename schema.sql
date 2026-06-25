PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS validation_jobs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
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
