# CONGO VOICE AI OS — Requirement brief (preserved)

This file preserves, verbatim in intent, the founding brief for the platform so that every
item remains traceable to the implementation. The two engineering PRDs (PRD-CVOS-v1.0 and the
Developer-Ready Technical Specification v1.0) refine it; the master specification in
`docs/MASTER_SPECIFICATION.md` consolidates all three with the implementation map.

## Identity and positioning
- **Name:** CONGO VOICE AI OS — Plateforme Nationale d'Inclusion Numérique Vocale en Santé, Agriculture et Éducation.
- **Nature:** a national AI voice infrastructure, not a chatbot, not an information website, not a simple voice assistant. It listens, understands, classifies, guides, escalates, records, learns, predicts and supports public-service delivery at scale.
- **Languages:** French, Lingala, Kikongo, Swahili, Tshiluba — voice in/out, text in/out, translation, detection, mixed-language handling, local phrasing, simple explanations, formal and informal tones. The system never assumes standard French.
- **Funding logic:** digital inclusion through voice AI for populations excluded by language, literacy, connectivity or digital skills. The service is free for citizens and funded by government and NGOs.
- **Founding sentence:** *Le projet ne demande pas simplement un financement pour développer une application ; il propose une infrastructure nationale d'inclusion numérique capable de connecter les citoyens ruraux aux services essentiels de santé, d'agriculture et d'éducation par la voix, dans les langues nationales congolaises.*

## Core loop
The citizen speaks → the system detects the language → transcribes → understands intent → asks follow-up questions if needed → gives a practical answer → saves the interaction → escalates if required → sends reminders or follow-ups.

## Modules
1. **AI Rural Health OS** — symptoms, malaria signs, fever, pregnancy, child illness, diarrhoea, vaccination reminders, nutrition, maternal health, emergency warning signs, medication guidance, clinic referral. Structured follow-up questions, emergency detection, severity classification, safe non-diagnostic guidance, clinic recommendation, high-risk escalation, interaction summaries, anonymised trends, support for CHWs, nurses, NGOs and public health teams. **Never pretends to replace a doctor.**
2. **AI Agriculture OS** — crop disease, pests, soil, seeds, fertiliser, livestock, planting calendars, harvest timing, weather, storage, market prices, buyer opportunities; voice notes, photos (crops, leaves, soil, livestock) and short videos; likely-issue identification, missing-context questions, next farm action, urgent disease flags, low-cost interventions, recurring issues by region, risk patterns, market and productivity intelligence.
3. **AI Education Voice OS (StudYear Rural)** — homework explanation, reading, maths, exam preparation, lesson summaries, study planning, revision questions, career guidance, parent guidance, teacher support; simple explanations, French ↔ national language translation, age-adapted level, quizzes, step-by-step guidance, learning-difficulty tracking, study actions, low-literacy households.

## Users
Citizen / rural user · Community Health Worker · Agricultural Extension Officer · Teacher / Education Officer · NGO / Development Partner · Government Administrator · Platform Admin.

## Platform-wide AI requirements
Voice understanding, transcription, translation, classification, summarisation, recommendation, risk scoring, next action, escalation, notification, reporting, learning loop, analytics, audit trail, confidence score. Every answer states: what the user is asking · what the system understands · what risk exists · what action is recommended · whether escalation is required · confidence level · saved interaction summary.

## Agents
Language · Health · Agriculture · Education · Risk · Workflow · Reporting · Personalisation, coordinated by a central orchestrator.

## Autosave (mandatory)
Voice inputs, transcriptions, translations, AI responses, user selections, uploads, case status, risk scores, recommendations, human overrides, escalations, notifications, reports, drafts, comments, changes, failed attempts, abandoned sessions, audit logs — each with timestamp, user ID, role, language, module, location, original input, AI interpretation, output, confidence, version history and audit status.

## Data model, dashboards, UX, security, safety, architecture, APIs, notifications, reporting, MVP scope, phases, success metrics and final product standard
Carried in full into `docs/MASTER_SPECIFICATION.md` (sections 9–21 of the brief) with the requirement → implementation map.
