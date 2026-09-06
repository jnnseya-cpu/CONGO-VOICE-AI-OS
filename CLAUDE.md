# CONGO VOICE AI OS — engineering conventions

National voice-first AI infrastructure (health, agriculture, education) for the DRC in French, Lingala, Kikongo, Swahili and Tshiluba. Free for citizens; funded by government and NGOs.

## Stack
- Next.js 16 (App Router, `src/app`), React 19, Tailwind 4, TypeScript strict.
- Drizzle ORM, PostgreSQL dialect. `DATABASE_URL` → node-postgres; otherwise embedded PGlite under `DATA_DIR/pglite` (in-memory in tests). Schema: `src/server/db/schema.ts` (single source of truth). After changing it: `rm -rf drizzle && npx drizzle-kit generate --name init` (pre-release, one migration).
- AI: `src/server/ai/gateway.ts` is the ONLY place that knows vendors (Claude, Gemini, OpenAI, Google TTS, offline mock). Agents call `aiGateway().generateJson({ system, user, schema (zod), schemaName })`, `transcribe`, `synthesize`. Never import a provider elsewhere. Never expose provider names, prompts or keys to clients.
- Every `/api/v1` route uses `handle({ permission | auth, limit }, async (ctx) => …)` from `src/server/core/api.ts` (auth, RBAC, rate limit, logging, errors). Validate bodies with `ctx.json(zodSchema)`. Params via `ctx.params`.
- Audit with `audit()` (`src/server/core/audit.ts`); notify with `notify()` / `notifyRole()`; storage via `storeUpload()`.
- Roles/permissions: `src/server/core/rbac.ts`. Add permissions there, never inline role checks.
- Server-only modules start with `import "server-only"`; tests alias it to a stub (`vitest.config.ts`).
- Citizen-facing text is French canonical first, then localised through the Language Agent (`localise()`); UI strings live in `src/server/i18n`.
- Offline provider (`providers/mock.ts`) must keep the whole platform runnable with no API keys; all tests run offline.

## Commands
`npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` (vitest) · `npm run seed` · `npm run build`

## Quality bar
- Deterministic safety first: red flags, escalation and risk thresholds are code/config, never model judgement. LLMs understand, explain, summarise.
- Health: never diagnose, never give doses outside approved protocol text; danger signs → severity 4 → emergency script + human alert.
- Everything saved: inputs, transcripts, translations, answers, risk, escalations, overrides, notifications, drafts, failures — with timestamp, actor, role, language, module, location, confidence, version, audit status.
- No `any`. Keep files focused. Tests for every deterministic rule.
