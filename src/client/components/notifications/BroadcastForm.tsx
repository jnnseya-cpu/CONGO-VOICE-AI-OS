"use client";
import { useState } from "react";
import { PROVINCES } from "@shared/types";
import { FieldLabel, Notice, inputClass, selectClass, textareaClass } from "../dashboard/Common";

const ROLES = [
  { value: "citizen", label: "Citoyens" },
  { value: "chw", label: "Agents de santé communautaires" },
  { value: "agri_officer", label: "Agents agricoles" },
  { value: "teacher", label: "Enseignants" },
  { value: "ngo", label: "Partenaires ONG" },
  { value: "gov_admin", label: "Administrations" },
  { value: "platform_admin", label: "Administrateurs plateforme" },
];

const CHANNELS = [
  { value: "in_app", label: "Application (notification interne)" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
];

export function BroadcastForm() {
  const [role, setRole] = useState("chw");
  const [province, setProvince] = useState("");
  const [channel, setChannel] = useState("in_app");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch("/api/v1/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, province: province || undefined, channel, title: title.trim(), body: body.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as { recipients?: number; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de la diffusion (${res.status}).`);
      setSent(payload?.recipients ?? 0);
      setTitle("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la diffusion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {sent !== null && (
        <Notice tone="health">
          Message diffusé à <strong>{sent}</strong> destinataire(s).
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="bc-role">Destinataires</FieldLabel>
          <select id="bc-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="bc-province">Province</FieldLabel>
          <select id="bc-province" className={selectClass} value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Toutes les provinces</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="bc-channel">Canal</FieldLabel>
        <select id="bc-channel" className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel htmlFor="bc-title">Titre</FieldLabel>
        <input id="bc-title" className={inputClass} required minLength={2} maxLength={240} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Campagne de vaccination — Kimbanseke, du 12 au 18" />
      </div>

      <div>
        <FieldLabel htmlFor="bc-body">Message</FieldLabel>
        <textarea id="bc-body" className={textareaClass} rows={6} required minLength={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Texte lisible sur un écran verrouillé, sans donnée personnelle." />
        <p className="mt-1 text-[11.5px] text-muted">{body.length}/2000 caractères. N&apos;incluez jamais de nom, de numéro ni de détail médical.</p>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy || title.trim().length < 2 || body.trim().length < 2}>
        {busy ? "Diffusion…" : "Diffuser le message"}
      </button>
    </form>
  );
}
