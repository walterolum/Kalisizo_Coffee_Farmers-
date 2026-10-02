# Deployment Guide

Production deployment for the Kalisizo Coffee Cooperative website and CMS.

The recommended target is **one Linux server running Docker Compose**, which is
what the `Dockerfile` and `docker-compose.yml` in this repository implement. A
bare-metal Node server works too and is covered in §9.

> **Why not Vercel?** The app holds an SSE connection open for live CMS updates
> and, unless Cloudinary is configured, writes uploads to disk. Serverless
> functions truncate long-lived responses and lose local files on redeploy.
> Neither is fatal, but both cost functionality. See §9.

---

## 1. Requirements

| Item | Requirement |
| --- | --- |
| Server | Ubuntu 24.04 or Debian 12, 1 GB RAM minimum, 2 GB recommended |
| Docker | Engine 24+ with the Compose v2 plugin |
| Domain | An A/AAAA record pointing at the server. TLS is automatic |
| Ports | 80 and 443 inbound. Nothing else needs to be open |
| Cloudinary account | Optional. Without it, uploads go to a Docker volume on this server |
| Resend account | Recommended, for contact-form notifications |

A 1 GB instance is enough: the Next.js server, PostgreSQL 16 and Caddy together
sit well under 500 MB resident.

---

## 2. First deploy

```bash
# 1. Get the code
git clone <your-repo-url> kalisizo-coffee
cd kalisizo-coffee

# 2. Configure. Both secrets must be generated, not invented.
cp .env.example.production .env
chmod 600 .env
openssl rand -hex 32   # -> JWT_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD
# Paste both into .env, along with your domain in SITE_DOMAIN and
# NEXT_PUBLIC_SITE_URL.

# 3. Build, migrate, seed, start
./deploy/deploy.sh --seed
```

`deploy.sh` validates `.env` first and refuses to start if a secret is empty or
if `POSTGRES_PASSWORD` contains characters that are reserved in a URL. It then
builds, applies migrations, recreates the containers, waits for the health check
and prints the result.

To run the steps by hand:

```bash
docker compose build app
docker compose run --rm migrate                    # prisma migrate deploy
docker compose run --rm migrate npx tsx prisma/seed.ts
docker compose up -d --wait app caddy
docker compose exec -T app curl -fsS http://127.0.0.1:3000/api/v1/health
```

---

## 3. What runs

| Service | Image | Role | Published |
| --- | --- | --- | --- |
| `app` | built from `Dockerfile`, target `runner` | Next.js standalone server | internal only |
| `db` | `postgres:16-alpine` | PostgreSQL | internal only |
| `migrate` | `Dockerfile`, target `migrate` | one-shot migrations and seed | not started by `up` |
| `caddy` | `caddy:2-alpine` | automatic HTTPS, reverse proxy | 80, 443 |

`db` is deliberately **not** published to the host. Only the app reaches it over
the internal Docker network, so the database is unreachable from the internet even
if the host firewall is wrong.

Caddy issues and renews the TLS certificate on its own. There is no certbot and no
certificate to expire by hand.

### Two build targets, and why

`runner` contains the standalone Next.js bundle and nothing else. It has no Prisma
CLI, because `prisma` is a devDependency and never entered the bundle. `migrate`
is a separate target built on the full dependency tree, which does have the CLI
and `tsx`. The consequence in practice: **migrations are a separate command**,
`docker compose run --rm migrate`, not part of `up`.

---

## 4. Environment variables

Copy `.env.example.production`. Every value is annotated in that file. The
non-obvious ones:

| Variable | Note |
| --- | --- |
| `JWT_SECRET` | `openssl rand -hex 32`. The app throws on boot in production if it is missing or equals the dev fallback |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24`. **Hex only** — see below |
| `NEXT_PUBLIC_SITE_URL` | Inlined into the client bundle at build time. Changing it requires `docker compose build app` |
| `SITE_DOMAIN` | What Caddy issues the certificate for |
| `ALLOW_LOCAL_UPLOADS` | `true` keeps uploads on this server's volume |

### Why POSTGRES_PASSWORD must be hex

Compose splices this value directly into `DATABASE_URL`:

```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
```

A password containing `@ : / ? #` or `%` produces a malformed connection string.
The failure surfaces later as Prisma's *"invalid port number in database URL"*,
thrown on the first query rather than at startup, which sends you looking in the
wrong place. `openssl rand -base64` is not safe either: it emits `+` and `/`.
`deploy.sh` checks for this before it does anything.

### `NEXT_PUBLIC_SITE_URL` needs a rebuild

`NEXT_PUBLIC_*` variables are substituted when the image is built. Setting it at
runtime alone changes nothing, and the site keeps serving the old canonical URLs,
`sitemap.xml` and `robots.txt` — silently, with no error. `deploy.sh` rebuilds on
every run, which is why it is safe there.

### Never commit `.env`

It is already in `.gitignore`. Only the `.example` files belong in the repo.

---

## 5. Image uploads

The CMS picks a backend in this order:

1. **Cloudinary**, when all three `CLOUDINARY_*` variables are set.
2. **Local disk**, when `ALLOW_LOCAL_UPLOADS` is `true`. In the Compose stack this
   writes to the `uploads` named volume, which survives container rebuilds and
   redeploys.
3. Otherwise the endpoint returns **HTTP 503**. Intentional: on an ephemeral
   filesystem every uploaded image would vanish silently, so it refuses.

Files are written outside `public/` and served by `/uploads/[file]`, which reads
the directory per request. `public/` is resolved from a file list captured at
server start, so a file written there after startup 404s until a restart.

### Switching to Cloudinary later

Set the three variables and rebuild. Any database row still pointing at
`/uploads/...` keeps working while those files remain in the volume; re-upload
through the CMS to move them. Do not enable both backends at once: with
Cloudinary configured the local path is never written to, so the volume silently
becomes orphaned.

If you add a different image host, add it to `images.remotePatterns` in
`next.config.ts` or `next/image` will refuse to render it.

---

## 6. Creating the first administrator

`deploy.sh --seed` runs the seed, which creates the Super Administrator from
`ADMIN_EMAIL` and `ADMIN_PASSWORD` plus the starter catalog. The password must be
at least 12 characters with at least three of lowercase, uppercase, digits and
symbols; the seed refuses anything weaker in production.

The seed is **non-destructive**. It only creates what is missing and never
modifies an existing row, so it is safe on every deploy and will not reset a
password a human has since changed.

Then sign in at `/admin`, change the password, and create individual staff
accounts. Do not share one account.

`npm run db:reset` wipes every table and refuses to run in production. There is
no reason to run it against a deployed site.

---

## 7. Daily operations

| Task | Command |
| --- | --- |
| Deploy a new commit | `git pull && ./deploy/deploy.sh` |
| Apply a new migration | `docker compose run --rm migrate` |
| Check health | `curl -fsS https://your-domain/api/v1/health` |
| View logs | `docker compose logs -f app` |
| Restart the app | `docker compose restart app` |
| Run the backup | `docker exec kalisizo-coffee-db-1 /opt/kalisizo/backup.sh` |

Backups are covered in [BACKUP.md](BACKUP.md), including the cron entry.

---

## 8. Pre-launch checklist

**Configuration**

- [ ] `.env` filled in, `chmod 600`, not committed
- [ ] `JWT_SECRET` is a fresh random value, not the fallback
- [ ] `NEXT_PUBLIC_SITE_URL` and `SITE_DOMAIN` match the real domain
- [ ] `POSTGRES_PASSWORD` is hex
- [ ] `docker compose exec app curl -fsS .../api/v1/health` returns `"status":"ok"`
- [ ] A logo uploaded through the CMS appears in the header
- [ ] `RESEND_API_KEY` set and a test inquiry arrives by email
- [ ] `/sitemap.xml` lists the real domain, not `localhost`

**Security**

- [ ] HTTPS works and `http` redirects to `https`
- [ ] Database is not reachable from the internet (`docker compose ps` shows no
      published port on `db`)
- [ ] `/admin` is not indexed (check `robots.txt`)
- [ ] First-administrator password changed, each staff member has their own account

**CMS readiness**

The public site and management API are complete, but not every admin screen is.
If staff are expected to run the site themselves, the sections listed in
[CMS-GUIDE.md §11](CMS-GUIDE.md#11-not-yet-available) must be built and tested
first: News, Events, Projects, Gallery, Publications, Announcements screens, the
activity log, user management, and site settings.

Until then those sections render an empty state and their content must be managed
by a developer. Do not launch to staff expecting full self-service until this is
resolved.

**Operations**

- [ ] Nightly backups configured and cron verified
- [ ] **A restore has been tested at least once** — an untested backup is a guess
- [ ] Someone is responsible for the domain, hosting and backups

---

## 9. Deploying without Docker

Viable, and the app has no Docker-specific code. The requirements are a
long-lived Node process, a writable disk for uploads, and PostgreSQL.

```bash
npm ci
npx prisma migrate deploy
npm run db:seed
npm run build
npm start                     # listens on :3000
```

`npm start` does **not** run `next start`. With `output: "standalone"` set in
`next.config.ts`, `next start` is rejected outright — it prints

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

and exits. `npm start` instead runs `scripts/start-standalone.mjs`, which performs
the copies `next build` does not make and then execs the generated server:

| From | To | Why |
| --- | --- | --- |
| `public/` | `.next/standalone/public/` | static files; never traced |
| `.next/static/` | `.next/standalone/.next/static/` | JS/CSS chunks; never traced |
| `node_modules/.prisma`, `@prisma/client` | `.next/standalone/node_modules/` | Prisma query engine, when the trace misses it |

Skipping those copies produces a **deceptive** failure, which is why they are done
automatically rather than documented as a step to remember. The server starts, the
homepage returns 200, and `/api/v1/health` passes — while every stylesheet, script
and image 404s. Health checks and uptime monitors see a healthy service; a visitor
sees an unstyled page.

On Docker none of this is manual: the image's `runner` stage performs the same
three copies and `CMD` is `node server.js`.

Put nginx or Caddy in front for TLS, and set `UPLOAD_DIR` to a persistent path.
When running the standalone bundle outside Docker, `UPLOAD_DIR` must be an absolute
path: `server.js` runs with its working directory set to `.next/standalone`, so the
relative default `data/uploads` resolves inside the bundle and uploads 404.

Vercel and other serverless platforms need three changes first: set the
`CLOUDINARY_*` variables (local uploads return 503), accept truncated SSE
connections, and remove the assumption that `/uploads/...` is optimizable.

---

## 10. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| App exits at startup in production | `JWT_SECRET` missing or still the dev fallback |
| "invalid port number in database URL" | `POSTGRES_PASSWORD` contains a URL-reserved character |
| `migrate` fails with "did not initialize yet" | `prisma generate` did not run in the `migrate` image; rebuild it |
| Uploads fail with 503 | `ALLOW_LOCAL_UPLOADS` unset and `CLOUDINARY_*` empty |
| Uploaded images vanish after a deploy | Uploads are not on the `uploads` volume |
| Images missing after upload | Host not in `images.remotePatterns` in `next.config.ts` |
| Canonical URLs still show the old domain | `NEXT_PUBLIC_SITE_URL` changed at runtime only; rebuild the image |
| Live CMS updates stall | Proxy buffering the SSE stream; check the Caddyfile has `flush_interval -1` |
| Contact form works but no email arrives | `RESEND_API_KEY` not set — emails are only logged |
| Published content not appearing | Status is not `Published`; pages render per request and need no redeploy |
| Site blank after deploy | Check the build log; a type error fails the build deliberately |

---

## 11. Security headers

`next.config.ts` sets `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy`, `X-DNS-Prefetch-Control` and a
Content-Security-Policy on every response.

The CSP allows scripts and styles from the site only, images from the site and
Cloudinary, and frames from Google Maps. It blocks plugin and base-tag injection.
`'unsafe-inline'` remains for scripts and styles because Next.js emits inline
hydration code; removing it requires a per-request nonce threaded through the
router.

The `migrate` image needs a build-time `JWT_SECRET` because `next build`
evaluates the module-scope guard in `src/lib/auth.ts`. The `Dockerfile` supplies a
fixed placeholder, never the real value: a secret passed as a build argument ends
up in the image's layer history and in `docker inspect` output. The real secret is
injected at runtime by Compose.