# Deploy Cite Validator

Cite Validator is a Node.js web app with static frontend files, API routes, and a local SQLite database. It can be deployed as a standard Node service or as a Docker container.

## Recommended First Deployment: Render

1. Create a GitHub repository and push this project.
2. Go to https://render.com.
3. Choose **New Web Service**.
4. Connect the GitHub repository.
5. Use these settings:
   - Runtime: `Node`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `Node 24+`
6. Add environment variables:

```env
NODE_ENV=production
APP_BASE_URL=https://your-render-app.onrender.com
CONTACT_EMAIL=your-email@example.com
SEMANTIC_SCHOLAR_API_KEY=
NCBI_API_KEY=
```

Render sets `PORT` automatically, so you do not need to set it there.

## Docker Deployment

Build locally:

```powershell
docker build -t cite-validator .
```

Run locally:

```powershell
docker run --rm -p 3000:3000 --env-file .env cite-validator
```

Open:

```text
http://localhost:3000
```

## Railway

1. Push the project to GitHub.
2. Create a Railway project from the repo.
3. Railway should detect Node automatically.
4. Set start command:

```text
npm start
```

5. Add the same environment variables listed above.

## Fly.io

Use the included `Dockerfile`.

```powershell
fly launch
fly deploy
```

For persistent SQLite storage on Fly.io, create and mount a volume at `/app/data`.

## Important Production Notes

- Local SQLite is fine for an MVP/demo, but many free hosts reset local disk on redeploy or sleep.
- For production, move saved validation jobs to PostgreSQL.
- Add rate limiting before significant public traffic.
- Add a privacy notice explaining that references may be sent to public metadata APIs such as Crossref, DOI.org, OpenAlex, PubMed, DataCite, Semantic Scholar, arXiv, Google Books, Open Library, and Europe PMC.
- Do not commit `.env` or SQLite database files. This repo now ignores them.

## Quick Public Launch Checklist

- Set `CONTACT_EMAIL`.
- Set `APP_BASE_URL` to your real domain.
- Confirm `node --test` passes.
- Deploy on Render, Railway, Fly.io, or a VPS.
- Point your domain DNS to the hosting provider.
- Test `/`, `/validate.html`, `/converter.html`, and `/api/health`.
