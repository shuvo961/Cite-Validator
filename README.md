# Cite Validator

A free, dependency-free local web app for reference validation, citation checking, and detecting likely hallucinated or fabricated academic citations.

## What It Does

The MVP lets users paste references or import `.txt`, `.bib`, `.ris`, and `.csv` files, choose a citation style, and run a validation pipeline that:

- Parses references into structured fields.
- Uses local AI-style paste repair for messy PDF/OCR bibliography text, broken DOI URLs, page-number runs, flattened query strings, and compact author-year references.
- Normalizes titles, authors, containers, years, DOIs, ISBNs, ISSNs, PMIDs, and arXiv IDs.
- Searches trusted metadata sources first: DOI.org, Crossref, OpenAlex, PubMed, arXiv, Google Books, and Semantic Scholar.
- Compares the user citation against the best metadata record field by field.
- Classifies each reference as `Verified`, `Partially verified`, `Suspicious`, `Likely hallucinated/fabricated`, or `Unverifiable`.
- Produces confidence and hallucination risk scores.
- Shows a corrected reference in APA, IEEE, MLA, Chicago, or Vancouver style.
- Exports CSV and PDF reports.

Google Scholar is intentionally not automated in this MVP because scraping it can violate terms or trigger blocking. Treat it as a manual fallback.

## Architecture

- Frontend: static HTML/CSS/JS in `public/`.
- Backend: Node.js HTTP server in `server.js`.
- Database: built-in Node `node:sqlite`, schema in `schema.sql`, data stored in `data/cite-validator.sqlite`.
- Validation pipeline: `src/pipeline.js`.
- Parsing: `src/parser.js`.
- Matching/scoring: `src/matcher.js`, `src/hallucination.js`.
- Metadata adapters: `src/sources/`.
- Exports: `src/export/`.

No npm packages are required. Node 24+ is enough.

For the complete product and production architecture plan, see `ARCHITECTURE.md`.

## Recommended Production Architecture

For a full reliable product, use:

- Frontend: Next.js or Remix with a dense reviewer dashboard, import wizards, result filters, and batch job progress.
- Backend: TypeScript Node.js with Fastify or NestJS.
- Workers: BullMQ, Temporal, or Cloud Tasks for rate-limited metadata lookup jobs.
- Database: PostgreSQL with JSONB for source evidence, plus Redis for queue state and source response caching.
- Search cache: OpenSearch or Postgres full-text indexes for prior validated records.
- Object storage: S3-compatible storage for uploaded RIS/BibTeX/CSL/CSV/PDF/DOCX files.
- Observability: OpenTelemetry, structured logs, per-source latency/error metrics.

## Metadata Sources

Practical first integrations:

- DOI.org: DOI resolution with CSL JSON.
- Crossref: journal articles, conference papers, books, reports, DOI metadata.
- OpenAlex: broad open scholarly metadata and disambiguation.
- PubMed: biomedical articles and PMID validation.
- arXiv: preprint metadata.
- Google Books: ISBN/book metadata.
- Semantic Scholar: optional paper metadata; API key improves limits.

Advanced paid or licensed integrations:

- WorldCat, IEEE Xplore, ACM Digital Library, Springer Nature, Elsevier Scopus/ScienceDirect, Wiley, Taylor & Francis, ORCID, Retraction Watch.

## Matching Algorithm

1. Prefer exact identifier lookup: DOI, PMID, arXiv ID, ISBN.
2. Search bibliographic metadata with title, first author, year, and container.
3. Normalize candidate records into one common shape.
4. Compute weighted field scores:
   - Title: 27%
   - Authors and order: 18%
   - DOI: 14%
   - Year: 11%
   - Journal/conference: 11%
   - ISBN: 8%
   - Volume/issue/pages: 11% combined
5. Multiply by source reliability.
6. Select the highest scoring source record.
7. Explain every mismatch and never fill unknowns from guesses.

## Hallucination Logic

The detector increases risk when:

- No trusted metadata record is found.
- A supplied DOI resolves to a different title or author list.
- Title and author both mismatch a real source.
- Real journals/conferences are paired with nonexistent titles.
- Core fields are missing.
- Year, volume, issue, pages, publisher, or identifiers disagree.
- Duplicates are found within the same batch.

It reduces risk when multiple high-reliability sources agree with the citation.

## API Design

- `GET /api/health`
  - Returns app health.
- `POST /api/validate`
  - Body: `{ "referencesText": "...", "style": "apa" }`
  - Returns a validation job with per-reference results.
- `GET /api/jobs/:id`
  - Returns a saved job.
- `GET /api/jobs/:id/export.csv`
  - Downloads CSV.
- `GET /api/jobs/:id/export.pdf`
  - Downloads PDF.

## Database Schema

See `schema.sql`.

Core tables:

- `validation_jobs`: original input, style, summary, timestamp.
- `validation_results`: parsed fields, status, scores, source evidence, corrected reference, mismatches.

## Error Handling Strategy

- Each metadata source is isolated. If one fails, the pipeline continues.
- Timeouts are short so batch validation does not hang.
- Source failures appear in the evidence trail.
- Unknown results are marked `Unverifiable` or `Suspicious`, not guessed.
- Input size is capped at 120,000 characters for the MVP.

## Security, Privacy, and Rate Limits

- Do not store uploaded full papers unless required.
- Store original references because users expect report history; add retention controls in production.
- Avoid sending sensitive manuscript text to third-party APIs. Send only references.
- Add authentication before deployment beyond localhost.
- Add per-user rate limits and source response caching.
- Use `CONTACT_EMAIL` for polite Crossref/OpenAlex user agents.
- Respect source terms. Do not scrape Google Scholar.

## Local Setup

```powershell
Copy-Item .env.example .env
node server.js
```

Open:

```text
http://localhost:3000
```

Run tests:

```powershell
node --test
```

Try a validation from PowerShell:

```powershell
$body = @{
  style = "apa"
  referencesText = "Harris, C. R., Millman, K. J., van der Walt, S. J., et al. (2020). Array programming with NumPy. Nature, 585, 357-362. https://doi.org/10.1038/s41586-020-2649-2"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/validate -Method Post -ContentType "application/json" -Body $body
```

## Deployment

For full deployment instructions, see `DEPLOYMENT.md`.

Simple VM or container deployment:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

Production notes:

- Mount `data/` as persistent storage or move to managed PostgreSQL.
- Set `CONTACT_EMAIL`.
- Put the app behind TLS.
- Add authentication and per-account usage limits.
- Add caching for source API responses.

## MVP Roadmap

1. Paste references and validate them against public APIs.
2. Export CSV/PDF.
3. Add BibTeX/RIS/EndNote/CSL import.
4. Add user accounts and saved projects.
5. Add source caching and queue-backed batch validation.
6. Add retraction checks via Crossmark, PubMed publication types, and licensed Retraction Watch data.
7. Add journal-specific citation style rendering with CSL.
8. Add manuscript upload and in-text citation cross-checking.
9. Add official publisher API integrations where licensed.
10. Add human reviewer workflow for uncertain references.

## Known MVP Limits

- Parsing free-form references is heuristic. Production should add AnyStyle, GROBID, CERMINE, ParsCit, or a trained reference parser.
- Citation formatting is practical but not full CSL-compliant.
- Retraction detection is not complete without licensed datasets.
- WorldCat, IEEE, ACM, Elsevier, Springer, Wiley, and Taylor & Francis usually require API keys or licensing.
