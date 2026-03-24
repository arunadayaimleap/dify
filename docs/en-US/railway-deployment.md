# Deploying Dify on Railway

This guide describes how to run **Dify Community Edition** on [Railway](https://railway.com): services to provision, environment variables, **same-origin console authentication** (required on `*.up.railway.app`), Celery worker/beat, and how this setup relates to **Railway templates**.

For generic Docker Compose self-hosting, see [`docker/README.md`](../../docker/README.md) and [`docker/.env.example`](../../docker/.env.example).

---

## Why this repository’s web build matters on Railway

Railway gives each service a hostname such as `dify-web-production.up.railway.app` and `dify-api-production.up.railway.app`. The suffix **`up.railway.app` is on the [Public Suffix List](https://publicsuffix.org/)**, so those hosts are treated as **different sites**. Browser cookies cannot be shared across them using a parent `Domain=` attribute, and `SameSite=Lax` session cookies from the API hostname will not be sent to the web hostname.

This fork adds an **internal reverse proxy** in the Next.js app so the browser only talks to the **web** origin for `/console/api`, `/api`, `/files`, `/v1`, `/mcp`, and `/triggers`. The server forwards requests to the API over Railway private networking.

**Deploy the `web` service from this repo** (Docker build context `web/`), not only the stock `langgenius/dify-web` image, unless you have merged the same proxy behavior.

---

## Architecture

```mermaid
flowchart TB
  subgraph public [Public HTTPS]
    U[Browser]
  end
  subgraph railway [Railway project]
    W[dify-web :3000]
    A[dify-api :5001]
    K[dify-worker]
    B[dify-worker-beat]
    S[dify-sandbox]
    P[dify-plugin-daemon]
    PG[(Postgres)]
    R[(Redis)]
  end
  U -->|"/console/api, /api, files..."| W
  W -->|"INTERNAL_API_ORIGIN private URL"| A
  U -.->|direct only if you accept cookie limits| A
  A --> PG
  A --> R
  K --> PG
  K --> R
  B --> R
  K --> A
  A --> S
  A --> P
```

- **dify-web**: Next.js; must set `INTERNAL_API_ORIGIN` to the API’s **internal** base URL.
- **dify-api**: Gunicorn + Flask API (`MODE` unset or default).
- **dify-worker**: Celery worker (`MODE=worker`).
- **dify-worker-beat**: Celery beat (`MODE=beat`); **only one** replica.
- **Postgres** / **Redis**: Railway database plugins or your own.
- **dify-sandbox**: Official `langgenius/dify-sandbox` image (code execution).
- **dify-plugin-daemon**: Official `langgenius/dify-plugin-daemon` — **required** if you use **Plugins**, **Agent** workflow nodes, or marketplace installs. Without it, agent-provider API calls fail and Agent nodes cannot run.

---

## Prerequisites

- Railway account and a **project** (e.g. one environment: `production` or `development`).
- Railway [CLI](https://docs.railway.com/guides/cli) optional, for deploys from a monorepo (`railway link`, `railway up`).

---

## 1. Add Postgres and Redis

1. In the project, add **PostgreSQL** and **Redis** (Railway templates or “New” → Database).
2. Note each service’s **variables** (e.g. `DATABASE_URL`, `REDIS_URL`). You will reference them on the API and workers.

Use the **same** Postgres and Redis for `dify-api`, `dify-worker`, and `dify-worker-beat`.

---

## 2. Service: `dify-api`

| Setting | Value |
|--------|--------|
| **Source** | Docker image `langgenius/dify-api:<version>` (match your desired Dify release, e.g. `1.13.2`) |
| **Public networking** | Generate a domain (HTTPS) — used for `CONSOLE_API_URL` / `SERVICE_API_URL` / `APP_API_URL` **if** clients hit the API directly. With the web proxy, the browser mainly uses the **web** URL; these should still be the **public HTTPS** API URL for links, CORS, and server-side logic. |

### Required environment variables (minimal set)

Copy patterns from [`docker/.env.example`](../../docker/.env.example). On Railway, prefer **[reference variables](https://docs.railway.com/variables#reference-variables)** so URLs stay correct when Railway rotates credentials.

**URLs (use your real generated domains, `https://`):**

- `CONSOLE_WEB_URL` — public web UI, e.g. `https://dify-web-xxx.up.railway.app`
- `CONSOLE_API_URL` — public API, e.g. `https://dify-api-xxx.up.railway.app`
- `SERVICE_API_URL` — usually same as `CONSOLE_API_URL`
- `APP_WEB_URL` — often same as `CONSOLE_WEB_URL`
- `APP_API_URL` — often same as `CONSOLE_API_URL`
- `FILES_URL` — **must be reachable for file features**; with same-origin proxy, set to the **web** origin, e.g. `https://dify-web-xxx.up.railway.app` (see upstream comments in `.env.example`).
- `TRIGGER_URL` — public base for triggers; often same as `SERVICE_API_URL` or web origin depending on how you expose `/triggers`.

**Cookie / PSL note:** leave **`COOKIE_DOMAIN` empty** (or unset). Setting it to `up.railway.app` causes browsers to **reject** auth cookies. With an empty domain, the API emits host-only or appropriate cookies; the web proxy re-applies `Set-Cookie` without forwarding an invalid parent domain.

**Database / broker:**

- `DB_*` or `SQLALCHEMY_DATABASE_URI` / Railway’s `DATABASE_URL` mapping per Dify docs
- `CELERY_BROKER_URL` — Redis, e.g. `${{Redis.REDIS_URL}}` with DB index `/1` if that matches your compose convention
- `CELERY_RESULT_BACKEND` — often same Redis or `redis://...`

**Agent workflows (optional but recommended):** leave **`AUTO_INSTALL_AGENT_STRATEGY_PLUGIN` unset** or set to **`true`** (default in this repo’s API image entrypoint) so **dify-api** runs an idempotent install of **`langgenius/agent`** on each start. Set to **`false`** if you have no plugin daemon, are air-gapped, or want to install plugins only from the console.

**Migrations:**

- `MIGRATION_ENABLED=true` **only** on the **API** service for first boot / upgrades, or run a **one-off** deploy with `MODE=migration` (see [`api/docker/entrypoint.sh`](../../api/docker/entrypoint.sh)). Avoid running migrations simultaneously from **worker** and **beat** (`MIGRATION_ENABLED=false` there).

**Sandbox / plugins:**

- `CODE_EXECUTION_ENDPOINT` pointing to internal sandbox URL, e.g. `http://dify-sandbox.railway.internal:8194`
- **Plugin daemon** (see [§7](#7-plugin-daemon-and-agent-workflows)): `PLUGIN_DAEMON_URL`, `PLUGIN_DAEMON_KEY`, `PLUGIN_DIFY_INNER_API_KEY`, `PLUGIN_DIFY_INNER_API_URL`, `MARKETPLACE_ENABLED`, `MARKETPLACE_API_URL`, and matching daemon-side `DIFY_INNER_API_KEY` / `DIFY_INNER_API_URL` per [`docker/.env.example`](../../docker/.env.example).
- **`INTERNAL_FILES_URL`**: set to the API’s **internal** base URL (e.g. `http://dify-api.railway.internal:5001`) so the plugin daemon can fetch files from the API.

### Healthcheck (recommended)

Use an HTTP health path if you add one, or rely on Railway’s default; ensure the process listens on `5001` (see API Dockerfile `EXPOSE`).

---

## 3. Service: `dify-web`

| Setting | Value |
|--------|--------|
| **Source** | **GitHub**: this repository, **Root directory** `web`, **Dockerfile** `Dockerfile` — or **`railway up` from the monorepo root** using [`railway.toml`](../../railway.toml) + [`Dockerfile.railway-dify-web`](../../Dockerfile.railway-dify-web). **Do not** use the stock **`langgenius/dify-web`** image for split web/API hosts: its entrypoint always sets `NEXT_PUBLIC_API_PREFIX=${CONSOLE_API_URL}/console/api`, which breaks session cookies across hostnames. |
| **Public networking** | Generate domain — this is what users open in the browser. |

### Critical variables

| Variable | Purpose |
|----------|---------|
| `INTERNAL_API_ORIGIN` | Internal API base URL, **no trailing path**. Example: `http://dify-api.railway.internal:5001`. Replace `dify-api` with your **exact** Railway service name (DNS name in private network). |
| `CONSOLE_API_URL` | Public **HTTPS** URL of the API (used by entrypoint when `INTERNAL_API_ORIGIN` is unset). When `INTERNAL_API_ORIGIN` is set, entrypoint forces same-origin prefixes; you should still set consistent public URLs for any server-side or build-time needs. |
| `APP_API_URL` | Public **HTTPS** API URL for webapp API prefix logic. |

Behavior is implemented in [`web/docker/entrypoint.sh`](../../web/docker/entrypoint.sh): when `INTERNAL_API_ORIGIN` is non-empty after trimming whitespace, `NEXT_PUBLIC_API_PREFIX=/console/api`, `NEXT_PUBLIC_PUBLIC_API_PREFIX=/api`, and `NEXT_PUBLIC_COOKIE_DOMAIN` is cleared. If you set **`NEXT_PUBLIC_API_PREFIX`** to a path starting with **`/`** in Railway (e.g. `/console/api`), the entrypoint preserves it instead of replacing it with `CONSOLE_API_URL` (you still need `INTERNAL_API_ORIGIN` so Next can proxy `/console/api` to the API).

See also [`web/.env.example`](../../web/.env.example).

### CLI deploy from repo root (monorepo)

`railway link` at the **repository root** (or any linked cwd) uploads the **whole monorepo**. The root [`railway.toml`](../../railway.toml) forces **`Dockerfile.railway-dify-web`**, which wraps [`web/Dockerfile`](../../web/Dockerfile) and uses `COPY web/...` so the build context can stay the repo root.

```bash
cd /path/to/dify
railway up -s dify-web -e <environment> -c
```

Without this Dockerfile wrapper, Railpack tries to analyze the monorepo and fails, or you may stay on a registry image that ignores `INTERNAL_API_ORIGIN`.

---

## 4. Service: `dify-worker`

| Setting | Value |
|--------|--------|
| **Source** | Same image as API: `langgenius/dify-api:<version>` |
| **Start** | Default entrypoint uses `MODE` from env |

Set:

- `MODE=worker`
- Same DB, Redis, `SECRET_KEY`, and core config as **dify-api** (copy variable references).
- `MIGRATION_ENABLED=false` (recommended) so workers do not race `flask upgrade-db`.

See [`api/docker/entrypoint.sh`](../../api/docker/entrypoint.sh) (`MODE=worker`).

---

## 5. Service: `dify-worker-beat`

| Setting | Value |
|--------|--------|
| **Source** | `langgenius/dify-api:<version>` |
| **Replicas** | **1** only (multiple beat processes duplicate schedules). |

Set:

- `MODE=beat`
- Same broker/DB/`SECRET_KEY` as API
- `MIGRATION_ENABLED=false`

---

## 6. Service: `dify-sandbox`

Use image `langgenius/dify-sandbox:<version>`. Configure API env vars (`CODE_EXECUTION_ENDPOINT`, etc.) to the sandbox **internal** URL and port per upstream documentation.

---

## 7. Plugin daemon and Agent workflows

Deploy **`langgenius/dify-plugin-daemon`** with an image tag that matches your Dify release (see [`docker/docker-compose.yaml`](../../docker/docker-compose.yaml)). The daemon needs **PostgreSQL** (database name usually `dify_plugin` / `DB_PLUGIN_DATABASE`), **Redis**, and **writable storage** for extracted plugins (`PLUGIN_STORAGE_TYPE` and related vars). On Railway, **ephemeral disk** means plugins can disappear after redeploy — use **object storage** (`PLUGIN_STORAGE_TYPE=aws_s3` or similar) or a **volume** if installs must survive restarts.

### Wire the API and workers to the daemon

Set on **dify-api** and **dify-worker** (same values on both):

| Variable | Purpose |
|----------|---------|
| `PLUGIN_DAEMON_URL` | Internal URL to the daemon, e.g. `http://dify-plugin-daemon.railway.internal:5002` |
| `PLUGIN_DAEMON_KEY` | Must equal the daemon’s `SERVER_KEY` |
| `PLUGIN_DIFY_INNER_API_KEY` | Must equal the daemon’s `DIFY_INNER_API_KEY` |
| `PLUGIN_DIFY_INNER_API_URL` | Daemon reaches the API here, e.g. `http://dify-api.railway.internal:5001` |
| `MARKETPLACE_ENABLED` | `true` to install from [Dify Marketplace](https://marketplace.dify.ai) |
| `MARKETPLACE_API_URL` | Default `https://marketplace.dify.ai` |
| `INTERNAL_FILES_URL` | API internal base URL for daemon file access |

On the **plugin daemon** service, set `DIFY_INNER_API_URL` and `DIFY_INNER_API_KEY` to match the API’s expectations (`PLUGIN_DIFY_INNER_API_*` on the API side).

### Install “Dify Agent Strategies” (`langgenius/agent`)

Workflow **Agent** nodes use the marketplace plugin **`langgenius/agent`** (“Dify Agent Strategies”). After the daemon and marketplace are working:

- **Automatic (this repo’s API image):** on each **dify-api** start, the entrypoint runs `flask install-agent-strategy-plugin` unless `AUTO_INSTALL_AGENT_STRATEGY_PLUGIN` is `false` or `0`. That covers new workspaces after the first admin creates a tenant. If the daemon is not ready yet, you may see one warning in logs; restart API after the daemon is healthy, or install once from the console.

1. **Console:** **Plugins** → **Marketplace** → find **Dify Agent Strategies** / `langgenius/agent` → **Install**.
2. **CLI (API container):** resolve the latest package from the marketplace and enqueue install for every workspace (or one tenant):

   ```bash
   flask install-agent-strategy-plugin
   flask install-agent-strategy-plugin --tenant-id '<workspace-tenant-uuid>'
   flask install-agent-strategy-plugin --dry-run
   ```

   If the command reports an install **task_id**, open **Plugins** in the console and wait until the task completes.

The current marketplace metadata is also available at  
`https://marketplace.dify.ai/api/v1/plugins/langgenius/agent` (field `data.plugin.latest_package_identifier`) if you need to verify the version string.

### Related: models and tools

Agent strategies still need a configured **LLM** and any **tools** referenced in the node. Install model/tool plugins from the marketplace as needed.

---

## 8. Deploy order (recommended)

1. Postgres + Redis live and variables available.
2. **dify-api** first: run migrations (`MIGRATION_ENABLED=true` once or `MODE=migration`), confirm logs clean.
3. **dify-web** with `INTERNAL_API_ORIGIN` pointing at API internal URL.
4. **dify-worker**, then **dify-worker-beat** (or worker before beat is fine if broker is up).
5. **dify-sandbox** and **dify-plugin-daemon** if you use code execution or Agent/plugins.

---

## 9. First login

Open the **web** public URL → `/install` (if uninitialized) or `/signin`.

Verify in browser devtools that API calls go to **`https://<web-host>/console/api/...`** (same origin), not only to the API hostname.

---

## 10. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Login returns 200 but immediate 401 on `/console/api/account/profile` | Cookies not stored: was `COOKIE_DOMAIN=up.railway.app`, or the HTML `data-api-prefix` points at the **API** hostname (browser never sends cookies to the web host). Causes: `INTERNAL_API_ORIGIN` unset/typo/whitespace-only on **dify-web**, or Railway overwrote path-only `NEXT_PUBLIC_*` before the entrypoint fix. Use this repo’s web image, empty `COOKIE_DOMAIN`, and a non-empty trimmed `INTERNAL_API_ORIGIN`. Verify with the Playwright check below. |
| Worker/beat exit on start | Wrong `CELERY_BROKER_URL`, DB unreachable, or `MIGRATION_ENABLED=true` failing on worker — check deploy logs. |
| 502 on `/console/api/*` | `INTERNAL_API_ORIGIN` wrong service name or port; API not on private network. |
| Files broken | `FILES_URL` must match how the browser reaches file routes (often web origin when proxied). |
| API log: `install-agent-strategy-plugin exited 1` / Agent node still broken | Plugin daemon not running, wrong `PLUGIN_DAEMON_URL`, or API cannot reach `MARKETPLACE_API_URL`. Fix [§7](#7-plugin-daemon-and-agent-workflows); or set `AUTO_INSTALL_AGENT_STRATEGY_PLUGIN=false` and install **Dify Agent Strategies** manually under Plugins. |

### Persistent disk for `privkeys/` and uploads (`dify-api`)

Without a volume, `/app/api/storage` is ephemeral and **tenant RSA private keys** (`privkeys/<tenant_id>/private.pem`) are lost on redeploy — model provider and workflow secret decrypt fails.

1. In Railway: **dify-api** → **Volumes** → add a volume mounted at **`/app/api/storage`** (match `OPENDAL_FS_ROOT` / `STORAGE_LOCAL_PATH`).
2. Use this fork’s API image: the Dockerfile runs the entrypoint as **root**, **`chown`s the mount to `dify`**, then **`gosu dify`** so the app can write to the volume.
3. After the first boot with a new empty volume, set **`RUN_RESET_ENCRYPT_ONCE=true`** once so `flask reset-encrypt-key-pair --yes` runs (marker file on the volume prevents repeats). Then set it back to **`false`**. Re-enter **all** custom LLM provider API keys in **Settings → Model Provider**.
4. **`FILES_URL`**: use the **web** origin when the browser uses the Next.js proxy (e.g. `https://<dify-web-host>`).
5. **`COOKIE_DOMAIN`**: remove the variable in the Railway dashboard if it was set to `up.railway.app` (empty/unset is correct for `*.up.railway.app`). The CLI may not delete empty values reliably.

**Verify injected API prefix (no login):** Open `/signin`, view source or devtools, and check `<body … data-api-prefix="…">`. On split **dify-web** / **dify-api** deploys it must be **`/console/api`**, not `https://<api-host>/console/api`.

From the repo **`web/`** directory (after `pnpm install`):

1. `pnpm exec playwright install chromium` (once per machine).
2. `PLAYWRIGHT_BASE_URL=https://<your-web-host> pnpm test:e2e:deployment`

The test fails if `data-api-prefix` is an absolute URL whose host differs from the web host (the broken-cookie case).

---

## Railway templates: can this be a one-click deploy?

**Yes.** Railway supports **templates** that bundle multiple services, variables, and settings so anyone can redeploy the stack from a button or URL.

### How templates work (high level)

- **Create from a working project:** Project → **Settings** → **Generate Template from Project** → **Create Template**. Railway opens the template composer with your services pre-filled. See [Creating a template](https://docs.railway.com/guides/create).
- **Create from scratch:** Workspace → [Templates](https://railway.com/workspace/templates) → **New Template**, add each service (GitHub repo or Docker image), set variables and **root directory** (`web` for the frontend monorepo path).
- **Publish:** You can [publish and share](https://docs.railway.com/templates/publish-and-share) to the [template marketplace](https://railway.com/templates); open-source projects may qualify for [kickbacks](https://docs.railway.com/templates/kickbacks).

### What to configure in the template

- **Postgres + Redis** as template services (or document that users must add them and wire references).
- **Variable references** like `${{Postgres.DATABASE_URL}}` / `${{Redis.REDIS_URL}}` so new deploys get correct wiring.
- **dify-web** service: source = GitHub repo with **Root directory** `web`; set `INTERNAL_API_ORIGIN` to the **internal** URL of the API service (Railway’s private DNS name for that service + `:5001`).
- **dify-api**, **dify-worker**, **dify-worker-beat**: Docker image `langgenius/dify-api` with `MODE` and `MIGRATION_ENABLED` as above.
- **Public URLs**: either document that users must set `CONSOLE_WEB_URL`, `CONSOLE_API_URL`, etc. after domains are generated, or use template/placeholder flows Railway documents for “required variables” on deploy.

### Limitations to be aware of

- Template definitions are managed in the **Railway dashboard** (template composer), not as a portable `template.json` checked into this repo. There is no official “import template from repo JSON” workflow documented as a first-class file format.
- **Custom web code** (this proxy) must come from **your fork or this repo** in the template; the stock `langgenius/dify-web` Docker image alone does not include `INTERNAL_API_ORIGIN` routing described here.
- **Version pinning:** Pin `langgenius/dify-api` / sandbox / plugin images to explicit tags so template users don’t get surprise major upgrades.

### Summary

| Question | Answer |
|----------|--------|
| Can this stack be a Railway template? | **Yes** — multi-service templates are supported. |
| Easiest path? | Deploy once correctly → **Generate Template from Project** → adjust variables and docs → publish or share template URL. |
| Is it in-repo as code? | **No** — template metadata lives in Railway; link users to your published template URL from this README or Dify docs. |

---

## Troubleshooting: workflow editor stuck loading / `PrivkeyNotFoundError`

API logs may show `Exception on .../workflows/draft [GET]` with `libs.rsa.PrivkeyNotFoundError: Private key not found, tenant_id: ...`.

Dify stores **per-tenant RSA private keys** in **object storage** at `privkeys/<tenant_id>/private.pem` (see `libs/rsa.py`). Encrypted **workflow secret environment variables** are decrypted with that key when loading a draft. If storage is **ephemeral** (default local disk on a container that restarts) or **misconfigured**, the key file disappears or is never written and draft GET fails.

**What to do on Railway**

1. Configure **durable object storage** for the API (`STORAGE_TYPE` and the matching vendor env vars from [`docker/.env.example`](../../docker/.env.example)) so `privkeys/` survives redeploys, **or** attach a **persistent volume** if you use local storage.
2. After fixing storage, **new workspaces/tenants** get keys automatically; existing tenants that lost keys may need **workspace recovery** or re-creating secret env vars after the key is regenerated.
3. This repository’s API change masks undecryptable secrets when loading a draft so **Studio can open the workflow** (values show as masked); users should **re-enter** real secret values in **Environment variables** and publish as needed.

The same **per-tenant private key** is used to encrypt **model provider API keys** stored in the database. If `privkeys/` is missing, the API may return **500** on `/console/api/workspaces/current/model-providers` and related model-type routes until you fix storage and **re-save** credentials under **Settings → Model Provider** (this repo also **degrades gracefully**: lists load without decrypting old secrets so you can add keys again).

---

## References

- [Railway: Create a template](https://docs.railway.com/guides/create)
- [Railway: Deploy a template](https://docs.railway.com/guides/deploy)
- [Railway: Variables & reference variables](https://docs.railway.com/variables)
- [Railway: Monorepo / root directory](https://docs.railway.com/deployments/monorepo)
- Dify: [`docker/.env.example`](../../docker/.env.example), [`web/.env.example`](../../web/.env.example)
