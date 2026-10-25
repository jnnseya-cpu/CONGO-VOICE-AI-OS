# 09 — Data Architecture

ERD, schemas, retrieval, graph, warehouse and the governance that binds them.
Existing tables are described as they are; new tables are given in full DDL.

---

## 9.1 Principles

1. **`src/server/db/schema.ts` is the single source of truth.** Nothing creates
   a table elsewhere. After a change: `rm -rf drizzle && npx drizzle-kit
   generate --name init` — pre-release, one migration.
2. **Everything is saved.** Inputs, transcripts, translations, answers, risk,
   escalations, overrides, notifications, drafts and failures, each with
   timestamp, actor, role, language, module, location, confidence, version and
   audit status. `interactions` carries 43 columns because of this rule.
3. **Tenancy is a column, isolation is a filter.** `tenantId` on every
   citizen-scoped table; the filter is applied in the scoped `ctx.db`, never
   left to a caller.
4. **Personal data is encrypted at the field level where it can identify.**
   Phone numbers: AES-256-GCM with a keyed blind index. Recordings, images,
   generated documents: encrypted by the storage layer so no caller can forget.
5. **Retention is a property of the row, swept by the scheduler, and audited.**
6. **A denominator is part of a figure.** Analytics tables carry the population
   base, not just the count.

---

## 9.2 Core ERD

```
                    ┌──────────┐
                    │ tenants  │
                    └────┬─────┘
          ┌──────────────┼──────────────┬──────────────┐
    ┌─────▼──────┐  ┌────▼─────┐  ┌─────▼──────┐  ┌────▼──────┐
    │organisations│  │provinces │  │territories │  │ users     │
    └─────┬──────┘  └────┬─────┘  └─────┬──────┘  └────┬──────┘
          │              │              │              │
          │              └──────┬───────┘              │
          │                     │                      │
          │              ┌──────▼───────────────────────▼──────┐
          │              │          interactions               │
          │              │  43 cols: transcript, translation,  │
          │              │  intent, response, confidence,      │
          │              │  riskScore, severity, citations,    │
          │              │  promptVersion, protocolVersion,    │
          │              │  modelRoute, acu, traceId,          │
          │              │  safeguarding, seq, sessionId       │
          │              └───┬─────────┬──────────┬────────────┘
          │                  │         │          │
     ┌────▼─────┐   ┌────────▼──┐  ┌───▼──────┐  ┌▼──────────────┐
     │  cases   │◄──┤ risk_     │  │ files    │  │ sessions      │
     │ 36 cols  │   │assessments│  │ encrypted│  │ channel state │
     └────┬─────┘   └───────────┘  └──────────┘  └───────────────┘
          │
   ┌──────┼────────┬──────────────┬─────────────┬───────────────┐
┌──▼────┐ │  ┌─────▼──────┐  ┌────▼─────┐  ┌────▼──────┐  ┌─────▼──────┐
│case_  │ │  │ follow_ups │  │ tasks    │  │ai_overrides│ │safeguarding│
│events │ │  └────────────┘  └──────────┘  └───────────┘  │ _records   │
└───────┘ │                                                └────────────┘
          │
    ┌─────▼──────────┐
    │ notifications  │──► notification_templates, schedules
    └────────────────┘

MODULE RECORDS                  KNOWLEDGE                  GOVERNANCE
health_triage_records           kb_documents               review_boards
agriculture_reports             kb_chunks                  review_board_members
agri_clusters                   protocol_versions          review_submissions
planting_calendars              prompt_versions            review_signoffs
input_registry                  glossaries                 model_configs
market_prices                   service_directory          evaluation_runs
education_sessions              language_corpus            audit_logs (chained)
learner_profiles                language_lexicon           break_glass_access
learning_evidence               language_quality           data_requests
stories                                                    consents
```

### Key existing shapes

**`interactions`** — the spine. Notable columns that make the audit claim real:
`promptVersion`, `protocolVersion`, `modelRoute`, `citations`, `acu`,
`confidenceDimensions`, `transcriptTags`, `traceId`, `auditStatus`, `version`,
`seq`, `idempotencyKey`, `failureReason`, `safeguarding`.

**`cases`** — 36 columns, with the clinical-governance set that most case
systems lack: `aiSeverityLevel` *and* `overriddenSeverityLevel` *and*
`overrideReason` stored separately, so the model's opinion, the human's
correction and the reason are all permanently distinguishable. Plus
`slaDueAt`/`slaBreached`/`slaPausedReason`, `citizenReachability`,
`isNotifiable`, `mergedInto`.

---

## 9.3 Indexing and performance

| Table | Index | Reason |
|---|---|---|
| `interactions` | `(tenantId, createdAt DESC)` | Every dashboard query |
| `interactions` | `(userId, createdAt DESC)` | "My history" |
| `interactions` | `(sessionId, seq)` | Conversation reconstruction |
| `interactions` | `(module, province, createdAt)` | Analytics by territory |
| `interactions` | partial `WHERE severity = 'critical'` | Severity-4 sweep must never scan |
| `cases` | `(assignedTo, status, slaDueAt)` | The worker queue, the hottest query |
| `cases` | partial `WHERE slaBreached = false AND status NOT IN (terminal)` | SLA sweep |
| `cases` | `(tenantId, territory, module, status)` | Supervisory views |
| `notifications` | `(status, createdAt)` partial `WHERE status = 'queued'` | Dispatch loop |
| `notifications` | `(providerMessageId)` | DLR matching |
| `audit_logs` | `(entityType, entityId, createdAt)` | Entity history |
| `audit_logs` | `(createdAt)` | Chain verification |
| `ai_usage_logs` | `(tenantId, createdAt)`, `(capability, createdAt)` | ACU attribution |
| `rate_limit_counters` | `(key, windowStart)` unique | Limiter correctness |
| `users` | `(phoneIndex)` unique | Blind-index lookup — **the only way a phone is found** |

**Rule:** any query on the citizen path that cannot use an index is a defect.
`EXPLAIN` assertions belong in the test suite for the five hottest queries.

---

## 9.4 NEW — Agent runtime tables

```sql
CREATE TABLE agent_definitions (
  id              varchar(64) PRIMARY KEY,
  tier            smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  title_fr        varchar(160) NOT NULL,
  purpose_fr      text NOT NULL,
  max_autonomy    varchar(2) NOT NULL CHECK (max_autonomy IN ('L0','L1','L2','L3')),
  requires        jsonb NOT NULL DEFAULT '[]',   -- Permission[]
  reads           jsonb NOT NULL DEFAULT '[]',   -- DataScope[]
  writes          jsonb NOT NULL DEFAULT '[]',   -- WriteScope[]
  triggers        jsonb NOT NULL DEFAULT '[]',
  budget_acu      real NOT NULL DEFAULT 1.0,
  timeout_ms      integer NOT NULL DEFAULT 30000,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Autonomy actually granted, per tenant, per action type. Never above max_autonomy.
CREATE TABLE agent_authority (
  agent_id        varchar(64) NOT NULL REFERENCES agent_definitions(id),
  tenant_id       uuid,
  action_type     varchar(64) NOT NULL,
  autonomy        varchar(2) NOT NULL CHECK (autonomy IN ('L0','L1','L2','L3')),
  -- Promotion is earned: 200 proposals, >=90% acceptance, zero reversals.
  proposals_count integer NOT NULL DEFAULT 0,
  accepted_count  integer NOT NULL DEFAULT 0,
  reversal_count  integer NOT NULL DEFAULT 0,
  promoted_at     timestamptz,
  promoted_by     uuid REFERENCES users(id),
  suspended       boolean NOT NULL DEFAULT false,
  suspended_reason text,
  PRIMARY KEY (agent_id, tenant_id, action_type)
);

CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY,               -- UUIDv7, time-ordered
  agent_id        varchar(64) NOT NULL REFERENCES agent_definitions(id),
  tenant_id       uuid,
  actor_user_id   uuid REFERENCES users(id),      -- null when system-triggered
  actor_role      user_role,
  trigger         varchar(64) NOT NULL,
  subject_type    varchar(32),                    -- 'case' | 'interaction' | 'territory' | 'system'
  subject_id      uuid,
  outcome         varchar(16) NOT NULL DEFAULT 'running',
  state           jsonb NOT NULL DEFAULT '{}',    -- checkpoints for durable resumption
  reasoning_fr    text,
  acu_spent       real NOT NULL DEFAULT 0,
  model_route     jsonb NOT NULL DEFAULT '{}',
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  trace_id        varchar(64)
);
CREATE INDEX ON agent_runs (agent_id, started_at DESC);
CREATE INDEX ON agent_runs (tenant_id, started_at DESC);
CREATE INDEX ON agent_runs (subject_type, subject_id);
CREATE UNIQUE INDEX ON agent_runs (agent_id, tenant_id, subject_id)
  WHERE outcome = 'running';                      -- one live run per subject

CREATE TABLE agent_proposals (
  id              uuid PRIMARY KEY,
  run_id          uuid NOT NULL REFERENCES agent_runs(id),
  agent_id        varchar(64) NOT NULL,
  action_type     varchar(64) NOT NULL,
  payload         jsonb NOT NULL,
  autonomy        varchar(2) NOT NULL,
  rationale_fr    text NOT NULL,
  evidence        jsonb NOT NULL,                 -- EvidenceRef[]; MUST resolve
  confidence      real,
  cost_acu        real NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,
  decided_at      timestamptz,
  decided_by      uuid REFERENCES users(id),
  decision        varchar(16),                    -- accepted | rejected | expired | superseded
  decision_reason text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_not_empty CHECK (jsonb_array_length(evidence) > 0)
);
CREATE INDEX ON agent_proposals (decided_at) WHERE decided_at IS NULL;

CREATE TABLE agent_actions (
  id              uuid PRIMARY KEY,
  run_id          uuid NOT NULL REFERENCES agent_runs(id),
  proposal_id     uuid REFERENCES agent_proposals(id),  -- null for L3 direct action
  action_type     varchar(64) NOT NULL,
  target_type     varchar(32) NOT NULL,
  target_id       uuid,
  payload         jsonb NOT NULL,
  reversal        jsonb NOT NULL,                 -- how to undo. MANDATORY.
  reversed_at     timestamptz,
  reversed_by     uuid REFERENCES users(id),
  reversal_reason text,
  watchdog_until  timestamptz,                    -- auto-reverse if signal uncleared
  executed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_faults (
  id              uuid PRIMARY KEY,
  run_id          uuid REFERENCES agent_runs(id),
  agent_id        varchar(64) NOT NULL,
  kind            varchar(48) NOT NULL,  -- unresolvable_evidence | write_out_of_scope
                                         -- | budget_exceeded | timeout | schema_violation
  detail          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_memory (
  id              uuid PRIMARY KEY,
  agent_id        varchar(64) NOT NULL,
  tenant_id       uuid,
  layer           varchar(16) NOT NULL,  -- episodic | procedural
  subject_type    varchar(32),
  subject_id      uuid,
  -- Episodic rows about a citizen are ciphertext under that citizen's purpose key
  -- and are destroyed in the same transaction as /v1/me/delete.
  content         text NOT NULL,
  encrypted       boolean NOT NULL DEFAULT false,
  weight          real NOT NULL DEFAULT 1.0,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_memory (agent_id, layer, subject_type, subject_id);
```

---

## 9.5 NEW — Vector retrieval (closes G-04)

### Choice: pgvector in the existing PostgreSQL

| Option | Verdict |
|---|---|
| **pgvector** | **Chosen.** No new system, no new availability dependency, transactional consistency with `kb_documents` so a suspended protocol's chunks vanish in the same transaction, and PGlite-compatible so offline tests still run |
| Pinecone / Weaviate / Qdrant | Rejected: a second datastore to operate, a residency question per vendor, and eventual consistency with protocol suspension — which is a clinical-safety hazard, not an inconvenience |

```sql
ALTER TABLE kb_chunks
  ADD COLUMN embedding vector(1024),
  ADD COLUMN embedding_model varchar(64),
  ADD COLUMN embedding_version integer NOT NULL DEFAULT 1,
  ADD COLUMN language language_code NOT NULL DEFAULT 'fr',
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('french', content)) STORED;

CREATE INDEX kb_chunks_hnsw ON kb_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX kb_chunks_tsv ON kb_chunks USING gin (tsv);
CREATE INDEX kb_chunks_scope ON kb_chunks (tenant_id, module, language, status);
```

### Hybrid retrieval

```
query → normalise → embed (per-language model)
      → dense kNN (top 50)  ┐
      → BM25 lexical (top 50)┼→ Reciprocal Rank Fusion
      → protocol exact match ┘
      → filter: tenant, module, language, status='active', board-signed
      → rerank by outcome weight (procedural memory, §05.9)
      → token budget per module → context
```

### Three rules that make it safe

1. **A chunk whose source artefact is not `active` is never retrievable.** A
   suspended protocol must disappear from answers immediately, which is exactly
   why the vectors live in the same transaction as the documents.
2. **Exact protocol match outranks similarity, always.** Semantic retrieval
   supplements the deterministic protocol engine; it never replaces it.
3. **Citations are mandatory.** `interactions.citations` already exists. A
   clinical sentence with no citation fails `checkOutboundClaims`.

---

## 9.6 Memory layers — storage mapping

| Layer | Table | Encrypted | Lifetime | Deleted by |
|---|---|---|---|---|
| Working | `agent_runs.state` | no | run + 24 h | sweep |
| Episodic (citizen) | `agent_memory` layer=`episodic` | **yes**, per-citizen purpose | retention class | `/v1/me/delete`, same transaction |
| Episodic (case) | `case_events` + `agent_runs` | no | case retention | retention sweep |
| Semantic | `kb_chunks` + `kg_*` | no (no citizen content) | until superseded | artefact retirement |
| Procedural | `agent_proposals` outcomes | no (outcomes, not content) | 180 days rolling | sweep |

---

## 9.7 NEW — Knowledge graph (closes G-05)

### Choice: adjacency tables in PostgreSQL with recursive CTEs

Not Neo4j. The graph is small (10⁵–10⁶ nodes), the queries are shallow (2–3
hops), and it must join to `cases` and `interactions` transactionally. A
separate graph database would add an operational burden and a consistency
problem for no query the platform actually needs.

```sql
CREATE TABLE kg_nodes (
  id          uuid PRIMARY KEY,
  tenant_id   uuid,
  kind        varchar(32) NOT NULL,
    -- territory | facility | protocol | symptom | condition | crop | pathogen
    -- | input | curriculum_topic | language | organisation | worker | channel
  key         varchar(160) NOT NULL,
  label_fr    varchar(240) NOT NULL,
  labels      jsonb NOT NULL DEFAULT '{}',   -- per-language labels
  properties  jsonb NOT NULL DEFAULT '{}',
  source      varchar(64) NOT NULL,          -- provenance is mandatory
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, key)
);

CREATE TABLE kg_edges (
  id          uuid PRIMARY KEY,
  tenant_id   uuid,
  from_id     uuid NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  to_id       uuid NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  kind        varchar(32) NOT NULL,
    -- located_in | refers_to | treats | indicates | affects | prerequisite_of
    -- | serves | speaks | approved_for | contraindicated_with | seasonal_in
  weight      real NOT NULL DEFAULT 1.0,
  properties  jsonb NOT NULL DEFAULT '{}',
  source      varchar(64) NOT NULL,
  valid_from  timestamptz,
  valid_to    timestamptz,                   -- a clinical relation can expire
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON kg_edges (from_id, kind);
CREATE INDEX ON kg_edges (to_id, kind);
```

### What the graph answers that tables cannot

| Question | Traversal |
|---|---|
| Which facility should this case be referred to, given territory, module and capability? | `territory → located_in → facility → serves → module` |
| Which protocols apply to this symptom in this age band? | `symptom → indicates → condition → treats → protocol` |
| Is this crop–pathogen pair seasonal here? | `crop → affects ← pathogen → seasonal_in → territory` |
| What must a learner know before this topic? | `topic → prerequisite_of*` (recursive) |
| Which territories share the features of this cluster? | cluster features → nodes → shared edges |
| Which worker speaks the language this citizen used, in this territory? | `worker → speaks → language`, `worker → located_in → territory` |

**Provenance is mandatory on every node and edge.** A clinical relation with no
stated source cannot be inserted — which is what keeps the graph from becoming
a store of model-generated assertions.

---

## 9.8 NEW — Predictive feature store

```sql
CREATE TABLE feature_snapshots (
  id            uuid PRIMARY KEY,
  tenant_id     uuid,
  entity_type   varchar(32) NOT NULL,   -- territory | learner | crop_territory | channel
  entity_id     varchar(160) NOT NULL,
  as_of         date NOT NULL,
  features      jsonb NOT NULL,
  feature_set   varchar(64) NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, entity_type, entity_id, as_of, feature_set, version)
);

CREATE TABLE predictions (
  id            uuid PRIMARY KEY,
  tenant_id     uuid,
  model_id      varchar(64) NOT NULL,
  entity_type   varchar(32) NOT NULL,
  entity_id     varchar(160) NOT NULL,
  horizon_days  integer NOT NULL,
  value         real NOT NULL,
  interval_low  real NOT NULL,           -- MANDATORY
  interval_high real NOT NULL,           -- MANDATORY
  base_rate     real NOT NULL,           -- MANDATORY
  features_id   uuid REFERENCES feature_snapshots(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Written back when the horizon elapses. Unverified models are retired.
  actual        real,
  verified_at   timestamptz
);
```

**`interval_low`, `interval_high` and `base_rate` are `NOT NULL` on purpose.**
A point forecast shown to a minister without an interval and a base rate is a
decision-making hazard. The schema makes the honest version the only
representable one.

**Every prediction is scored against the outcome.** A model whose intervals do
not contain the actual value at the expected rate is retired automatically, and
§13 shows its calibration history.

---

## 9.9 NEW — Analytics warehouse

Analytics currently run against the OLTP database, which is why heavy reporting
competes with a citizen's triage.

| Property | Specification |
|---|---|
| Store | A separate PostgreSQL (or BigQuery where the tenant's residency allows), fed by the event log |
| Pipeline | `sync_events` → CDC → staging → dimensional model |
| Latency | ≤ 15 min for operational marts; nightly for historical |
| Grain | One row per interaction, per case transition, per notification |
| **Anonymisation at the boundary** | Transcripts, phone numbers and free text **never cross**. Only identifiers, codes, timings, scores and territory |
| Denominators | Population, facility and worker dimensions loaded from §07.6 sources |
| Access | `report:export` + tenancy scope; no raw-row access without `audit:read` |

### Dimensional model

```
FACTS                            DIMENSIONS
fact_interaction                 dim_date        dim_territory
  (grain: one interaction)       dim_language    dim_module
fact_case_transition             dim_channel     dim_severity
  (grain: one transition)        dim_role        dim_protocol_version
fact_notification                dim_prompt_version
fact_ai_usage                    dim_worker (pseudonymised)
  (grain: one model call)        dim_population (the denominator dimension)
```

`dim_population` exists so the §04.5 denominator rule is enforced by the schema:
a fact cannot be rendered as a rate without joining it.

---

## 9.10 Retention, residency and erasure

| Class | Period | Configurable | Swept by |
|---|---|---|---|
| Audio recordings | 90 days | `RETENTION_AUDIO_DAYS` | `media_retention` |
| Images | 365 days | `RETENTION_IMAGE_DAYS` | `media_retention` |
| Video | 365 days | `RETENTION_VIDEO_DAYS` | `media_retention` |
| Generated documents | 365 days | `RETENTION_DOCUMENT_DAYS` | `expire_reports` |
| Interaction text | Tenant decision | — | **DECISION** |
| Audit log | Never auto-deleted | — | — |
| Agent working memory | 24 h | — | sweep |
| Procedural memory | 180 days | — | sweep |
| Rate-limit counters | 7 days | — | sweep |

**Erasure.** `/v1/me/delete` removes the account, its episodic agent memory, its
files and its personal identifiers in one transaction. What survives, by design
and stated in the privacy policy: **aggregate counts already incorporated into
published figures, and the audit record that the erasure happened.** A system
that could erase its own audit trail could not prove it had complied.

**Residency.** `core/residency.ts` decides which provider may be used.
`DATA_RESIDENCY` and `DEPLOYMENT_JURISDICTION` are deployment-declared. A
provider outside policy is refused and the readiness probe reports it. The
analytics warehouse inherits the tenant's residency policy.

**Rotation is a migration, not a config change.** Phone numbers are found by a
keyed digest from the same root, so a new key means every digest stops matching:
citizens cannot sign in and alerts cannot find a destination. The rotation is
complete only when every stored value is re-encrypted and re-indexed, with both
keys available. This is already written in `docs/SECURITY.md` §2 and is repeated
here because it is the most dangerous operation in the platform.
