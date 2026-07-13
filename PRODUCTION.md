# Cite Validator Production Upgrade Plan

This app runs locally with SQLite so it stays simple and runnable. For a public launch with meaningful traffic, use this plan.

## Required Production Services

- Node.js 24+ web service
- PostgreSQL for users, sessions, reports, admin data, and audit logs
- Redis for cache, rate limiting, and future background queues
- HTTPS at the hosting/provider edge
- External monitoring such as Sentry, Better Stack, Axiom, Logtail, or a VPS log shipper

## Environment Variables

```env
NODE_ENV=production
APP_BASE_URL=https://your-domain.com
CONTACT_EMAIL=you@example.com
ADMIN_EMAILS=shovon961@gmail.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DATABASE_URL=postgresql://user:password@host:5432/citevalidator
REDIS_URL=redis://default:password@host:6379
CORS_ORIGINS=https://your-domain.com
SENTRY_DSN=
LOG_LEVEL=info
```

## PostgreSQL Migration

The current SQLite schema maps directly to PostgreSQL tables:

- `validation_jobs`
- `validation_results`
- `users`
- `password_resets`
- `sessions`
- `user_feedback`
- `app_settings`
- `audit_logs`

Recommended next code step:

1. Add a database adapter layer with `sqlite` and `postgres` implementations.
2. Keep the exported functions in `src/db.js` stable.
3. Move SQL into adapter-specific files.
4. Use `DATABASE_URL` to select PostgreSQL in production.
5. Add migrations using a tool such as `node-pg-migrate`, `drizzle-kit`, or `knex`.

## Redis Usage

Use Redis for:

- API rate limiting across multiple app instances
- Crossref/OpenAlex/DOI lookup cache
- Batch validation job queue
- Temporary OAuth/reset/session metadata if desired

## Monitoring

The MVP now exposes admin-only `/api/admin/monitoring`, which reports runtime status and configuration readiness. For production, add:

- Request logs
- Error logs
- Slow metadata-source tracking
- Alerting for Crossref/OpenAlex/PubMed failures
- Daily backup checks

## Security Checklist

- Use HTTPS only.
- Set `APP_BASE_URL` to the real domain.
- Configure Google OAuth redirect URL: `https://your-domain.com/auth/google/callback`.
- Do not commit `.env` or `data/*.sqlite`.
- Rotate the local test admin password before launch.
- Back up PostgreSQL automatically.
- Keep `/ownershuvo` hidden and unlinked.

## Google OAuth Setup

1. Open Google Cloud Console.
2. Create or select a project.
3. Configure the OAuth consent screen.
4. Create an OAuth Client ID for a web application.
5. Add authorized JavaScript origin:
   - `https://your-domain.com`
6. Add authorized redirect URI:
   - `https://your-domain.com/auth/google/callback`
7. Set these environment variables:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_BASE_URL=https://your-domain.com
```

8. Restart the app and check the hidden admin panel readiness cards.

## Admin Readiness Targets

Before public launch, the admin readiness panel should show:

- Google OAuth: ready
- PostgreSQL: ready
- Redis cache: ready for meaningful public traffic
- Contact email: ready
- Public base URL: ready

SQLite and memory cache are acceptable for local development and private demos only.
