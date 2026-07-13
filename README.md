# Cite Validator

Cite Validator is a web app for checking academic references, validating DOI metadata, detecting likely fabricated citations, and exporting citation reports.

It includes a citation validator, citation converter, DOI checker, fake citation detector, dashboard, Google login support, and admin monitoring foundation.

## Features

- Paste one or more academic references and validate them against trusted metadata sources.
- Detect suspicious, unverifiable, or likely fabricated citations.
- Check DOI/title/author/year/journal/page consistency.
- Convert citations into common styles such as APA, MLA, IEEE, Chicago, Vancouver, ACS, and Harvard.
- Export reports as CSV, PDF, DOC, BibTeX, and RIS.
- Save validation history for logged-in users.
- Use Google OAuth for production login.

## Tech Stack

- Backend: Node.js HTTP server
- Frontend: static HTML, CSS, and JavaScript
- Local database: SQLite via Node's built-in `node:sqlite`
- Deployment target: Render or any Node-compatible host

## Requirements

- Node.js `24+`
- A Google Cloud OAuth client if using Google login
- Optional persistent storage for SQLite in production

## Local Setup

Copy the environment example:

```bash
cp .env.example .env
```

Install and run:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Run tests:

```bash
npm test
```

## Environment Variables

Create a local `.env` file or configure these in your hosting provider.

```env
NODE_ENV=production
APP_BASE_URL=https://your-domain.example
CONTACT_EMAIL=you@example.com
ADMIN_EMAILS=admin@example.com
SESSION_SECRET=replace-with-a-long-random-secret
CORS_ORIGINS=https://your-domain.example
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SYNC_VALIDATION_LIMIT=30
```

Optional source API keys:

```env
NCBI_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=
RESEND_API_KEY=
MAIL_FROM=
```

Never commit `.env`, OAuth secrets, API keys, database files, or exported reports.

## Google OAuth Setup

In Google Cloud Console:

1. Create an OAuth client.
2. Choose application type: `Web application`.
3. Add this authorized redirect URI:

```text
https://your-domain.example/auth/google/callback
```

For local testing you can also add:

```text
http://localhost:3000/auth/google/callback
```

Then set:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_BASE_URL=https://your-domain.example
```

If the OAuth consent screen is in testing mode, add your Google account under test users.

## Render Deployment

Create a Render Web Service from this GitHub repository.

Use:

```bash
npm install
```

as the build command, and:

```bash
node server.js
```

as the start command.

Set the health check path:

```text
/api/health
```

Render sets `PORT` automatically. Do not hardcode the port in production.

## Database Notes

The current app uses SQLite by default:

```text
data/cite-validator.sqlite
```

For a small beta deployment on Render, attach a persistent disk so the SQLite database survives restarts and deploys.

For heavier production traffic, migrate to PostgreSQL and update the database layer before relying on `DATABASE_URL`.

## Useful Routes

```text
/                         Landing page
/validate                 Citation validator
/converter                Citation converter
/doi-checker              DOI checker
/fake-citation-detector   Fake citation detector
/login                    Google login page
/dashboard                User dashboard
/api/health               Health and readiness status
```

## Security Notes

- Do not commit `.env`.
- Do not commit `data/*.sqlite`.
- Use a strong `SESSION_SECRET`.
- Use HTTPS in production.
- Restrict admin access with `ADMIN_EMAILS`.
- Keep OAuth credentials in your hosting provider's environment variables.
- Review source API terms before increasing request volume.

## Known Limits

- Free-form citation parsing is heuristic and can be imperfect.
- Citation formatting is practical, not a full CSL implementation.
- The local queue is in-memory unless upgraded.
- SQLite is suitable for local use and small beta deployments, but PostgreSQL is recommended for serious production use.

## License

Private project unless a license is added.
