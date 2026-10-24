# Novice walkthrough

A first-time user on a mid-range Android phone: 360 × 780 viewport, slow 3G
(400 ms latency, 400 kbps), four-times CPU throttling, French-Congolese locale,
no instructions, no help, and a 30-second patience budget. Run with
`node launch-audit/probe-novice.mjs <url>`; screenshots in
`launch-audit/evidence/novice-*.png`.

## What they see first

Landing page painted in **2.5 s**. Above the fold, in French: the product name,
the promise sentence, "Bienvenue sur CONGO VOICE AI OS", "Parlez. Nous écoutons.
Nous comprenons. Nous agissons.", and two large actions —
**"Parler maintenant / Cliquez pour parler" (207 × 58 px)** and **"Envoyer un
fichier — Image, audio ou vidéo" (209 × 58 px)**. No sideways scrolling. Every
action is at or above the 44 px touch guidance; the one exception is the brand
link at 175 × 34, which is the logo rather than an action.

Before this cycle the first line under the product name was
**"Your Voice. Our Intelligence. Stronger Congo."** — English, to every one of
the five language audiences. That is defect **D-03**, now fixed: the first
sentence is the localised promise.

## Reaching the thing they came for

Tapping the primary action lands on the health console in **0.65–1.3 s**. The
console offers a visible text box, an **Envoyer** button, and four tappable
example questions — including one in Swahili and one in Lingala — so a person who
will not type at all still has a way in. Asking "Mon enfant a de la fièvre depuis
deux jours et il tousse" returned actionable guidance in **0.2–0.5 s**.

**Time to the core value: under five seconds** on a throttled phone, against the
ten-minute bar. Measured in parts (landing → console → answer) because one
assertion in the probe selects an off-canvas element rather than the visible text
box; the journey itself was confirmed twice by direct browser checks, throttled
and unthrottled, clicking the real call to action.

## Words a novice has to read

- No jargon in the answer: none of *tenant, workspace, token, webhook, sync,
  payload, endpoint, ACU, p95* appears.
- The emergency page opens with the instruction, not with an explanation:
  "En cas de danger, allez au centre de santé le plus proche maintenant", and
  immediately says what the service is not — "Ce n'est pas un service d'urgence
  et il ne remplace pas…".
- Switching language from the home page changes the page: "Loba. Tozali koyoka.
  Tozali kososola. Tozali kosala." The choice is kept in a cookie for a year, so
  a visitor who comes back tomorrow does not choose again.
- Sign-in asks for a **phone number and a PIN** — things a citizen has — not an
  email and a password. There is a "forgotten code" control that reveals what to
  do, and the help text is honest about it: the recovery is a human checking who
  you are, not a secret.

## Where a novice is still at risk

| Observation | Why it matters | Status |
|---|---|---|
| The home page at 360 px renders the full application navigation inline (Accueil, Santé, Agriculture, Éducation, Messages, Ressources) above the hero | Six list items before the primary action is a lot of screen for someone who came to ask one question. The primary action is still visible without scrolling, so this is a judgement call rather than a defect | OPEN — product decision |
| The brand link is 175 × 34 px | Under the 44 px guidance; it is the logo, and no action is affected | OPEN — P4 |
| Microphone permission | The voice path needs a browser permission a novice may refuse or a handset may block. The typed path and the example questions mean a refusal is not a dead end, which is the important part | MITIGATED by design |
| Reading the answer aloud | Synthesis quality in four of the five languages is unmeasured, so a person who cannot read is served by a voice nobody has assessed | OPEN — organisational blocker, `LAUNCH_READINESS.md` §2.2–2.3 |

## Errors seen during the walk

**None.** Before this cycle the walk produced a 401 in the console — every
visitor who chose a language triggered a profile write that could only fail
(defect **D-04**, fixed). The walk is now clean from first paint to sign-in.
