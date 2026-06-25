import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
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
    (id, created_at, input_text, selected_style, source_count, summary_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertJob.run(
    job.id,
    job.createdAt,
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

function migrate() {
  const columns = db.prepare("PRAGMA table_info(validation_results)").all();
  const names = new Set(columns.map((column) => column.name));
  const additions = [
    ["detected_citation_style", "TEXT DEFAULT ''"],
    ["output_style", "TEXT DEFAULT ''"],
    ["brief_summary", "TEXT DEFAULT ''"],
    ["summary_output", "TEXT DEFAULT ''"]
  ];
  for (const [name, definition] of additions) {
    if (!names.has(name)) db.exec(`ALTER TABLE validation_results ADD COLUMN ${name} ${definition}`);
  }
}
