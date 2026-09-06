# CONGO VOICE AI OS

**Plateforme Nationale d'Inclusion Numérique Vocale en Santé, Agriculture et Éducation — République Démocratique du Congo.**

A national, voice-first AI infrastructure that lets rural and peri-urban Congolese citizens obtain health guidance, agricultural advice and educational support by speaking naturally in **French, Lingala, Kikongo, Swahili or Tshiluba** — from any phone, without reading, writing, apps or data literacy. Free for citizens; funded by government and NGOs.

It is not a chatbot. It is an operating system with five layers: **channels** (IVR, WhatsApp, USSD/SMS, PWA, assisted console) → **language** (detection, speech-to-text, translation, simplification, text-to-speech, continuous learning from conversations) → **agents** (Language, Health, Agriculture, Education, Risk, Workflow, Reporting, Personalisation, orchestrated deterministically) → **cases & workflow** (escalation to community health workers, extension officers and teachers, SLAs, follow-ups) → **intelligence** (regional trends, outbreak/pest early warning, learning gaps, government and NGO dashboards, ACU cost metering).

## Quick start

```bash
npm install
npm run seed        # demo accounts + 90 multilingual interactions through the real pipeline
npm run dev         # http://localhost:3000
```

No API key is required: the platform runs fully offline with a rules-based provider. Add any of `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_TTS_API_KEY` to `.env` (see `.env.example`) and the AI gateway routes across Claude, Gemini and OpenAI with automatic failover.

Demo accounts (PIN `1234`): `+243900000001` platform admin · `+243900000002` government · `+243900000003` community health worker · `+243900000004` extension officer · `+243900000005` teacher · `+243900000006` NGO. Citizens use **Continuer sans compte**.

```bash
npm run typecheck && npm run lint && npm test   # quality gates (all offline)
npm run build && npm start                       # production build
npm run workflow:run                             # reminders, SLA sweep, blocked cases (cron entry point)
```

## Repository layout

```
src/app/(public)/     Public programme site: programme, services, access, emergency, FAQ, languages,
                      governance, funding, partners, privacy, accessibility, terms, contact
src/app/(app)/        The operating system itself: home, voice consoles, dashboards, workspaces
src/app/api/          Backend entry points: /api/v1 routes and the channel webhooks
src/client/           Frontend components: public site, shell, home, voice console, dashboards
src/shared/           Shared contracts: types, i18n dictionaries (5 languages), formatters, site identity
src/server/            Backend: data, core services, AI, channels, reports
  db/                 Drizzle schema (single source of truth), embedded PGlite / PostgreSQL client, seed, reference data
  core/               auth, RBAC, API handler, audit chain, events, notifications, scheduler, metering, storage, privacy
  ai/                 gateway (Claude · Gemini · OpenAI · Google TTS · offline mock), agents, protocols, knowledge base, safety
  channels/           IVR (Twilio), WhatsApp Cloud API, USSD/SMS (Africa's Talking), sessions, offline sync
  reports/            PDF / XLSX / CSV report engine
content/kb/           Approved knowledge documents (health, agriculture, education) with front matter and citations
drizzle/              Generated SQL migration
docs/                 Master specification, architecture, API, deployment, languages, requirement brief
tests/                Vitest suites (protocol coverage, red-flag recall, workflow, channels, metering, learning loop…)
```

## Public site

The programme has a public, indexable surface separate from the operating system: `/programme` (front door for ministries, donors and press), `/services`, `/acces` (how to reach the service by call, WhatsApp, USSD, SMS or web), `/urgence` (danger signs and what to do, in all five languages), `/aide`, `/langues-nationales`, `/gouvernance`, `/financement`, `/partenaires`, `/confidentialite`, `/accessibilite`, `/conditions` and `/contact`. Set `NEXT_PUBLIC_SITE_URL` so canonical links, the sitemap and the social preview point at the real domain. Public identity, access channels and contact routes live in one file, `src/shared/site.ts`.

## Documentation
- `docs/MASTER_SPECIFICATION.md` — the complete developer-ready specification (vision, users, command centres, agents, modules, data model, APIs, security, funding model, roadmap) with the requirement → implementation map.
- `docs/ARCHITECTURE.md` — how a citizen turn flows through the system; provider routing; degraded modes.
- `docs/API.md` — endpoint reference for `/api/v1` and the channel webhooks.
- `docs/DEPLOYMENT.md` — Google Cloud / any Node host, PostgreSQL, storage, telephony and WhatsApp configuration.
- `docs/LANGUAGES.md` — language coverage, learning loop, quality gates.
- `docs/PROJECT_REQUIREMENTS.md` — the founding brief, preserved.

## Product standard
The platform must feel like a national digital-inclusion infrastructure, a voice-first public-service operating system, a live intelligence layer for rural Congo, a decision engine for government, NGOs and communities, and a practical tool for citizens usually excluded from digital systems. Deterministic safety and human accountability govern the AI: red flags, escalation and risk thresholds are code and configuration; models understand, explain and summarise.
