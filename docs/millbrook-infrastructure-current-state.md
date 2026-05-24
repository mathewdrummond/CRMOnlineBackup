# Millbrook Infrastructure Current State

Last updated: 2026-05-24 17:17 NZST

This document is the canonical living map for the Millbrook infrastructure platform. Update it as a standard part of every future infrastructure change, including service moves, VM/CT changes, port changes, storage changes, backup changes, DNS changes, and AI/search pipeline changes.

Do not store plaintext passwords or API secrets in this document. Use the known secure credential store/channel for credentials.

## Purpose

This file is designed to be fed into a new Codex/session so the live system can be understood and safely inspected before changes are made.

The target architecture is:

- Proxmox host `PVE` at `192.168.1.99` runs central VM/CT infrastructure.
- Synology NAS remains the JoinerFlow application host, storage appliance, file source, and backup target.
- A Proxmox-hosted AI services VM/container stack runs Ollama, Qdrant, and the JoinerFlow chunking worker.
- JoinerFlow app on NAS orchestrates indexing/search and owns the production SQLite metadata database.
- AI-heavy model/vector/chunk work is delegated to the AI stack with a target 10 GB dedicated AI memory allocation.

## Safety Rules

Always inspect before modifying.

Before destructive or data-affecting operations:

- Take a backup or snapshot.
- Record current state.
- Document rollback path.
- Avoid wiping Qdrant collections unless there is no safer repair path.
- Do not share SQLite writes across a network mount.
- Do not expose RDP, Proxmox, Qdrant, Ollama, or internal JoinerFlow services directly to the WAN.

All production AI/search remediation work should be logged to:

```text
/var/log/joinerflow-ai-remediation.log
```

## Network Map

LAN:

```text
Subnet: 192.168.1.0/24
Gateway/router: 192.168.1.1, OpenWrt
Current workstation observed during this update: 192.168.1.33
Tailscale route present on workstation: 100.64.0.0/10 via utun4
```

| Component | Hostname | IP | Current network state | Role |
|---|---:|---:|---|---|
| Router | `openwrt` | `192.168.1.1` | reachable | LAN gateway |
| Synology NAS | `Data` / `Data.local` | `192.168.1.32` | reachable; serving current CRM/timeclock hostnames | JoinerFlow app, storage, backups |
| Synology NAS alternate/client-facing address | `Data` | `192.168.1.31` | valid configured address, but offline during 2026-05-24 check | JoinerFlow LAN access address when online |
| Proxmox VE | `PVE` | `192.168.1.99` | target address; REQUIRES VALIDATION from LAN/Tailscale | Hypervisor |
| Historical Proxmox VE address | `pve` / `PVE` | `192.168.1.34` | older documented address; not reachable from workstation during 2026-05-24 check | Historical reference |
| AI stack | `ai.millbrook` / `ai-millbrook` | REQUIRES VALIDATION | target AI service address not yet confirmed after Proxmox IP standardization | Ollama, Qdrant, chunk worker |
| Historical AI CT | `ai-millbrook.millbrook` | `192.168.1.40` | older documented address; ARP entry observed, but service ports timed out during 2026-05-24 check | Historical reference |
| Pi-hole VM | `pihole-millbrook` | TBD | Planned/stopped |
| Mathew Win11 VM | `mathew-win11-pro` | TBD | Planned/stopped |
| Bruce Win11 VM | `bruce-win11-pro` | TBD | Planned/stopped |

Observed local name resolution on 2026-05-24:

```text
crm.millbrookfurniture.co.nz       -> 192.168.1.32
timeclock.millbrookfurniture.co.nz -> 192.168.1.32
Data.local                         -> 192.168.1.32
```

Observed reachable service ports from the workstation on 2026-05-24:

```text
192.168.1.32:22    ssh reachable
192.168.1.32:80    http reachable
192.168.1.32:443   https reachable
192.168.1.32:4000  refused from LAN; expected because API binds to 127.0.0.1 on NAS
192.168.1.32:8080  JoinerFlow Caddy HTTP reachable
192.168.1.32:8443  JoinerFlow Caddy HTTPS reachable
```

Observed unavailable service ports from the workstation on 2026-05-24:

```text
192.168.1.31       offline during check
192.168.1.34:22    unavailable
192.168.1.34:8006  unavailable
192.168.1.40:22    timed out
192.168.1.40:8088  timed out
192.168.1.40:6333  timed out
192.168.1.40:6334  timed out
192.168.1.40:11434 timed out
```

Client-facing URLs verified healthy on 2026-05-24 while resolving to `192.168.1.32`:

```text
https://crm.millbrookfurniture.co.nz/api/health
https://timeclock.millbrookfurniture.co.nz/api/health

Response summary:
status=ok
mode=offline-local
server_version=1.0.0
```

Expected local DNS records:

```text
crm.millbrookfurniture.co.nz       -> 192.168.1.31 or 192.168.1.32 depending on active NAS address
timeclock.millbrookfurniture.co.nz -> 192.168.1.31 or 192.168.1.32 depending on active NAS address
crm.millbrook                      -> 192.168.1.32 while 192.168.1.31 is offline
timeclock.millbrook                -> 192.168.1.32 while 192.168.1.31 is offline
nas.millbrook                      -> 192.168.1.32 while 192.168.1.31 is offline
pve.millbrook                      -> 192.168.1.99
ai.millbrook                       -> AI stack IP, REQUIRES VALIDATION
joinerflow.millbrook               -> 192.168.1.32 while 192.168.1.31 is offline
pihole.millbrook                   -> future Pi-hole VM
```

## Proxmox Host

Historical connection before target IP standardization:

```text
SSH: root@192.168.1.34
Web UI: https://192.168.1.34:8006
```

Target connection:

```text
SSH: root@192.168.1.99
Web UI: https://192.168.1.99:8006
```

Historical live state captured on 2026-05-23 before target IP standardization:

```text
Hostname: pve
PVE version: pve-manager/9.2.2/b9984c6d90a4bd80
Kernel: 7.0.2-6-pve
RAM: 23 GiB total, about 16 GiB available at last check
Root disk: /dev/mapper/pve-root, 39G total, 33G free
```

Guests:

| ID | Type | Name | State | Notes |
|---:|---|---|---|---|
| 201 | LXC | `ai-millbrook` | running | AI platform |
| 202 | VM | `pihole-millbrook` | stopped | Planned Pi-hole |
| 301 | VM | `mathew-win11-pro` | stopped | Windows 11 admin/CAD VM |
| 302 | VM | `bruce-win11-pro` | stopped | Windows 11 admin VM |

Useful commands:

```bash
ssh root@192.168.1.99 'pveversion && pct list && qm list && free -h && df -h /'
ssh root@192.168.1.99 'pct status 201 && pct config 201'
ssh root@192.168.1.99 'pct exec 201 -- bash -lc "hostname -f; ip -4 -br addr; docker ps"'
```

## AI Host: CT 201

Identity:

```text
Container ID: 201
Hostname: ai-millbrook.millbrook
IP: REQUIRES VALIDATION; older CT 201 address was 192.168.1.40/24
OS type: Ubuntu LXC
Assigned RAM: target 10 GiB dedicated AI allocation; older CT 201 notes showed 16 GiB
Root disk: /dev/loop0, 157G total, about 132G free at last check
```

Primary paths:

```text
/opt/millbrook/docker-compose.yml
/opt/millbrook/ollama
/opt/millbrook/qdrant
/opt/millbrook/docs
/usr/local/bin/joinerflow-ai-chunker
/etc/systemd/system/joinerflow-ai-chunker.service
/etc/systemd/system/joinerflow-ollama-warmup.service
/etc/systemd/system/joinerflow-ollama-warmup.timer
```

Docker services:

| Container | Image | Ports | Purpose |
|---|---|---|---|
| `ollama` | `ollama/ollama:0.22.1` | `11434:11434` | Local LLM and embeddings |
| `joinerflow-qdrant` | `qdrant/qdrant:v1.15.4` | `6333:6333`, `6334:6334` | Vector database |

Ollama settings:

```text
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
OLLAMA_KEEP_ALIVE=24h
```

Installed models:

```text
nomic-embed-text:latest
phi4-mini:latest
gemma3:4b
```

Systemd services:

| Service | State | Purpose |
|---|---|---|
| `joinerflow-ai-chunker.service` | enabled, active | Receives text from NAS and returns chunks |
| `joinerflow-ollama-warmup.timer` | enabled, active | Keeps Ollama models warm every 10 minutes |

AI chunker:

```text
URL from NAS: `http://ai.millbrook:8088` once DNS is confirmed; older value was `http://192.168.1.40:8088`
Health: `http://ai.millbrook:8088/health` once DNS is confirmed
Bind: 0.0.0.0:8088
Allowed clients in script default: 127.0.0.1 and the active NAS/app-server source IP; verify whether this is `192.168.1.32`, `192.168.1.31`, or another app-server IP before changing it.
```

The chunker algorithm is intentionally equivalent to `server/src/ai/knowledge/fileChunker.ts`, including chunk hashes, offsets, keyword text, and line numbers. It is a CPU offload service only. It does not write production databases.

Validation commands:

```bash
ssh root@192.168.1.99 'pct exec 201 -- systemctl status joinerflow-ai-chunker.service --no-pager'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:8088/health'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:6333/collections/knowledge_chunks | jq "{status:.result.status, points:.result.points_count, size:.result.config.params.vectors.size}"'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:11434/api/tags'
```

## NAS: Data

Identity:

```text
Hostname: Data
IP: 192.168.1.32/24
Purpose: JoinerFlow app, NAS files, app metadata DB, backups, archive
```

Primary paths:

```text
/volume1/joinerflow
/volume1/joinerflow/server/joinerflow.sqlite
/volume1/joinerflow/filesystem
/volume1/joinerflow/imports
/volume1/joinerflow/backups
/volume1/joinerflow/logs
/volume1/archive
/volume1/joinerflow-data
/volume1/joinerflow-data/deployment/synology/docker/docker-compose.prod.yml
/volume1/joinerflow-data/deployment/synology/env/.env.production
/volume1/joinerflow-data/deployment/synology/env/.env.ai
```

Live resource state on 2026-05-23:

```text
RAM: 1.7 GiB total
Swap: 2.0 GiB total
/volume1: 3.5T total, about 985G used, about 2.6T available
```

Docker services:

| Container | Image | Bindings | Purpose |
|---|---|---|---|
| `joinerflow-server` | local build `joinerflow-joinerflow-server` | `127.0.0.1:4000->4000` | API, DB owner, indexing orchestrator |
| `joinerflow-client` | local build `joinerflow-joinerflow-client` | internal | CRM web UI |
| `joinerflow-clock-client` | local build `joinerflow-joinerflow-clock-client` | internal | Timeclock UI |
| `joinerflow-proxy` | `caddy:2.9-alpine` | `8080->80`, `8443->443` | Local reverse proxy |
| `joinerflow-postgres` | `postgres:16-alpine` | `127.0.0.1:15432->5432` | Staged Postgres/shadow infrastructure |

Removed from NAS:

```text
ollama
joinerflow-qdrant
/volume1/joinerflow/ai/models
/volume1/vector-data/qdrant
```

Those AI functions now live on CT 201.

Current JoinerFlow AI env:

```text
AI_ENABLED=true
OLLAMA_BASE_URL=http://ai.millbrook:11434
QDRANT_URL=http://ai.millbrook:6333
AI_CHUNKER_URL=http://ai.millbrook:8088
AI_CHUNKER_TIMEOUT_MS=30000
OLLAMA_PRIMARY_MODEL=gemma3:4b
OLLAMA_FAST_MODEL=phi4-mini:latest
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
QDRANT_COLLECTION_ENTITIES=entity_embeddings
QDRANT_COLLECTION_KNOWLEDGE=knowledge_chunks
QDRANT_REQUEST_TIMEOUT_MS=8000
AI_REQUEST_TIMEOUT_MS=90000
AI_RATE_LIMIT_MAX=60
AI_RATE_LIMIT_WINDOW_MS=60000
AI_KNOWLEDGE_MAX_CONCURRENT=1
AI_VECTOR_QUEUE_MAX=5000
AI_EMBED_QUEUE_MAX=5000
AI_KNOWLEDGE_QUEUE_MAX=15000
AI_KNOWLEDGE_ALLOWED_ROOTS=/volume1/joinerflow/filesystem,/volume1/joinerflow/imports,/volume1/archive
```

Health validation:

```bash
ssh mathew@192.168.1.32 'curl -fsS http://127.0.0.1:4000/health'
ssh mathew@192.168.1.32 'curl -fsS http://ai.millbrook:8088/health'
ssh mathew@192.168.1.32 'curl -fsS http://ai.millbrook:6333/collections'
ssh mathew@192.168.1.32 'curl -fsS http://ai.millbrook:11434/api/tags'
```

Docker validation:

```bash
ssh mathew@192.168.1.32 'sudo /usr/local/bin/docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
ssh mathew@192.168.1.32 'cd /volume1/joinerflow-data/deployment/synology/docker && sudo /usr/local/bin/docker compose --env-file ../env/.env.production --env-file ../env/.env.ai -f docker-compose.prod.yml ps'
```

## JoinerFlow AI/Search Pipeline

Current flow:

1. `joinerflow-server` on NAS scans allowed NAS folders.
2. `joinerflow-server` extracts file text on NAS.
3. `joinerflow-server` sends extracted text to the AI host chunker at `http://ai.millbrook:8088/chunk` once DNS is confirmed.
4. AI host chunker returns chunk records.
5. `joinerflow-server` requests embeddings from Ollama on CT 201.
6. `joinerflow-server` writes chunk metadata/cache to SQLite on NAS.
7. `joinerflow-server` writes/searches vectors in Qdrant on CT 201.
8. Unified search queries Qdrant and app metadata, then optionally asks Ollama for an operational answer.

Ownership boundary:

```text
NAS owns production SQLite and JoinerFlow business/application state.
AI host owns compute-heavy chunking, embedding model inference, LLM inference, and Qdrant vector storage.
```

Do not mount the SQLite database read/write into CT 201. If a future full indexing worker is moved to CT 201, use either API-based queue consumption or migrate queue/metadata ownership cleanly to Postgres.

Current AI data health:

```text
ai_knowledge_chunks: 5267 rows, all 768 dimensions
ai_knowledge_embedding_cache: 4924 rows, all 768 dimensions
ai_knowledge_queue: empty at last check
Qdrant knowledge_chunks: green, vector size 768, 5223 points at last check
```

Useful SQLite checks:

```bash
ssh mathew@192.168.1.32 'sudo sqlite3 /volume1/joinerflow/server/joinerflow.sqlite "select dimensions, count(*) from ai_knowledge_chunks group by dimensions order by dimensions; select dimensions, count(*) from ai_knowledge_embedding_cache group by dimensions order by dimensions; select status, task_type, count(*) from ai_knowledge_queue group by status, task_type;"'
```

Search validation from inside `joinerflow-server`:

```bash
ssh mathew@192.168.1.32 'sudo /usr/local/bin/docker exec joinerflow-server node -e '\''const { initializeDatabase } = require("./dist/db"); const { runUnifiedSearch } = require("./dist/search/unifiedSearch"); (async () => { await initializeDatabase(); const result = await runUnifiedSearch({ query: "how many kitchens", include_ai: true, limit: 8, context: { pathname: "/admin/ai-knowledge", client_mode: false } }, { user: null, requestId: "manual_validation" }); console.log(JSON.stringify({ answer_status: result.answer && result.answer.status, result_count: result.results && result.results.length, evidence_count: result.diagnostics && result.diagnostics.evidence_count, degraded: result.diagnostics && result.diagnostics.degraded, errors: result.diagnostics && result.diagnostics.errors }, null, 2)); })().catch((error) => { console.error(error && error.stack || error); process.exit(1); });'\'''
```

## Qdrant

Location:

```text
Host: CT 201 ai-millbrook
Container: joinerflow-qdrant
Storage: /opt/millbrook/qdrant
REST: http://ai.millbrook:6333
gRPC: ai.millbrook:6334
```

Collections:

| Collection | Vector size | Purpose |
|---|---:|---|
| `entity_embeddings` | 768 | Semantic entity search |
| `knowledge_chunks` | 768 | Indexed file/chunk search |

Qdrant snapshots were created during remediation on 2026-05-23 for:

```text
knowledge_chunks
entity_embeddings
```

Validation:

```bash
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:6333/collections/knowledge_chunks | jq'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:6333/collections/entity_embeddings | jq'
```

## Ollama

Location:

```text
Host: CT 201 ai-millbrook
Container: ollama
Storage: /opt/millbrook/ollama
API: http://ai.millbrook:11434
```

Models:

```text
nomic-embed-text:latest  -> embeddings, 768 dimensions
phi4-mini:latest         -> fast operational answer model
gemma3:4b                -> primary model
```

Warmup:

```text
joinerflow-ollama-warmup.timer runs every 10 minutes.
```

Validation:

```bash
ssh root@192.168.1.99 'pct exec 201 -- systemctl status joinerflow-ollama-warmup.timer --no-pager'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:11434/api/tags'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS http://127.0.0.1:11434/api/embeddings -H "Content-Type: application/json" -d "{\"model\":\"nomic-embed-text:latest\",\"prompt\":\"dimension test\"}"'
```

## Application Code Changes That Matter Operationally

AI/search changes now present in the source tree:

```text
server/src/ai/embeddings/embeddingService.ts
  EMBEDDING_DIMENSIONS = 768

server/src/ai/knowledge/embeddingGenerator.ts
  rejects stale cached embeddings unless dimensions are 768

server/src/ai/knowledge/remoteChunker.ts
  delegates chunking to AI_CHUNKER_URL with local fallback

server/src/ai/knowledge/knowledgeIndexer.ts
  uses chunkKnowledgeTextForIndexing()

server/src/search/operationalQueryEngine.ts
  longer operational answer timeout and evidence fallback on schema failures

client/src/components/search/UnifiedSearchBar.jsx
  debounces and aborts superseded unified search requests

client/src/api/localApiClient.js
  supports per-request timeoutMs and gives unified search a longer timeout

deployment/ai/chunker/joinerflow-ai-chunker.py
  AI host chunking worker

deployment/ai/chunker/joinerflow-ai-chunker.service
  systemd unit for the AI host chunking worker
```

When changing any of these, rebuild and recreate the affected container/service.

NAS server rebuild:

```bash
ssh mathew@192.168.1.32 'cd /volume1/joinerflow-data/deployment/synology/docker && sudo /usr/local/bin/docker compose --env-file ../env/.env.production --env-file ../env/.env.ai -f docker-compose.prod.yml build joinerflow-server && sudo /usr/local/bin/docker compose --env-file ../env/.env.production --env-file ../env/.env.ai -f docker-compose.prod.yml up -d --no-deps joinerflow-server'
```

Client rebuild:

```bash
ssh mathew@192.168.1.32 'cd /volume1/joinerflow-data/deployment/synology/docker && sudo /usr/local/bin/docker compose --env-file ../env/.env.production --env-file ../env/.env.ai -f docker-compose.prod.yml build joinerflow-client && sudo /usr/local/bin/docker compose --env-file ../env/.env.production --env-file ../env/.env.ai -f docker-compose.prod.yml up -d --no-deps joinerflow-client'
```

AI chunker redeploy:

```bash
scp deployment/ai/chunker/joinerflow-ai-chunker.py deployment/ai/chunker/joinerflow-ai-chunker.service root@192.168.1.99:/tmp/
ssh root@192.168.1.99 'pct push 201 /tmp/joinerflow-ai-chunker.py /usr/local/bin/joinerflow-ai-chunker --perms 0755 && pct push 201 /tmp/joinerflow-ai-chunker.service /etc/systemd/system/joinerflow-ai-chunker.service --perms 0644 && pct exec 201 -- bash -lc "systemctl daemon-reload && systemctl enable --now joinerflow-ai-chunker.service && systemctl restart joinerflow-ai-chunker.service"'
```

## Backups And Rollback

Known backup from AI remediation:

```text
/volume1/joinerflow/backups/ai-remediation-20260523-203101
```

Contains:

```text
joinerflow.sqlite
env.production
env.ai
```

Qdrant snapshots were created on CT 201 during remediation. Check:

```bash
ssh root@192.168.1.99 'pct exec 201 -- find /opt/millbrook/qdrant/snapshots -maxdepth 3 -type f | sort'
```

Before further AI/index changes:

```bash
ssh mathew@192.168.1.32 'ts=$(date +%Y%m%d-%H%M%S); sudo mkdir -p /volume1/joinerflow/backups/manual-$ts; sudo cp -a /volume1/joinerflow/server/joinerflow.sqlite /volume1/joinerflow/backups/manual-$ts/joinerflow.sqlite; sudo cp -a /volume1/joinerflow-data/deployment/synology/env/.env.production /volume1/joinerflow/backups/manual-$ts/env.production; sudo cp -a /volume1/joinerflow-data/deployment/synology/env/.env.ai /volume1/joinerflow/backups/manual-$ts/env.ai; echo /volume1/joinerflow/backups/manual-$ts'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS -X POST http://127.0.0.1:6333/collections/knowledge_chunks/snapshots'
ssh root@192.168.1.99 'pct exec 201 -- curl -fsS -X POST http://127.0.0.1:6333/collections/entity_embeddings/snapshots'
```

Rollback options:

- Restore JoinerFlow server/client by rebuilding from previous source or container image if retained.
- Restore `.env.production` and `.env.ai` from the latest backup and recreate `joinerflow-server`.
- Disable remote chunking by removing or blanking `AI_CHUNKER_URL`; `joinerflow-server` will fall back to local chunking.
- Stop AI chunker with `systemctl stop joinerflow-ai-chunker.service`; app fallback should continue local chunking.
- Restore SQLite only after stopping `joinerflow-server` and making a copy of the current DB.

## Security Notes

Current exposure is LAN-only based on known configuration.

Important points:

- Proxmox UI target is `https://192.168.1.99:8006`.
- JoinerFlow server API binds to `127.0.0.1:4000` on NAS and is reached through Caddy.
- Caddy exposes `8080` and `8443` on the active NAS LAN address.
- DSM/nginx owns normal HTTPS port `443` and proxies the CRM/timeclock hostnames to JoinerFlow Caddy.
- Qdrant, Ollama, and the chunker bind on CT 201 LAN. They should remain LAN/Tailscale only and not be forwarded from the router.
- AI chunker has an application-level client IP allowlist for `127.0.0.1` and the NAS source IP. Verify whether the active NAS source IP is `192.168.1.31` or `192.168.1.32` before changing this allowlist.
- No passwords are documented here.

Potential future hardening:

- Add host firewall rules on CT 201 limiting `11434`, `6333`, `6334`, and `8088` to NAS and trusted admin networks.
- Add Tailscale ACLs for admin-only infrastructure management.
- Confirm whether `192.168.1.31` and `192.168.1.32` are both intentional NAS addresses, and document their interface/VLAN/DHCP reservation ownership.
- Add authenticated reverse proxy only if remote access is required.

## What Is Left To Do

High priority:

- Configure and start Pi-hole VM 202, then move DNS intentionally with rollback.
- Reconcile LAN DNS/hosts records for `192.168.1.31` and `192.168.1.32`; `192.168.1.31` is valid but was offline during the 2026-05-24 check.
- Confirm Tailscale hostnames and ACLs for `pve`, `Data`, and `ai-millbrook`.
- Add host firewall rules on CT 201 for AI service ports.
- Add scheduled Qdrant snapshots and retention.
- Add scheduled SQLite/env backups with restore test.
- Document NAS backup/snapshot schedule and verify restore procedure.

Medium priority:

- Move queue/metadata from SQLite-only toward Postgres when ready.
- Consider an API-based full AI indexing worker on CT 201 if file extraction also needs to move off NAS.
- Add monitoring/alerts for:
  - Qdrant collection unhealthy
  - embedding dimension mismatch
  - AI chunker unavailable
  - Ollama model timeout
  - repeated unified search rate limiting
  - stuck knowledge queue rows
- Add a nightly integrity check:
  - all chunks are 768-dimensional
  - Qdrant collection vector size is 768
  - queue is not stuck in `processing`
  - worker health endpoints respond

VM work remaining:

- Complete Pi-hole VM 202 configuration.
- Complete Mathew Windows 11 VM 301 install and virtio disk/driver setup.
- Complete Bruce Windows 11 VM 302 install.
- Configure RDP/Parsec/Tailscale for Windows VMs without WAN exposure.
- Decide final resource allocations after RAM upgrade.

Documentation work remaining:

- Keep this file current after every infrastructure change.
- Add exact backup retention once schedules are confirmed.
- Add final DNS records once Pi-hole is live.
- Add Tailscale names/IPs once confirmed.
- Add VM IP allocation once Windows/Pi-hole guests are configured.

## Fast New-Session Checklist

Use this sequence at the start of a new infrastructure session:

```bash
# 1. Proxmox inventory
ssh root@192.168.1.99 'hostname; pveversion | head -1; pct list; qm list; free -h; df -h /'

# 2. AI host health
ssh root@192.168.1.99 'pct exec 201 -- bash -lc "hostname -f; ip -4 -br addr; docker ps; systemctl is-active joinerflow-ai-chunker.service joinerflow-ollama-warmup.timer; curl -fsS http://127.0.0.1:8088/health; curl -fsS http://127.0.0.1:6333/collections/knowledge_chunks | jq \"{status:.result.status, points:.result.points_count, size:.result.config.params.vectors.size}\""'

# 3. NAS app health
ssh mathew@192.168.1.32 'hostname; sudo /usr/local/bin/docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"; curl -fsS http://127.0.0.1:4000/health'

# 4. AI index integrity
ssh mathew@192.168.1.32 'sudo sqlite3 /volume1/joinerflow/server/joinerflow.sqlite "select dimensions, count(*) from ai_knowledge_chunks group by dimensions order by dimensions; select dimensions, count(*) from ai_knowledge_embedding_cache group by dimensions order by dimensions; select status, task_type, count(*) from ai_knowledge_queue group by status, task_type;"'

# 5. Recent remediation/change log
ssh mathew@192.168.1.32 'sudo tail -n 80 /var/log/joinerflow-ai-remediation.log'
```
