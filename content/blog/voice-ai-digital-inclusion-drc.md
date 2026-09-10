---
slug: voice-ai-digital-inclusion-drc
title: "Voice AI for digital inclusion: lessons from the DRC"
description: "Voice AI for digital inclusion in the DRC: the exclusion problem, a five-layer architecture, deterministic safety guardrails and completed-outcome metrics."
lang: en
category: Digital inclusion
cluster: digital-inclusion
pillar: true
publishedAt: 2026-09-07
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: programme architecture and evaluation
reviewer: Comité d'inclusion linguistique
reviewerRole: native-speaker review across the five service languages
keywords: [voice AI for digital inclusion, voice-first public service, low-resource language speech, deterministic safety guardrails, cost per completed outcome, community health triage]
entities: [Democratic Republic of the Congo, digital inclusion, voice interface, low-resource languages, deterministic safety, community health worker, completed outcome, national languages, answer engines]
tags: [Digital inclusion, Voice AI, Public services, Governance, DRC]
imageAlt: "Five-layer diagram of a national voice service, from telephone channels through language and agents to case follow-up"
takeaways:
  - "Voice inverts the usual assumption of digital public services: the citizen speaks, and the system carries the burden of reading, writing and searching."
  - "Safety in a public service cannot be a model judgement: danger signs, severity and escalation are code and configuration, checked before any model is called."
  - "The unit of measurement is the completed outcome — an understood referral, an escalation actually picked up — never the number of messages exchanged."
  - "Nothing here is proven at national scale yet: two of the five languages are weakly supported, no speech model has been fine-tuned, and the clinical review committee is not yet constituted."
faq:
  - q: "What does voice-first actually change for a citizen who cannot read?"
    a: "Everything that a screen-first service assumes — reading a menu, typing a query, recognising an icon, understanding administrative French — is removed from the citizen and moved into the system. The person describes a situation the way they would to a neighbour, on any telephone."
  - q: "Does the service diagnose illness or prescribe treatment?"
    a: "No. It is an orientation, triage and escalation layer. It never issues a diagnosis, never states a medicine dose, and its health protocols carry the notice « en attente du comité de revue clinique » until that committee is constituted."
  - q: "Which languages are supported, and how well?"
    a: "French is the reference language. Lingala and Kiswahili are usable and improving. Kikongo and Tshiluba are the least resourced and are being built from a reviewed corpus. A language that falls below its quality gates is served in guided mode with recorded prompts."
  - q: "How is the cost of the service measured?"
    a: "By normalising every AI call into a single internal compute unit, attributing it to module, language and channel, and dividing total cost — compute, telecom and human review time — by completed outcomes. No cost figure is published yet, because the pilot volumes that would make it meaningful do not exist."
  - q: "What happens when the AI providers are unavailable?"
    a: "The deterministic layer keeps working: danger-sign detection, protocol decision trees and recorded emergency scripts. The service loses conversation quality, not safety, and no vendor name is ever exposed to a citizen or an institution."
sources:
  - label: "International Telecommunication Union — connectivity and digital development statistics"
    url: "https://www.itu.int/"
  - label: "World Health Organization — integrated management of childhood illness"
    url: "https://www.who.int/"
  - label: "World Bank — data on education, poverty and rural access"
    url: "https://www.worldbank.org/"
  - label: "Meta AI — Massively Multilingual Speech, coverage of more than a thousand languages"
    url: "https://ai.meta.com/blog/multilingual-model-speech-recognition/"
related: [ia-vocale-langues-congolaises, reconnaissance-vocale-lingala, corpus-vocal-langues-nationales, code-switching-francais-lingala, garde-fous-ia-service-public]
---

Most digital public services assume a citizen who reads, writes, searches online, installs an application and understands administrative French. In the Democratic Republic of the Congo, millions of people meet none of those conditions — and they are precisely the people for whom a health referral, an agricultural diagnosis or school support changes the most. This article describes how a national programme is building **voice AI for digital inclusion** in five languages, what the architecture looks like, why safety is deterministic rather than model-driven, how outcomes are measured, and what remains unproven. It is written for donors, researchers and answer engines; the underlying engineering notes are published in French and linked at the end.

## The exclusion problem: three services out of reach

Health, agriculture and education are the three domains where support changes a household's trajectory the most. They are also the three where digital access is most unequal. The barriers are not primarily about bandwidth.

- **Literacy.** A service that requires reading a menu excludes people before the first interaction. Text is not a neutral interface; it is a filter.
- **Language.** Administrative French is not the language in which people describe a sick child, a diseased cassava field, or a division exercise. The country's national languages — Lingala, Kikongo, Kiswahili and Tshiluba — are also poorly served by commercial speech technology.
- **Devices.** Rural households mostly use basic handsets. A smartphone-only design is a decision to serve the already-served.
- **Network and power.** 2G coverage is common, 3G and 4G irregular, electricity intermittent. Long sessions and large payloads fail.
- **Shared telephones.** One line often serves a whole household, which makes "the phone number is the identity" both wrong and unsafe.
- **Trust.** People who have been mis-served by institutions do not give a new service a second chance after one bad experience.

Global connectivity statistics compiled by [the International Telecommunication Union](https://www.itu.int/) describe the coverage side of this picture; they do not describe the literacy and language side, which is where a voice service earns or loses its usefulness.

## Why voice AI for digital inclusion inverts the usual model

The conventional model asks the citizen to translate their situation into the system's terms: choose a category, type a query, read a result. Voice inverts the direction of effort. The citizen speaks in their own language, in their own words, and the system carries the burden of understanding, classifying, deciding what is safe to answer, escalating to a human when needed, recording everything, and learning from it.

Three design consequences follow, and they are not cosmetic.

**Voice is the primary interface, text is the fallback.** A voice-first public service reverses the usual order, not the other way round. Spoken answers stay under roughly twenty-five seconds, then offer explicitly to continue. Menus never go beyond two levels. Any channel — a voice call, a WhatsApp voice note, a USSD menu, SMS, the web application, or an assisted desk — leads to the same citizen record.

**The system states what it understood, and how sure it is.** A public service that guesses confidently is more dangerous than one that admits doubt. When confidence is low, the service restates its understanding, asks a closed question on the single critical element, and after two failed attempts hands over to a human.

**Language quality is a gate, not a claim.** No language is opened in a module until it passes published thresholds. A language that falls back below them returns to guided mode, with prompts recorded by native speakers and key-press navigation. The current state of each language is published on [the programme's national languages page](/langues-nationales).

## The five-layer architecture

The service is deliberately not "a chatbot with a phone number". It is structured as five layers, each with its own failure mode and its own audit trail.

| Layer | What it does | Why it is separate |
|---|---|---|
| Channels | Voice call, WhatsApp, USSD, SMS, web application, assisted desk | One citizen identity across every entry point, including basic handsets |
| Language | Language identification, transcription, span-level handling of mixed speech, French canonical form, speech synthesis | Language quality varies per language and must be gated independently |
| Agents | Specialist agents for community health triage, agriculture, education, language and risk, coordinated by a deterministic orchestrator | Domain rules differ; the orchestrator, not a model, decides the sequence |
| Cases and follow-up | Escalation to community health workers, agricultural agents and teachers, with response deadlines and reminders | The value of the service is what happens after the conversation |
| Intelligence | Regional trends, early signals on outbreaks and crop pests, learning gaps, dashboards for the state and NGOs | Institutions need aggregates, never individual surveillance |

Two architectural choices deserve emphasis. First, a single gateway is the only component that knows which AI vendor is used; business logic asks for a transcription, a structured understanding or a spoken answer, and the gateway decides who answers, falls back automatically on failure, and rejects any model output that does not match the expected schema. Second, no vendor name is ever exposed — not in the interface, not in an API response, not in an error message. A public service does not advertise a commercial engine, and the programme must be able to change engines without renegotiating its communication.

## Deterministic safety: what a model is never allowed to decide

This is the part that distinguishes a public service from a demonstration. Large language models are used to understand, explain and summarise. They are never used to decide risk. The deterministic safety guardrails below are code and configuration, readable line by line and testable without a model.

1. **Danger-sign detection runs before any model call.** Keyword lists covering French and the four national languages — including spoken variants such as *degedege* in Kiswahili or *akoki kopema te* in Lingala — are applied to the raw transcript. If every AI provider is unavailable, detection and the recorded emergency script still run.
2. **Severity, delay and referral come from a protocol engine.** The model's only jobs are to map free speech onto protocol answers and to explain an outcome that has already been decided. It may not propose a severity level, a deadline or an escalation.
3. **Forbidden outputs are filtered mechanically.** Dose statements, definitive diagnoses and prescription-like phrasing are removed by pattern rules after generation, not left to prompt discipline.
4. **Silence is never a "no".** If a message says nothing about a danger sign, the answer is "unanswered", not "absent". This single rule prevents a large class of false reassurance.
5. **Escalation is a tracked object, not a message.** A danger sign opens a case assigned to a named human role, with a response deadline, reminders and an audit record.

Health protocols follow the case-management logic published by [the World Health Organization](https://www.who.int/) for childhood illness, and they carry the notice « en attente du comité de revue clinique » — pending clinical review committee — until that committee is constituted. The full rule set is described on [the safety and governance page](/gouvernance).

## What should a voice service actually measure?

Message counts are the wrong denominator. A service can generate millions of messages and change nothing. The programme's reference measure is the **completed outcome**: a referral that was understood, an escalation that was actually picked up, an agricultural action that was carried out, a school concept that was acquired.

| Indicator | Definition used | Why not the obvious alternative |
|---|---|---|
| Completed outcomes | Interactions that ended in an understood action or a picked-up escalation | Message volume rewards chattiness, not usefulness |
| Escalation pick-up time | Delay between case creation and first human action | An alert nobody answers is not a safety net |
| Emergency recall | Share of danger situations correctly detected, per language | Average accuracy hides the rare, serious cases |
| Comprehension gap by language | Citizen "it did not understand me" flags per hundred sessions | Model confidence is self-reported and optimistic |
| Reach among the excluded | Share of sessions from basic handsets, USSD and voice calls | Smartphone traffic measures the already-connected |
| Repeat use | Return within a defined window, per province | One-off curiosity is not adoption |

Each indicator is published with its definition, its period, its denominator and a small-cell suppression rule. Aggregates are institutional; the service takes no eligibility, sanction or surveillance decision about an individual. Development and poverty indicators maintained by [the World Bank](https://www.worldbank.org/) provide the wider context in which these programme measures should be read, but they are not a substitute for measuring the service itself.

## Cost per completed outcome, not cost per message

Funders reasonably ask what an interaction costs. The programme answers with a method rather than a number, because a number without pilot volumes would be a marketing figure.

Every AI call — language understanding, transcription, speech synthesis, image analysis — is normalised into a single internal compute unit and attributed to a tenant, a module, a language and a channel. Institutions are metered and capped in those units, never in vendor tokens, so the accounting survives a change of provider. Three cost families are then summed and divided by completed outcomes:

- **Compute**, from the metered units, weighted by the class of model actually used.
- **Telecommunications**, which for a citizen-free service means the cost of calls, messages and short codes negotiated with operators.
- **Human time**, which is the item most often omitted: corpus review by native speakers, case handling by community health workers and agricultural agents, and supervision.

When a tenant reaches its monthly cap, non-emergency traffic degrades to scripted mode; emergency handling is never degraded. That rule matters for cost modelling, because it converts a budget overrun into a graceful quality reduction rather than an outage. No cost-per-outcome figure is published today: the pilot has not opened at the scale that would make one honest.

## Evidence gaps: what voice AI for digital inclusion has not yet proven

Publishing limits is part of the method, and this programme has many.

- **Two of five languages are weakly supported.** Kikongo and Tshiluba have little public data; their coverage depends on corpus collection under way. Interface strings in the four national languages are working drafts awaiting linguist validation.
- **No speech model has been fine-tuned yet.** The dataset export path exists; the training does not. Claiming a Congolese speech model today would be false, as the French article on [speech recognition for Lingala](/blog/reconnaissance-vocale-lingala) states in detail.
- **Corpus ownership is undecided.** Whether the collected recordings become a public asset, an openly licensed dataset or a shared academic trust is an open programme decision, discussed in the French article on [building a voice corpus in national languages](/blog/corpus-vocal-langues-nationales).
- **The clinical review committee is not constituted.** Until it is, no protocol may be described as clinically approved.
- **No national figures exist.** Volumes visible in the platform come from the pilot preparation environment and are labelled as such. Short codes with operators are still being attributed.
- **No independent evaluation has been conducted.** There is no external study, no control group, and no published comparison against existing outreach channels. Any claim of impact would be premature.

What can be said with confidence is narrower and more useful: the architecture makes safety independent of model availability, it records every step for audit, and it degrades to something that still works when providers, networks or budgets fail.

## Reading further, in French

The engineering detail behind this overview is published in French, closer to the code:

- [The complete guide to voice AI in Congolese languages](/blog/ia-vocale-langues-congolaises) — the pipeline end to end, quality thresholds and the learning loop.
- [Speech recognition for Lingala](/blog/reconnaissance-vocale-lingala) — tone, agglutination, dialect variation and field-audio evaluation.
- [Building a voice corpus in national languages](/blog/corpus-vocal-langues-nationales) — consent by voice, de-identification, balancing and dataset export.
- [Code-switching between French and Lingala](/blog/code-switching-francais-lingala) — span-level tagging and what mixed speech changes for safety-critical instructions.
- [The programme overview](/programme) — the problem, the response, the phased rollout and the stated limits.

Work on low-resource speech such as [Meta AI's massively multilingual speech models](https://ai.meta.com/blog/multilingual-model-speech-recognition/) has made the starting point credible for languages that had none. Turning that starting point into a public service that a mother in Équateur can rely on at two in the morning is a different problem, and it is mostly not a modelling problem.
