# Hosting Guide

Strategy, costs, and a step-by-step for putting this site online.

This document covers *where to host and why*. For day-to-day operations once it is
live (backups, log rotation, rolling back a bad deploy), see
[DEPLOYMENT.md](./DEPLOYMENT.md).

---

## 1. The short version

**One Hetzner VPS. One Docker Compose stack. One server process.**

```
Caddy  ──TLS──▶  Next.js (frontend + API, one process)  ──▶  PostgreSQL
                                                                  │
                                                        named volume: uploads
```

Cost: **≈ €5.49/month** for the server, plus your domain. That is the entire
recurring bill.

Everything else — the database, file storage, TLS certificates, the realtime
stream — runs on that same box as a container or a directory. No managed service
is required, and none is currently configured.

---

## 2. Options compared

Five realistic ways to host this codebase. Costs are monthly, USD or EUR as
quoted, verified 2 October 2026.

| | Cost/mo | Advantages | Disadvantages |
|---|---|---|---|
| **A. VPS + Docker Compose**<br>*(recommended)* | **€5.49** | Cheapest by an order of magnitude. Full control, no vendor lock-in, your data on hardware you rent. Standard tooling — a Compose file is portable to any provider. Uploads and Postgres stay on one box, so no network hop and no egress fees. | You own uptime, patching, TLS renewal and backups. One box is a single point of failure until you add off-site backups (§7). |
| **B. Vercel** | $0 – $20 | Zero infrastructure to manage. Instant preview deploys per PR. Global CDN and image optimization out of the box. Native Next.js, so almost no code changes for the frontend. | **Does not fit this app without real refactoring.** Serverless has no long-lived process, which breaks three things this codebase relies on. See the note below — this is not a preference, it is architectural. |
| **C. DigitalOcean App Platform** | $5 – $12 | Accepts the existing Dockerfile directly. Managed TLS and auto-deploy. Less to run than raw Docker. | Roughly 2× the cost of the VPS for fewer controls. Vendor-specific config; moving elsewhere means unpicking their platform layer. |
| **D. Supabase-hosted app** | $25 | Managed Postgres, auth, object storage and realtime in one platform. Strong RLS story, which this app already uses. | Supabase is not a Next.js host — you still need somewhere to run the app, so this is **$25 on top of** option A or C, not a replacement. Adopting it means giving up the local-disk and SSE paths that are already built and tested. |
| **E. AWS / GCP** | $25+ (RDS alone) | Every capability, every region, deepest talent pool, strongest compliance story. | Enormous cost trap for this workload. A managed Postgres instance alone exceeds the entire current budget before a single container runs. |

### Why Vercel specifically does not work here

This is worth stating precisely, because Next.js on Vercel is otherwise the obvious
default and the migration path looks trivial from the outside. Three things in this
codebase cannot survive serverless execution:

1. **SSE transport.** `src/lib/realtime-transport/sse.ts` maintains an in-process
   `Map` of live clients with a 200-connection cap and a 25-second heartbeat. That
   state exists in one process's memory. Serverless scales by spawning processes,
   so a client connected to instance A is invisible to a publish handled by
   instance B. Live updates would silently stop working — no error, just stale pages.

2. **In-memory rate limiting.** `src/lib/rate-limit.ts` uses a module-scoped `Map`.
   Across serverless instances each one gets its own bucket, so the login limiter
   (10 attempts / 15 min) becomes 10 × (number of instances). The rate limit would
   be decorative.

3. **Local disk uploads.** `src/lib/upload-storage.ts` writes to `data/uploads` on
   the container filesystem. Serverless filesystems are ephemeral — an image
   disappears at the end of the invocation.

All three are fixable (the codebase already ships Supabase and Cloudinary
adapters), but each fix means building the migration you have not asked for yet,
and the SSE adapter would need to be swapped for Supabase Broadcast before the
first deploy. Choosing Vercel is choosing that work. On a VPS it is zero work.

**Recommendation: option A now.** Revisit at §9.

---

## 3. Why one process, not a separate backend service

A common instinct is to split this into a `frontend/` app and a `backend/` API
server. For *this* codebase that would make deployment harder, not easier, and it
is worth being explicit about why before anyone attempts it.

The site is 16 public pages, one CMS page, and 60 API routes. It has no mobile
client, no third-party API consumer, and no need to scale reads and writes
independently. Splitting would add:

| Cost of splitting | Consequence |
|---|---|
| Rewriting all 60 handlers | Next `Request`/`Response` → a web framework |
| A network hop per API call | Latency, plus a second thing that can fail |
| CORS between origins | Already a security-sensitive area; a new one to get right |
| Cookie/JWT forwarding | Admin auth is same-origin today; splitting adds a token hop |
| Coordinated deploys | Frontend up against a dead backend = broken site, and no health check covers that state |
| Losing shared types | React Server Components currently import backend types directly, at zero cost, with no HTTP hop |
| Two services to scale, monitor, patch and back up | Doubled operational surface, zero benefit at this scale |

What you actually want from a `backend` / `frontend` split is **clarity** — being
able to open the repository and know instantly which code runs on the server. That
is a code-organization problem, and it has a solution that keeps the deployment
simple. §4 gives it to you.

---

## 4. The folder structure

Organized by responsibility, while staying **one application, one build, one
container**. The folders are a compile-time boundary, not a deployment boundary.

```
kalisizo-coffee/
│
├── src/
│   │
│   ├── frontend/                  # code that reaches the browser
│   │   ├── app/
│   │   │   ├── (site)/            # 16 public pages
│   │   │   │   ├── page.tsx               # home
│   │   │   │   ├── about/                 # static
│   │   │   │   ├── contact/               # form + validation
│   │   │   │   ├── gallery/
│   │   │   │   ├── products/
│   │   │   │   ├── publications/
│   │   │   │   ├── search/
│   │   │   │   ├── news/           # index + [slug]
│   │   │   │   ├── events/         # index + [slug]
│   │   │   │   ├── programs/       # index + [slug]
│   │   │   │   ├── projects/       # index + [slug]
│   │   │   │   └── p/              # [slug] generic page renderer
│   │   │   ├── admin/              # CMS shell and client components
│   │   │   ├── layout.tsx          # root layout: metadata, JSON-LD, skip link
│   │   │   ├── robots.ts
│   │   │   ├── sitemap.ts
│   │   │   └── globals.css
│   │   ├── components/            # 40 presentational components
│   │   │   └── admin/
│   │
│   ├── backend/                   # server-only. Never imported by the frontend.
│   │   ├── api/                   # 60 route handlers under v1
│   │   │   └── v1/
│   │   │       ├── admin/         # 20 subgroups: login, users, audit, upload,
│   │   │       │                  #   inquiries, and CRUD per content model
│   │   │       ├── announcements/ ┐
│   │   │       ├── categories/    │
│   │   │       ├── contact/       │
│   │   │       ├── events/        │  read + write endpoints
│   │   │       ├── faq/           │  for each public-facing
│   │   │       ├── gallery/       │  content model
│   │   │       ├── hero/          │
│   │   │       ├── leadership/    │
│   │   │       ├── locations/     │
│   │   │       ├── news/          │
│   │   │       ├── products/      │
│   │   │       ├── projects/      │
│   │   │       ├── publications/  │
│   │   │       ├── search/        │
│   │   │       ├── services/      │
│   │   │       ├── settings/      │
│   │   │       ├── stories/       ┘
│   │   │       ├── realtime/      # SSE stream
│   │   │       └── health/        # liveness + database reachability
│   │   ├── uploads/               # GET /uploads/<name> — serves files from the
│   │   │                          # storage backend, so a new upload resolves
│   │   │                          # immediately (public/ is a start-time file
│   │   │                          # list and would 404 it until restart)
│   │   ├── lib/                   # auth, prisma, permissions, rate-limit,
│   │   │                          # storage, realtime, email, validators,
│   │   │                          # security-policy, sanitize, publish, workflow
│   │   └── server/                # server-only bootstrap and registration
│   │
│   └── shared/                    # imported by BOTH sides. The only shared code.
│       ├── types.ts               # domain types, no behaviour
│       ├── constants.ts           # enums, limits, site-wide constants
│       └── validation.ts          # zod schemas, used client and server
│
├── prisma/                        # DATABASE
│   ├── schema.prisma              # 23 models, 8 enums
│   ├── migrations/                # versioned SQL, applied by `migrate deploy`
│   ├── seed.ts                    # idempotent content seed
│   └── reset.ts                   # local-only truncation helper
│
├── deploy/                        # infrastructure
│   ├── Caddyfile                  # TLS + reverse proxy + security headers
│   ├── deploy.sh                  # pull, build, migrate, health-check, roll back
│   └── backup.sh                  # pg_dump + retention
│
├── public/                        # static assets: images, fonts, og.png, favicon
├── data/uploads/                  # user-uploaded images (gitignored, backed up)
├── scripts/                       # operational tooling
├── tests/                         # 413 tests / 30 files
├── docs/
├── Dockerfile                     # 4-stage multi-target build
├── docker-compose.yml             # app, db, migrate, caddy
└── next.config.ts
```

### The one rule that keeps this honest

> `shared/` must be importable from a React Server Component **and** must contain
> no server-only code: no Prisma client, no `node:fs`, no secrets, no `process.env`.

If a module needs the database or the filesystem, it belongs in `backend/`. The
moment Prisma leaks into `shared/`, the boundary stops existing and the split
becomes cosmetic — which is worse than no split, because it looks correct.

Next.js compiles all three trees into one bundle. The aliases below do not exist
yet — `tsconfig.json` currently declares only `"@/*": ["./src/*"]`. Extend it so the
boundary is explicit and the compiler enforces it:

```jsonc
// tsconfig.json — replace the existing "paths" block with:
"paths": {
  "@/*":         ["./src/*"],
  "@backend/*":  ["./src/backend/*"],
  "@frontend/*": ["./src/frontend/*"],
  "@shared/*":   ["./src/shared/*"]
}
```

Note the internal prefixing. `src/backend` currently begins with `b`, `src/lib`
begins with `l` — so no bare-import collision exists today. The `@backend/`
prefix makes it unambiguous once the tree grows, and gives the move an
intermediary step that never requires a big-bang rename.

### What this structure does not change

- Still one `package.json`, one `node_modules`, one `npm run build`
- Still one Docker image, one container, one `server.js`
- Still one `docker compose up -d`
- Still one database connection, one health endpoint, one deploy command

Nothing about the operational story gets harder. Only the code gets easier to read.

---

## 5. Step by step

### Step 1 — Get a server

Hetzner, EU region (FSN1/NBG1/HEL1). **CX23**: 2 vCPU, 4 GB RAM, 40 GB disk,
0.5 TB traffic included. Adequate headroom for Next.js + PostgreSQL.

```bash
ssh root@<server-ip>
adduser --disabled-password --gecos "" kalisizo
usermod -aG sudo kalisizo
# install Docker using Docker's official apt repository
```

Point DNS at the server's IP **before** continuing — Caddy needs to reach the
domain to obtain a certificate.

### Step 2 — Get the code

```bash
git clone <your-remote> /srv/kalisizo
cd /srv/kalisizo
```

### Step 3 — Configure secrets

```bash
cp .env.example.production .env
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD — hex only; the Compose file
                       # interpolates it into a connection URL, and
                       # special characters break the URL
```

Fill in `.env`:

```bash
POSTGRES_PASSWORD=<hex>
JWT_SECRET=<hex>
NEXT_PUBLIC_SITE_URL=https://your-domain
SITE_DOMAIN=your-domain
ALLOW_LOCAL_UPLOADS=true
ADMIN_EMAIL=admin@kalisizocoop.coop
RESEND_API_KEY=<from resend.com>      # see §6 — without this, contact is silent
CONTACT_INBOX=who-receives-leads@your-domain
```

`NEXT_PUBLIC_SITE_URL` is inlined into the client bundle **at build time**, so
changing the domain requires a rebuild, not just a restart.

### Step 4 — Build and start

```bash
docker compose up -d --build      # builds the image, starts db + app + caddy
docker compose run --rm migrate   # apply migrations — one-shot
docker compose exec app npm run db:seed
```

`migrate` is deliberately not started by `up`. Run it explicitly on first deploy
and after every deploy that ships a new migration — a container that migrates on
startup has a race with itself when more than one replica comes up.

### Step 5 — Verify before trusting it

```bash
curl -f https://your-domain/api/v1/health
```

`curl -f` turns a non-2xx into a non-zero exit. The endpoint checks that the app
is serving **and** that it can reach PostgreSQL — a serving app with a dead
database is the failure worth catching here.

Then confirm assets actually resolve, not just that HTML returns:

```bash
curl -s https://your-domain/ \
  | grep -oE '(src|href)="(/_next|/images)[^"]*"' \
  | sed 's/.*="//;s/"$//' \
  | while read -r a; do
      printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://your-domain$a")" "$a"
    done | grep -v '^200' || echo "all assets OK"
```

Any non-200 line here is the standalone bundle missing `public/` or
`.next/static/` — see §7.

### Step 6 — Create the administrator

```bash
docker compose exec app npm run db:seed
```

Idempotent. Requires both `ADMIN_EMAIL` and `ADMIN_PASSWORD` to be set; enforces
a password policy when `NODE_ENV=production`. See DEPLOYMENT.md §6.

### Step 7 — Point the domain at the server

DNS `A` record → the server IP. Caddy obtains and renews the TLS certificate
automatically within about a minute of the record resolving. There is nothing to
renew by hand, ever.

### Step 8 — Backups, off-site

The default `deploy/backup.sh` writes `pg_dump` output to a directory on the same
box. That protects against a bad migration, not against losing the server. Copy it
off:

```bash
# on the server, via cron
docker compose exec -T db pg_dump -U kalisizo kalisizo_coffee | gzip > /srv/backups/db-$(date +%F).sql.gz
rsync -az /srv/backups/ user@offsite-host:/backups/kalisizo/
rsync -az /srv/kalisizo/data/uploads/ user@offsite-host:/backups/kalisizo-uploads/
```

Verify a restore once, on a scratch machine. An untested backup is a hypothesis.

---

## 6. Enable email before you launch — it is free

`RESEND_API_KEY` is currently empty. With it empty the contact form **stores the
inquiry and returns HTTP 200**, and emails nobody:

```
POST /api/v1/contact  →  200 OK
Resend API key not configured; inquiry 42 stored without notification
ContactInquiry row exists. Lead is sitting in the database, unseen.
```

This is the single highest-value zero-cost item on this page. Leads arrive, the
form reports success, and nobody is told. Resend's free tier is 3,000 emails per
month — orders of magnitude more than a cooperative receives in a month.

Upstream it at resend.com, add the sending domain, then verify SPF and DKIM
before launch. Until the domain is verified, Resend only sends to your own
address, so the failure stays hidden in testing and appears on launch day.

---

## 7. The standalone bundle trap

`next.config.ts` sets `output: "standalone"`, which means **`next start` does not
work**. Next.js rejects it outright. `npm start` runs
`scripts/start-standalone.mjs`, which performs three copies `next build` does not
make, then execs the generated server:

| From | To | If skipped |
|---|---|---|
| `public/` | `.next/standalone/public/` | 404 on every image and static file |
| `.next/static/` | `.next/standalone/.next/static/` | 404 on every CSS and JS chunk |
| `node_modules/.prisma`, `@prisma/client` | standalone `node_modules/` | fails on first query |

Skipping these produces a **deceptive** failure, which is why they are automated
rather than documented as a step to remember:

```
/api/v1/health         -> 200
/                     -> 200
/_next/static/...     -> 404
/images/logo-light.png -> 404
```

The process starts, the health check passes, the homepage serves — and every
stylesheet, script and image 404s. Uptime monitors report a healthy service; a
visitor gets an unstyled page. Step 5's asset sweep exists to catch exactly this,
because the health endpoint will not.

**Docker is unaffected.** Its `runner` stage performs all three copies and `CMD`
is `node server.js`.

---

## 8. Database

PostgreSQL 16, self-hosted, in the same Compose stack.

### Topology

```
app  ──DATABASE_URL──▶  db:5432      postgres:16-alpine
                            │
                      volume: db-data
                            │
                      /var/lib/postgresql/data/pgdata   (PGDATA)
```

- **`db` is not published to the host.** No `ports:` mapping. Only the `app` and
  `migrate` services reach it, over the internal `backend` network. This is
  deliberate: a published Postgres port is a password-guessing target with
  internet-wide exposure.
- **`PGDATA` points one level down.** Postgres refuses to initialize into a
  non-empty directory, which is exactly what a bind-mounted volume provides on
  Linux. Nesting it in a subdirectory sidesteps that.
- **Connection pool:** `connection_limit=5&pool_timeout=20`. Prisma opens a fixed
  pool per process; low is right for a single-instance app and prevents a request
  burst from exhausting Postgres' default 100 backends.
- **Row Level Security** is enabled against a non-superuser application role —
  `npm run db:rls-verify` confirms it. The app role is not the owner, so a
  compromised query cannot simply bypass RLS.

### Schema

23 models, 8 enums, covering the whole CMS: `NewsArticle`, `Event`, `Product`,
`Service`, `Program`, `Project`, `GalleryAlbum`, `GalleryImage`, `Page`,
`FaqItem`, `Announcement`, `Publication`, `StoreLocation`, `LeadershipMember`,
`SuccessStory`, `ContactInquiry`, `User`, `AuditLog`, `SiteSetting`,
`CooperativeInfo`, `Category`, `SocialLink`, `Tag`.

Three enums carry the business rules:

```prisma
enum UserRole      { SUPER_ADMIN  CONTENT_ADMIN  EDITOR }
enum ContentStatus { DRAFT  IN_REVIEW  PUBLISHED  ARCHIVED }
enum ProjectStage  { ONGOING  COMPLETED }
```

`ContentStatus` implements a real editorial workflow — `DRAFT → IN_REVIEW →
PUBLISHED → ARCHIVED` — with server-side permission checks per transition, not
just a hidden button in the UI.

### Migrations

```bash
docker compose run --rm migrate    # applies everything not yet applied
```

Versioned SQL in `prisma/migrations/`, applied with `prisma migrate deploy`. Never
`db push` against production — `push` reconciles the schema without recording the
steps, so you lose the ability to replay or roll back history.

Before deploying a migration, check it does not destroy data:

```bash
npm run db:drift      # compares migrations against schema.prisma
```

### Growth

At cooperative scale this database will never be the bottleneck. It outgrows a
4 GB box at roughly 50k–100k rows plus a heavy traffic day — years away. When it
arrives, the migration path is mechanical, because the app only talks to Prisma:

1. `pg_dump` and restore into Supabase or RDS
2. Point `DATABASE_URL` at the new host
3. Redeploy — no application code changes

That is the practical argument for self-hosting now: the exit cost is one
environment variable and a data copy, not a rewrite.

---

## 9. Cost summary

| Item | Provider | Cost | Required |
|---|---|---|---|
| Server | Hetzner CX23 | €5.49/mo | **Yes** |
| Domain | your registrar (`.coop`) | ~€2/mo equivalent | **Yes** |
| TLS certificate | Let's Encrypt via Caddy | €0 | Yes, automatic |
| PostgreSQL | same box | €0 | Yes, included |
| File storage | same box, named volume | €0 | Yes, included |
| Realtime (SSE) | same box, in-process | €0 | Yes, included |
| Off-site backups | second Hetzner box or Storage Box | ~€3–5/mo | **Strongly advised** |
| Email | Resend | €0 (3,000/mo) | **Strongly advised** |
| **Total** | | **≈ €8–13/mo** | |

Optional, only if you need them: Cloudinary Plus $89/mo (free tier's 25 credits is
ample here), Supabase Pro $25/mo, Resend Pro $20/mo above 3,000 emails/month.

### When to reconsider

| Signal | Move to |
|---|---|
| You need uptime you cannot staff | Managed host — Supabase ($25) or DO App Platform ($12) |
| Images exceed ~5 GB or traffic is global | Cloudinary ($0–89) |
| Email exceeds 3,000/month | Resend Pro ($20) |
| Anyone outside your team needs the API | Split the backend out — but only then |
| Postgres outgrows the box | Managed Postgres; one env var, no code change |

None of these apply yet. Keep the bill at ≈ €8 and spend the saved engineering
time on the content, which is what this site is for.

---

## 10. Automated deploys from GitHub

`.github/workflows/deploy.yml` deploys on every push to `main`:

```
verify  →  typecheck · lint · 413 tests · build      (a failed gate blocks the deploy)
deploy  →  SSH in · git reset --hard origin/main · ./deploy/deploy.sh
        →  curl the site over real TLS, retrying
```

`deploy/deploy.sh` already does the real work — validating `.env`, rejecting a
URL-unsafe `POSTGRES_PASSWORD`, then build → migrate → start → health-check. The
workflow only decides *when* it runs.

### Three deliberate choices

**`.env` is not a GitHub secret.** It lives only on the VPS. The workflow SSHes in
and runs `deploy.sh`, which reads the server's own `.env`. Rotating a secret is
`ssh server vim .env` with no GitHub change, and there is one copy of production
configuration rather than two that can drift.

**No third-party actions.** The only `uses:` entries are GitHub's own `checkout`
and `setup-node`. Everything else is the runner's built-in `ssh`, so there is no
outside code between a commit and the production host.

**The CI build sets a throwaway `JWT_SECRET`.** This is not optional. `auth.ts`
calls `resolveJwtSecret()` at module scope and it throws when `NODE_ENV` is
`production` and the secret is unset — which is exactly what `next build` sets.
Verified: building with `.env` moved aside fails on that check. Nothing else is
needed; every page is dynamically rendered, so the build never touches the
database. Verified by building with `DATABASE_URL` pointed at a dead port.

### One-time setup

On the server, create a deploy user and authorise your machine's key:

```bash
# on the VPS, as root
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy            # so deploy.sh can run docker compose
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh

# from your machine: generate a key pair dedicated to deployment
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/kalisizo_deploy

# back on the VPS, append the public key
echo "ssh-ed25519 AAAA... github-actions-deploy" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# the VPS must be able to pull the repo
sudo -u deploy git clone https://github.com/walterolum/Kalisizo_Coffee_Farmers-.git /srv/kalisizo
```

Then set five repository secrets — **Settings → Secrets and variables → Actions →
New repository secret**, or with the CLI:

```bash
gh secret set VPS_HOST            --repo walterolum/Kalisizo_Coffee_Farmers-
gh secret set VPS_USER            --repo walterolum/Kalisizo_Coffee_Farmers-   # deploy
gh secret set VPS_SSH_KEY         --repo walterolum/Kalisizo_Coffee_Farmers-   < ~/.ssh/kalisizo_deploy
gh secret set VPS_SSH_KNOWN_HOSTS --repo walterolum/Kalisizo_Coffee_Farmers-   < ~/.ssh/known_hosts
gh secret set NEXT_PUBLIC_SITE_URL --repo walterolum/Kalisizo_Coffee_Farmers-  # https://your-domain
```

`VPS_SSH_KNOWN_HOSTS` deserves a note. The workflow connects with
`StrictHostKeyChecking=yes`, so an absent host key is a hard failure rather than a
`StrictHostKeyChecking=no` that silently accepts anything — which would remove the
protection against a man-in-the-middle on the one path that executes code on
production. Refresh it whenever the server is rebuilt:

```bash
ssh-keyscan -p 22 <server-ip> | gh secret set VPS_SSH_KNOWN_HOSTS --repo walterolum/Kalisizo_Coffee_Farmers-
```

Also create the **`production` environment** (Settings → Environments) if you want
GitHub to require approval before a deploy, or to hold environment-scoped secrets.

Then verify by pushing:

```bash
git commit --allow-empty -m "trigger: test deploy pipeline"
git push
```

The run appears under the repo's **Actions** tab. If it fails, the failing step
names the cause; the deploy job will not touch the server unless `verify` passes.

---

## 11. Node version pinning

Local Node is **v25.9.0**; Docker runs **node:22**. Nothing used to pin that, so a
Node 23+ behaviour change would have passed on your machine and failed in
production — on the one server holding both the site and its only backups.

Pinned as of the automated-deploy work:

| File | Value | Purpose |
|---|---|---|
| `.nvmrc` | `22` | Single source of truth; read by the CI runner |
| `package.json` `engines.node` | `>=22` | Floor, not a ceiling — warns on anything older |
| `Dockerfile` | `FROM node:22-bookworm-slim` | Production runtime |

The `engines` bound is deliberately open-ended. `>=22 <23` would make `npm`
complain on this machine, which runs 25.9.0, and a warning that fires on every
local command trains people to ignore it. `>=22` documents the minimum and stays
quiet on anything newer.

CI reads `.nvmrc` via `node-version-file`, so the runner, the workstation and the
container now resolve to one number instead of three that can drift.