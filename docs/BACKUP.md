# Backup & Restore Guide

The CMS content lives in one PostgreSQL database. If it is lost, the website
loses every article, project, event, document, product, setting and inquiry.

**Take backups automatically and test a restore.** An untested backup is not a
backup.

---

## 1. What to back up

| Item | Where it lives | Why |
| --- | --- | --- |
| PostgreSQL database | `db-data` Docker volume | All CMS content. **Essential** |
| Uploaded images | `uploads` Docker volume | Not in the database. Separate backup needed |
| `.env` | Host filesystem, `chmod 600` | Contains secrets. Encrypted, never in version control |

Anything regenerable from source (the code, `node_modules`, the Docker images)
does not need backing up.

---

## 2. Automated daily backups

`deploy/backup.sh` is mounted into the `db` container at
`/opt/kalisizo/backup.sh`, and `./backups` is bind-mounted at `/backups`. No
copying after a redeploy.

```bash
# By hand
docker exec kalisizo-coffee-db-1 /opt/kalisizo/backup.sh

# Nightly, at 02:17. An off-the-hour minute avoids competing with everything
# else scheduled on the host.
sudo crontab -e
```

```
17 2 * * * docker exec kalisizo-coffee-db-1 /opt/kalisizo/backup.sh >> /var/log/kalisizo-backup.log 2>&1
```

Confirm it ran:

```bash
sudo crontab -l
docker exec kalisizo-coffee-db-1 ls -lh /backups
```

### Why the script runs inside the container

`pg_dump` only ships with PostgreSQL itself. A `postgresql-client` installed on
the host can be a different major version from the server and will then refuse to
dump it, and nothing warns you until you need the backup. Running inside `db`
guarantees the dump comes from the exact image the database runs.

### What the script does

- Dumps to a `.partial` file, checks it is over 1 KB, then confirms
  `pg_restore --list` can read it. Only then does it move it into place. A
  truncated dump is worse than none, because it looks like success.
- Uses custom format, so it is compressed and `pg_restore -t table` can recover
  a single table.
- Prunes dumps older than `RETENTION_DAYS` (default 14) by filename pattern, so
  an unrelated file in the directory is never touched.

Override the defaults by setting `BACKUP_DIR` or `RETENTION_DAYS` on the `docker
exec` command.

### Store dumps off the server

`./backups` is on the same machine as the database, so it does not survive losing
the server. Copy it elsewhere daily:

```bash
# Example: second copy on object storage or another host
docker exec kalisizo-coffee-db-1 cat /backups/$(ls -1t backups | head -1) \
  | aws s3 cp - s3://your-bucket/kalisizo/
```

The directory is in `.gitignore`: dumps contain password hashes.

---

## 3. Restoring

> Restoring overwrites the current database. Take a fresh backup first if there is
> anything you would be sorry to lose.

### Restore into a scratch database, and verify

```bash
docker compose exec -T db psql -U kalisizo -d postgres -c "CREATE DATABASE restore_test;"
docker compose exec -T db pg_restore --username=kalisizo --dbname=restore_test \
  --no-owner ./backups/<timestamp>.dump

# Compare against the live database. Every count should match.
docker compose exec -T db psql -U kalisizo -d restore_test -c '\dt'
docker compose exec -T db psql -U kalisizo -d restore_test \
  -c 'SELECT count(*) FROM "NewsArticle";'

docker compose exec -T db psql -U kalisizo -d postgres -c "DROP DATABASE restore_test;"
```

The dumps are written inside the container, so `pg_restore` reads them by their
in-container path (`/backups/...`), not through a host path. It does **not** read
from stdin: passing `-` as the filename fails with *"could not open input file"*.

### Restore over the live database

```bash
# 1. Back up the current state first, in case the restore is wrong.
docker exec kalisizo-coffee-db-1 /opt/kalisizo/backup.sh

# 2. Stop the app. Restoring under a running server means it serves from the old
#    data while the restore is half-applied.
docker compose stop app

# 3. Restore.
docker compose exec -T db pg_restore --username=kalisizo --dbname=kalisizo_coffee \
  --clean --if-exists --no-owner /backups/<timestamp>.dump

# 4. Start the app and check it before declaring victory.
docker compose start app
curl -fsS https://your-domain/api/v1/health
```

`--clean` drops existing objects first, so rows are replaced rather than merged.
That is what you want after data corruption.

### Without Docker

`pg_dump` and `pg_restore` ship with PostgreSQL. On a bare-metal server,
substitute the host and credentials from `.env`:

```bash
pg_dump -h HOST -U kalisizo -d kalisizo_coffee -Fc -Z 9 -f backup.dump
pg_restore -h HOST -U kalisizo -d kalisizo_coffee --clean --if-exists --no-owner backup.dump
```

On Windows, in PowerShell:

```powershell
$env:PGPASSWORD = "your-password"
pg_dump -h HOST -U kalisizo -d kalisizo_coffee -Fc -Z 9 -f "C:\backups\kalisizo.dump"
pg_restore -h HOST -U kalisizo -d kalisizo_coffee --clean --if-exists --no-owner "C:\backups\kalisizo.dump"
```

Table names are case-sensitive and must stay quoted in SQL: `"NewsArticle"`,
`"User"`.

---

## 4. Verifying a backup

Do this when you first set backups up, after any change to the backup job, and at
least once a quarter:

1. Restore the most recent dump into a scratch database (§3).
2. Compare row counts against the live database.
3. Point the app at it, confirm `/admin` sign-in works and published content is
   present.
4. Drop the scratch database.

A backup you have not restored is an untested backup.

---

## 5. Retention

| Backups | Why |
| --- | --- |
| Daily, 14 days (the script's default) | Accidental deletion and corruption found late |
| Weekly, 6 months, copied off-server | Longer-term recovery |
| One before any schema change | Migrations are not always reversible |

Raise `RETENTION_DAYS` if disk is cheap and you want a longer local window; the
off-server copy is what actually protects you.

---

## 6. Images

Uploaded images are **not** in the database dump and need backing up separately,
at a similar time, or the two fall out of step.

| Storage | How to back up |
| --- | --- |
| Local disk (default in Compose) | The `uploads` named volume. See below |
| Cloudinary | The Cloudinary account itself. Re-upload if the account is lost |

To snapshot the `uploads` volume:

```bash
docker run --rm \
  -v kalisizo-coffee_uploads:/from:ro \
  -v "$PWD/backups":/to \
  alpine tar czf /to/uploads-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /from .
```

Note the volume name is prefixed with the Compose project name
(`kalisizo-coffee_uploads`), not the bare directory name.

---

## 7. If something goes wrong

| Situation | Action |
| --- | --- |
| Content deleted by mistake | Restore into a scratch database and copy the missing rows back |
| Database corrupted | Restore the last good dump over the live database (§3) |
| Whole server lost | Provision a new server, restore the dump, redeploy, then restore the `uploads` volume |
| Ransomware or a stolen credential | Restore to a **new** database, rotate every secret in `.env` and Cloudinary, then redeploy. Rotate `JWT_SECRET` last, since it signs everyone out |
| Need point-in-time recovery | Only available if Postgres is on a managed provider with PITR enabled. Self-hosted: no |