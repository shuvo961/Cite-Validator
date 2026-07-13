# Cite Validator Architecture

This document turns the product requirements into an implementation plan for the runnable MVP in this repository and the production system it can grow into.

## Product Goal

The app validates academic references by parsing user-provided citations, checking them against trusted metadata sources, comparing fields one by one, and clearly marking uncertain or unverifiable cases instead of guessing.

Supported evidence classes:

- Articles, books, chapters, theses, reports, preprints, and conference papers.
- Titles, authors and author order, year, journal or conference, publisher, volume, issue, pages, article number, DOI, ISBN, ISSN, PMID, arXiv ID, and related identifiers.
- APA, IEEE, MLA, Chicago, and Vancouver output in the MVP, with journal-specific CSL styles as an advanced feature.

## MVP Architecture

- Frontend: static HTML, CSS, and JavaScript in `public/`.
- Backend: Node.js HTTP server in `server.js`.
- Database: Node built-in SQLite through `node:sqlite`, initialized from `schema.sql`.
- Parsing: heuristic free-form parser in `src/parser.js`.
- Normalization: `src/normalize.js`.
- Source adapters: `src/sources/`.
- Matching: weighted field comparison in `src/matcher.js`.
- Hallucination detection: rule-based classifier in `src/hallucination.js`.
- Citation rendering: practical style formatter in `src/citation.js`.
- Exports: CSV and simple PDF in `src/export/`.

## Production Architecture

- Frontend: Next.js or Remix with project folders, batch status, filters, editable corrected citations, and reviewer notes.
- API: TypeScript Fastify or NestJS service.
- Workers: BullMQ, Temporal, or cloud task queues for source lookups and retry policies.
- Database: PostgreSQL with JSONB columns for parsed references, source evidence, and comparison results.
- Cache: Redis for source responses, DOI lookups, and rate-limit state.
- Search: Postgres full-text search or OpenSearch for previously validated citations and internal metadata cache.
- Object storage: S3-compatible storage for imported RIS, BibTeX, CSL JSON, EndNote XML, PDF, DOCX, and spreadsheet files.
- Observability: OpenTelemetry traces, structured logs, source error dashboards, and batch-level audit trails.

## Recommended APIs and Databases

Free and practical APIs:

- DOI.org CSL JSON for DOI resolution.
- Crossref for DOI, journal article, book, conference, report, and publisher metadata.
- OpenAlex for broad scholarly metadata and disambiguation.
- PubMed E-utilities for biomedical article and PMID validation.
- arXiv Atom API for preprint metadata.
- Google Books API for ISBN and book metadata.
- Semantic Scholar Graph API for additional article metadata, ideally with an API key.
- DataCite for datasets, software, preprints, reports, and non-Crossref DOIs.

Licensed or advanced sources:

- WorldCat for library-grade book and thesis verification.
- IEEE Xplore, ACM Digital Library, Springer Nature, Elsevier, Wiley, Taylor & Francis, and official publisher APIs.
- ORCID for author identity checks, not as proof that a paper exists.
- Retraction Watch, Crossmark, PubMed publication types, and publisher pages for retraction status.

Google Scholar should remain a manual fallback. Automated scraping can violate terms and is brittle.

## Reference Parsing Strategy

MVP:

1. Split input into references by blank lines or citation-looking line starts.
2. Extract identifiers first: DOI, ISBN, ISSN, PMID, arXiv ID.
3. Extract year, authors, title, container, volume, issue, pages, article number, and publisher with conservative heuristics.
4. Preserve raw text and expose parsed fields in the result for transparency.

Production:

- Add AnyStyle, GROBID, CERMINE, ParsCit, or a trained parser.
- Support BibTeX, RIS, EndNote XML, CSL JSON, CSV, DOCX, and PDF bibliography extraction.
- Cross-check in-text citations against the bibliography.

## Matching Algorithm

1. Prefer exact identifier lookups: DOI, PMID, arXiv ID, ISBN.
2. Search bibliographic sources using title, first author, year, and container.
3. Normalize all candidate records to a shared schema.
4. Compare fields:
   - Title similarity.
   - Author names and order.
   - Year equality.
   - DOI/ISBN exact match.
   - Journal or conference similarity.
   - Volume, issue, page range, article number, and publisher.
5. Apply source reliability weighting.
6. Select the highest scoring record.
7. Return all important mismatches and source evidence.

## Hallucination Detection Logic

Classifications:

- Verified: strong authoritative match with no hard mismatch.
- Partially verified: source exists but some metadata needs correction.
- Suspicious: weak or conflicting evidence.
- Likely hallucinated/fabricated: DOI-title-author conflict, severe mismatch, or implausible record unsupported by trusted sources.
- Unverifiable: insufficient evidence; the app must not guess.

Risk increases when:

- No trusted source confirms the record.
- A DOI resolves to a different title or author set.
- Real authors are attached to a different title.
- A real journal/conference is paired with an unconfirmed title.
- Year, volume, issue, pages, publisher, or identifiers disagree.
- Core fields are missing.
- Duplicate references appear in a batch.
- Only low-quality sources support the citation.

Risk decreases when multiple reliable sources agree.

## Confidence Scoring

The MVP uses weighted normalized field scores:

- Title: 27%.
- Authors and order: 18%.
- DOI: 14%.
- Year: 11%.
- Journal/conference: 11%.
- ISBN: 8%.
- Volume: 4%.
- Issue: 3%.
- Pages/article number: 4%.

The weighted score is multiplied by source reliability. Missing user fields are not treated as full mismatches, but they lower completeness and may reduce confidence.

## API Endpoints

- `GET /api/health`
  - Health check.
- `POST /api/validate`
  - Body: `{ "referencesText": "...", "style": "apa" }`
  - Returns a validation job.
- `GET /api/jobs/:id`
  - Returns a saved validation job.
- `GET /api/jobs/:id/export.csv`
  - Exports results as CSV.
- `GET /api/jobs/:id/export.pdf`
  - Exports results as PDF.

## Database Schema

See `schema.sql`.

Tables:

- `validation_jobs`: stores original input, selected style, summary, source count, and created time.
- `validation_results`: stores parsed JSON, status, confidence, hallucination score, corrected citation, matched source, field comparisons, mismatches, evidence, and recommended action.

Production additions:

- `users`, `projects`, `uploaded_files`, `metadata_cache`, `source_requests`, `review_notes`, `citation_styles`, and `audit_events`.

## Example User Flow

1. User pastes or imports references.
2. User selects APA, IEEE, MLA, Chicago, or Vancouver.
3. The backend parses each citation.
4. Source adapters query trusted metadata providers.
5. The matcher selects the best candidate and compares fields.
6. The classifier assigns status, confidence, and hallucination risk.
7. UI shows original, corrected citation, field table, evidence trail, source links, and recommended action.
8. User exports CSV or PDF.

## Error Handling

- Every source adapter is isolated with timeout handling.
- Failed sources are listed in evidence instead of failing the whole job.
- Empty or ambiguous results become `Unverifiable` or `Suspicious`.
- Input length is capped in the MVP.
- Production should add retries with backoff, per-source circuit breakers, and response caching.

## Security, Privacy, and Rate Limits

- Do not send full manuscripts to third-party APIs unless the user explicitly asks.
- Send only bibliographic references where possible.
- Add authentication before internet deployment.
- Add per-user quotas and source-specific rate limiters.
- Cache metadata responses.
- Set `CONTACT_EMAIL` for polite Crossref/OpenAlex identification.
- Encrypt uploaded files at rest in production and add retention controls.

## Development Roadmap

1. MVP paste/import workflow, trusted source lookup, field comparison, confidence/risk scoring, CSV/PDF export.
2. Add DataCite and Crossmark adapters.
3. Add BibTeX/RIS/CSL JSON server-side import with validation errors.
4. Add batch queue, caching, and progress updates.
5. Add manuscript upload and in-text citation matching.
6. Add retraction checks.
7. Add licensed publisher integrations.
8. Add full CSL citation rendering and journal-specific styles.
9. Add reviewer workflow with comments, overrides, and audit logs.
10. Add organization accounts, API keys, and usage analytics.
