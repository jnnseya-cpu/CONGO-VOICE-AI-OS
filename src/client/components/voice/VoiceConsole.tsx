"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { InteractionResult, LanguageCode, ModuleType } from "@shared/types";
import { LANGUAGES } from "@shared/types";
import { EMERGENCY_INSTRUCTIONS, FACILITY_UNKNOWN_NOTE, detectRoutingDangerSigns } from "@shared/emergency";
import { useLanguage } from "../shell/LanguageProvider";
import { IconImage, IconMic, IconSpinner, IconStop, IconThumbDown, IconThumbUp, IconVolume, IconX } from "../icons";
import { AnswerPanel } from "./AnswerPanel";

interface Turn {
  id: string;
  question: string;
  hasAudio: boolean;
  images: number;
  result: InteractionResult | null;
  error?: string;
  /**
   * The reviewed emergency instruction, produced on the handset because the
   * request could not be completed. Rendered as guidance, never as an error.
   */
  offlineEmergency?: string;
}

/**
 * What the citizen is told when the request does not complete.
 *
 * It used to be `e.message`, so a caregiver in Kinshasa was shown the string
 * "Failed to fetch" — a browser's internal wording, in English, to somebody who
 * came here specifically to be spoken to in their own language. A citizen is
 * never shown a technical message.
 */
const NETWORK_MESSAGE: Record<LanguageCode, string> = {
  fr: "La connexion n'a pas abouti. Votre message est conservé sur cet appareil : appuyez de nouveau sur Envoyer quand le réseau revient.",
  ln: "Réseau ekoki te. Message na yo ebombami na telefone: fina Envoyer lisusu tango réseau ezongi.",
  kg: "Réseau me sala ve. Nsangu na nge me bumbana na telefone: fina Envoyer diaka ntangu réseau me vutuka.",
  sw: "Mtandao haukufanikiwa. Ujumbe wako umehifadhiwa kwenye simu: bonyeza Envoyer tena mtandao utakaporudi.",
  lua: "Lutanda kaluvua lwenza to. Mukenji webe udi mulame mu telefone: ofina Envoyer kabidi padi lutanda lupingana.",
};

/** Subscribes React to the browser's own online/offline events. */
function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** How long the handset waits before deciding the request will not arrive. */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * One attempt at sending a turn, with a deadline.
 *
 * Module scope on purpose: nothing here reads component state, and keeping the
 * abort controller out of the component body leaves the render path exactly as
 * it was. Without the deadline the spinner turns forever on a connection that
 * has already gone, which is what a citizen on a failing mast actually sees.
 */
async function postInteraction(form: FormData): Promise<InteractionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/v1/interactions", { method: "POST", body: form, signal: controller.signal });
    const json = (await res.json()) as InteractionResult | { error: { message: string } };
    if (!res.ok || "error" in json) throw new Error("error" in json ? json.error.message : "Erreur");
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const BCP47: Record<LanguageCode, string> = { fr: "fr-FR", ln: "fr-FR", kg: "fr-FR", sw: "sw-KE", lua: "fr-FR" };
const MAX_SECONDS = 90;

export function VoiceConsole({ module, accent, examples }: { module: ModuleType; accent: "health" | "agri" | "edu"; examples: string[] }) {
  const { t, lang } = useLanguage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  /**
   * Whether the handset believes it has a connection.
   *
   * useSyncExternalStore rather than an effect that calls setState: the browser
   * already owns this value, React only needs to subscribe to it. The server
   * snapshot is `true` so the markup rendered on the server matches the first
   * client render and nothing flashes an offline banner during hydration.
   */
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const [speaking, setSpeaking] = useState<string | null>(null);
  /**
   * Identifies a turn in this session's list.
   *
   * Was Date.now(), which reads the clock inside the component body and makes
   * two turns submitted in the same millisecond collide. A counter is stable,
   * ordered, and does not depend on anything outside React.
   */
  const turnSeq = useRef(0);
  /**
   * The recorder's callbacks outlive the render that created them.
   *
   * `rec.onstop` and the duration timer are installed once and then fire much
   * later, so they cannot close over `submit` and `stopRecording` directly —
   * those are declared further down and would be read before they exist. Holding
   * the current version in a ref, assigned from an effect, keeps the callbacks
   * pointing at the latest one without reaching forward during render.
   */
  const submitRef = useRef<(opts: { audio?: Blob; question?: string }) => void>(() => undefined);
  const stopRecordingRef = useRef<() => void>(() => undefined);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const draftKey = `console:${module}`;

  const accentCls = { health: "bg-[#166534] hover:bg-[#14532d] ring-[#166534]/25", agri: "bg-[#13682f] hover:bg-[#0f5526] ring-[#13682f]/25", edu: "bg-[#7c3aed] hover:bg-[#6d28d9] ring-[#7c3aed]/25" }[accent];

  // Ensure a session exists (anonymous citizens can start speaking immediately).
  useEffect(() => {
    fetch("/api/v1/auth/me").then(async (r) => {
      if (r.status === 401) await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymous: true, language: lang, consent: true }) });
    }).catch(() => undefined);
    try {
      const draft = localStorage.getItem(draftKey);
      /**
       * Restoring an unsent draft is the one state update that genuinely
       * belongs in an effect. localStorage does not exist while the server
       * renders, so the value cannot be read during render or in a lazy
       * initialiser without producing markup that disagrees with the client's.
       * The alternative the rule suggests — deriving it during render — is not
       * available here.
       *
       * It runs once, on mount, for a citizen who typed something and lost their
       * connection before sending it. Losing that text is the failure this
       * guards against, and it is the failure the screenshots are about.
       */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (draft) setText(draft);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the draft locally (immediately) and server-side (debounced).
  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    if (!text.trim()) return;
    const h = window.setTimeout(() => {
      fetch("/api/v1/autosave", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientKey: draftKey, module, language: lang, payload: { text, images: images.length } }) }).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(h);
  }, [text, images.length, module, lang, draftKey]);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  };

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) submitRef.current({ audio: blob });
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stopRecordingRef.current();
        return s + 1;
      }), 1000);
      // level meter
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) * (v - 128);
        setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicError(t("micDenied"));
    }
    // The dependency list is now complete: submit and stopRecording are reached
    // through refs, so this no longer needs an exhaustive-deps exception.
  }, [t]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    stopMeter();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  async function submit(opts: { audio?: Blob; question?: string }) {
    const question = (opts.question ?? text).trim();
    if (!opts.audio && !question && images.length === 0) return;
    const id = `t${(turnSeq.current += 1)}`;
    const turn: Turn = { id, question: question || (opts.audio ? "🎤" : ""), hasAudio: !!opts.audio, images: images.length, result: null };
    setTurns((tt) => [...tt, turn]);
    setBusy(true);
    setStage(t("processing"));
    const form = new FormData();
    if (question) form.append("text", question);
    form.append("module", module);
    if (opts.audio) form.append("audio", opts.audio, "voice.webm");
    for (const img of images) form.append("images", img, img.name);
    try {
      let json: InteractionResult;
      try {
        json = await postInteraction(form);
      } catch {
        // One retry. A cold start, a lost cell and a handover between masts all
        // look identical from here, and a second attempt rescues most of them.
        setStage(t("processing"));
        await new Promise((r) => setTimeout(r, 1200));
        json = await postInteraction(form);
      }
      setTurns((tt) => tt.map((x) => (x.id === id ? { ...x, result: json } : x)));
      setText("");
      setImages([]);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      speak(json.responseText, json.language, json.audioUrl, id);
    } catch {
      /**
       * The request did not complete. If what the citizen wrote carries a danger
       * sign, the handset answers it.
       *
       * The phrases and the instruction are both constants shipped with the
       * page, so this works with the radio off. It is the whole reason the
       * emergency core was moved to @shared: the likeliest moment for a
       * connection to fail here is also the likeliest moment for it to matter,
       * and "réessayez dans quelques instants" is not an answer to give someone
       * whose child has stopped drinking.
       *
       * The draft is deliberately not cleared, so Envoyer resends it when the
       * network returns and the case is opened for a human then.
       */
      const danger = question ? detectRoutingDangerSigns(question) : [];
      const emergency = danger.length > 0 ? `${EMERGENCY_INSTRUCTIONS[lang]} ${FACILITY_UNKNOWN_NOTE[lang]}`.trim() : undefined;
      setTurns((tt) =>
        tt.map((x) => (x.id === id ? { ...x, error: NETWORK_MESSAGE[lang] ?? NETWORK_MESSAGE.fr, offlineEmergency: emergency } : x)),
      );
      if (emergency) speak(emergency, lang, null, id);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  useEffect(() => {
    submitRef.current = (opts) => void submit(opts);
    stopRecordingRef.current = stopRecording;
  });

  function speak(textToSpeak: string, language: LanguageCode, audioUrl: string | null, id: string) {
    stopSpeaking();
    if (audioUrl) {
      const a = new Audio(audioUrl);
      audioRef.current = a;
      setSpeaking(id);
      a.onended = () => setSpeaking(null);
      a.play().catch(() => setSpeaking(null));
      return;
    }
    if (typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(textToSpeak);
    u.lang = BCP47[language];
    u.rate = 0.92;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(BCP47[language].slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(null);
    setSpeaking(id);
    speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeaking(null);
  }

  async function feedback(interactionId: string, body: Record<string, unknown>) {
    await fetch(`/api/v1/interactions/${interactionId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  }

  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label ?? "Français";

  return (
    <div className="space-y-4" id="parler">
      {!online && <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">{t("offline")}</div>}

      {/* conversation */}
      <div className="space-y-4">
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-[14px] text-white shadow-sm">
                {turn.hasAudio && <span className="mr-2 inline-flex align-middle text-white/80"><IconMic size={16} /></span>}
                {turn.question}
                {turn.images > 0 && <span className="ml-2 text-white/70">· {turn.images} photo(s)</span>}
              </div>
            </div>
            {turn.result ? (
              <AnswerPanel result={turn.result} speaking={speaking === turn.id} onSpeak={() => speak(turn.result!.responseText, turn.result!.language, turn.result!.audioUrl, turn.id)} onStop={stopSpeaking} onFollowUp={(q) => setText(q)} onFeedback={(b) => feedback(turn.result!.interactionId, b)} />
            ) : turn.error ? (
              <div className="space-y-2">
                {/*
                  When the handset recognised a danger sign, the instruction comes
                  first and the connection problem second. Someone whose child has
                  stopped drinking needs to be told to leave now; that the network
                  failed is a detail they can read afterwards.
                */}
                {turn.offlineEmergency ? (
                  <div className="rounded-xl border-2 border-danger bg-danger-soft px-4 py-3">
                    <p className="text-sm font-semibold text-danger">{turn.offlineEmergency}</p>
                    <button
                      type="button"
                      onClick={() => speak(turn.offlineEmergency!, lang, null, turn.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-danger underline"
                    >
                      <IconVolume size={14} /> {t("listen")}
                    </button>
                  </div>
                ) : null}
                <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-muted">{turn.error}</div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted">
                <IconSpinner size={16} /> {stage}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* push-to-talk */}
      <div className="card p-5">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={busy}
            aria-pressed={recording}
            // The single most important control on the platform carried no name
            // at all: a screen reader announced "button" and nothing else.
            aria-label={recording ? t("recording") : busy ? t("processing") : t("holdToSpeak")}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg ring-8 transition disabled:opacity-50 ${recording ? "rec-ring bg-danger ring-danger/20" : accentCls}`}
            style={recording ? { transform: `scale(${1 + level * 0.12})` } : undefined}
          >
            {busy ? <IconSpinner size={34} /> : recording ? <IconStop size={34} /> : <IconMic size={36} />}
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-ink">{recording ? t("recording") : busy ? t("processing") : t("holdToSpeak")}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              {recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / ${MAX_SECONDS / 60}:00` : `${langLabel} · ${t("orType")}`}
            </div>
          </div>
          {micError && <p className="text-sm text-warn">{micError}</p>}
        </div>

        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({});
          }}
        >
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit({});
                }
              }}
              rows={2}
              placeholder={examples[0] ? `Ex. : ${examples[0]}` : ""}
              className="w-full resize-none rounded-xl border border-line-strong px-3 py-2.5 text-[14px] outline-none focus:border-brand-2 focus:ring-4 focus:ring-brand-soft"
            />
          </div>
          <div className="flex gap-2">
            <label className="btn btn-ghost h-11 cursor-pointer" id="envoyer">
              <IconImage size={18} /> <span className="hidden sm:inline">{t("addPhoto")}</span>
              <input type="file" accept="image/*,video/*" multiple capture="environment" className="sr-only" onChange={(e) => setImages((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
            </label>
            <button type="submit" disabled={busy || (!text.trim() && images.length === 0)} className="btn btn-primary h-11 min-w-[110px]">
              {t("send")}
            </button>
          </div>
        </form>
        {images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs">
                {img.name.slice(0, 24)}
                <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} aria-label="Retirer" className="text-muted hover:text-danger">
                  <IconX size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        {turns.length === 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="chip border-line bg-surface-2 text-ink-2 hover:bg-brand-soft hover:text-brand">
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-muted">
        <IconVolume size={14} />
        {t("privacyNote")}
        <Link href="/cas/nouveau?humain=1" className="link ml-auto whitespace-nowrap">
          {t("talkToHuman")}
        </Link>
      </div>
      <span className="sr-only">
        <IconThumbUp size={1} />
        <IconThumbDown size={1} />
      </span>
    </div>
  );
}
