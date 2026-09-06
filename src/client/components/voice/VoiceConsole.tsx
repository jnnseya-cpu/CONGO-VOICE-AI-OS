"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InteractionResult, LanguageCode, ModuleType } from "@shared/types";
import { LANGUAGES } from "@shared/types";
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
  const [online, setOnline] = useState(true);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const draftKey = `console:${module}`;

  const accentCls = { health: "bg-[#166534] hover:bg-[#14532d] ring-[#166534]/25", agri: "bg-[#16a34a] hover:bg-[#15803d] ring-[#16a34a]/25", edu: "bg-[#7c3aed] hover:bg-[#6d28d9] ring-[#7c3aed]/25" }[accent];

  // Ensure a session exists (anonymous citizens can start speaking immediately).
  useEffect(() => {
    fetch("/api/v1/auth/me").then(async (r) => {
      if (r.status === 401) await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymous: true, language: lang, consent: true }) });
    }).catch(() => undefined);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft) setText(draft);
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
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
        if (blob.size > 0) void submit({ audio: blob });
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stopRecording();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const id = `${Date.now()}`;
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
      const res = await fetch("/api/v1/interactions", { method: "POST", body: form });
      const json = (await res.json()) as InteractionResult | { error: { message: string } };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error.message : "Erreur");
      setTurns((tt) => tt.map((x) => (x.id === id ? { ...x, result: json } : x)));
      setText("");
      setImages([]);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      speak(json.responseText, json.language, json.audioUrl, id);
    } catch (e) {
      setTurns((tt) => tt.map((x) => (x.id === id ? { ...x, error: e instanceof Error ? e.message : "Erreur" } : x)));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

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
              <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{turn.error}</div>
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
