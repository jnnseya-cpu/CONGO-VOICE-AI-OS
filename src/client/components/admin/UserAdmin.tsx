"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, PROVINCES } from "@shared/types";
import { FieldLabel, Notice, ROLE_FR, filterSelectClass, inputClass, selectClass } from "../dashboard/Common";

const ROLES = ["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"];

export function RoleFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const role = params.get("role") ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <select
        aria-label="Rôle"
        className={`${filterSelectClass} min-w-[220px]`}
        value={role}
        onChange={(e) => router.push(e.target.value ? `${pathname}?role=${e.target.value}` : pathname)}
      >
        <option value="">Tous les rôles</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_FR[r] ?? r}
          </option>
        ))}
      </select>
      {role && (
        <button type="button" className="text-[13px] font-semibold text-muted hover:text-ink" onClick={() => router.push(pathname)}>
          Réinitialiser
        </button>
      )}
    </div>
  );
}

export function CreateUserForm({ defaultProvince }: { defaultProvince: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState("+243");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("chw");
  const [language, setLanguage] = useState("fr");
  const [province, setProvince] = useState(defaultProvince ?? "");
  const [territory, setTerritory] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          pin: pin.trim(),
          name: name.trim() || undefined,
          role,
          language,
          province: province || undefined,
          territory: territory.trim() || undefined,
          organisation: organisation.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de la création (${res.status}).`);
      setDone(`Compte créé pour ${phone.trim()}.`);
      setPhone("+243");
      setPin("");
      setName("");
      setTerritory("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="health">{done}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="us-phone">Téléphone</FieldLabel>
          <input id="us-phone" className={inputClass} required minLength={6} maxLength={32} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+243900000000" />
        </div>
        <div>
          <FieldLabel htmlFor="us-pin">Code PIN provisoire</FieldLabel>
          <input id="us-pin" className={inputClass} required minLength={4} maxLength={12} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4 à 12 chiffres" />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="us-name">Nom</FieldLabel>
        <input id="us-name" className={inputClass} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom et prénom de l'agent" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="us-role">Rôle</FieldLabel>
          <select id="us-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_FR[r] ?? r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="us-lang">Langue</FieldLabel>
          <select id="us-lang" className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="us-province">Province</FieldLabel>
          <select id="us-province" className={selectClass} value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Non renseignée</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="us-territory">Territoire</FieldLabel>
          <input id="us-territory" className={inputClass} maxLength={120} value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Ex. Kimbanseke" />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="us-org">Organisation</FieldLabel>
        <input id="us-org" className={inputClass} maxLength={160} value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="Zone de santé, ONG, inspection agricole…" />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy || phone.trim().length < 6 || pin.trim().length < 4}>
        {busy ? "Création…" : "Créer le compte"}
      </button>
      <p className="text-[11.5px] leading-snug text-muted">Le PIN provisoire doit être communiqué de vive voix à l&apos;agent, jamais par SMS.</p>
    </form>
  );
}
