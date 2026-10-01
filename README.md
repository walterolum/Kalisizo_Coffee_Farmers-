# Kalisizo Coffee Cooperative — Website & CMS

Official website and content management system for **Kalisizo Coffee Farmers
Cooperative Society Ltd**, Kalisizo Sub County, Kyotera District, Uganda.

The public site is a multi-page Next.js application. Content is managed through a
role-based CMS at `/admin`, backed by PostgreSQL through Prisma.

---

## Quick start

```bash
npm install

# Create .env from the template and set DATABASE_URL and JWT_SECRET
cp .env.example .env

# Apply the database migrations
npm run db:deploy

# Create the first Super Administrator (writes ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run db:seed

# Start the dev server on http://localhost:3000
npm run dev
```

The CMS is at **http://localhost:3000/admin**. The public site is at
**http://localhost:3000**.

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Run the unit test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:generate` | Regenerate the Prisma client after schema edits |
| `npm run db:deploy` | Apply migrations (use in production) |
| `npm run db:migrate` | Create a new migration from schema edits (development) |
| `npm run db:seed` | Seed reference data and the first admin account |
| `npm run db:studio` | Open Prisma Studio |

---

## Environment variables

Copy `.env.example` to `.env`. See that file for the full annotated list.

The values that matter most:

| Variable | Required in production | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Random 32+ byte secret. The app refuses to boot in production with the dev fallback |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical origin, used for metadata, canonical URLs, `sitemap.xml` and `robots.txt`. Inlined at build time |
| `CLOUDINARY_*` | Either these or `ALLOW_LOCAL_UPLOADS` | Image uploads. With neither set, uploads return HTTP 503 in production |
| `RESEND_API_KEY` | Recommended | Contact-form notification email. Without it, emails are logged instead of sent |
| `CONTACT_INBOX` | Recommended | Where contact notifications are delivered |
| `ALLOWED_ORIGINS` | Yes | Comma-separated browser origins for CORS |

Production values are documented in `.env.example.production`, not here.

Generate a secret with:

```bash
openssl rand -hex 32
```

---

## Public site

| Route | Contents |
| --- | --- |
| `/` | Home — hero, mission, programs, products, gallery, leadership, impact, news, contact |
| `/about` | About page (CMS-managed, with a bundled fallback) plus live leadership and impact records |
| `/programs`, `/programs/[slug]` | Programs and services, and each program's detail page |
| `/products` | Product catalog, filterable by category |
| `/projects`, `/projects/[slug]` | Projects, filterable by stage, and detail pages |
| `/news`, `/news/[slug]` | Newsroom and articles |
| `/events`, `/events/[slug]` | Upcoming and past events, and detail pages |
| `/gallery` | Photo gallery, filterable by album |
| `/publications` | Downloadable reports, forms and policies |
| `/contact` | Contact details, enquiry form, map and FAQ |
| `/search` | Site search across news, projects, events and documents |
| `/p/[slug]` | Any other CMS-managed page |
| `/api/v1/health` | Liveness probe. Reports app and database state separately; used by the container healthcheck |

All public pages are rendered per request (`dynamic = "force-dynamic"`, declared
once in `src/app/(site)/layout.tsx`) so newly published content appears
immediately without a redeploy.

### Content visibility

Public pages and public API routes only ever return content that is
**`status: PUBLISHED`** and **`deletedAt: null`**. An unpublished or archived
record returns 404 rather than an empty page, so a draft URL cannot be guessed
or indexed.

---

## CMS

See **[docs/CMS-GUIDE.md](docs/CMS-GUIDE.md)** for the staff-facing guide:
signing in, roles, uploading media, and the current state of each admin screen.

### Admin screen coverage

The public site and the management API cover the full content model. The admin
**screens** do not all exist yet.

| Has an admin screen | API only — no admin screen yet |
| --- | --- |
| Home, About & Leadership, Services, Products & Catalog, Success Stories, Store Location, Contact Us, Inquiries | News, Events, Projects, Gallery, Publications, Announcements, generic pages, Activity log, User management, Site settings |

Content in the right-hand column currently has to be created or changed by a
developer, though the public pages and endpoints for it work correctly. This gap
is tracked in `docs/CMS-GUIDE.md` §11.

### Roles

| Role | Can do |
| --- | --- |
| **Super Administrator** | Everything, including user management, restore, and the activity log |
| **Content Administrator** | All content, publishing, archiving and site settings. No user management |
| **Editor** | Create and edit drafts, upload media. Cannot publish, archive or change settings |

The permission matrix lives in `src/lib/admin-guard.ts` and is the single source
of truth; API routes never re-implement role checks.

### Editorial workflow

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`

Archiving soft-deletes content: it disappears from the public site but can be
restored. Content is only ever permanently removed by an explicit Super
Administrator action.

---

## Architecture notes

```
prisma/schema.prisma        Data model
prisma/migrations/          Ordered SQL migrations
src/app/(site)/             Public pages (shared header/footer shell)
src/app/admin/              CMS
src/app/api/v1/admin/       Authenticated CMS API
src/app/api/v1/             Public read API
src/app/uploads/[file]/     Serves locally stored uploads
src/lib/admin-guard.ts      Permission matrix and route guards
src/lib/admin-content.ts    Shared create/update/delete/restore handling
src/lib/workflow.ts         Status transitions and publish timestamps
src/lib/site-content.ts     Server-side reads for public pages
src/lib/realtime.ts         Client poll/SSE subscription used by the admin panels
src/lib/upload-storage.ts   Upload paths, filename allowlist and the production gate
tests/                      Vitest unit tests
deploy/                     Dockerfile targets, Caddyfile, deploy and backup scripts
docs/                       CMS, deployment and backup guides
```

Public pages are React Server Components that read the database directly through
`src/lib/site-content.ts`. Those helpers never throw: if the database is
unavailable a page still renders its chrome with an empty state rather than a
500.

---

## Testing

```bash
npm test
```

The suite covers the security- and correctness-critical pure logic: image
type sniffing for uploads, the editorial workflow, the permission matrix, the
password policy, slug generation, and pagination clamping.

---

## Deployment and operations

Production runs as four containers on one Linux server: `app` (the Next.js
standalone server), `db` (PostgreSQL), `migrate` (one-shot, not started by `up`),
and `caddy` for automatic HTTPS.

```bash
cp .env.example.production .env
chmod 600 .env
openssl rand -hex 32   # -> JWT_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD

./deploy/deploy.sh --seed
```

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — production deployment, environment setup, and the pre-launch checklist.
- **[docs/BACKUP.md](docs/BACKUP.md)** — database backups and restore procedure.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Two targets: `runner` (minimal server image) and `migrate` (full toolchain for migrations) |
| `docker-compose.yml` | The four services, plus named volumes for the database and uploads |
| `deploy/Caddyfile` | TLS termination and reverse proxy. Configures buffering for the SSE stream |
| `deploy/deploy.sh` | Validate config, build, migrate, start, health-check |
| `deploy/backup.sh` | Nightly `pg_dump`, verifies the dump, prunes by retention |
| `.env.example.production` | Annotated production configuration |

---

## Content images

Admin uploads are validated by their actual file contents, not the
client-declared MIME type, so an HTML or SVG payload cannot be uploaded as
`image/png` and served from the site's own origin. See
`src/lib/image-sniff.ts`.

If you add an image host, add it to `images.remotePatterns` in
`next.config.ts`, otherwise `next/image` will refuse to render it.
