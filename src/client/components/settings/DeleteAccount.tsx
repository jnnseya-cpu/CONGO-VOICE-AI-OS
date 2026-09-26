"use client";

import { useState } from "react";
import { FieldLabel, Notice, inputClass } from "@client/components/dashboard/Common";
import { IconAlert, IconSpinner } from "@client/components/icons";

/**
 * Leaving the platform.
 *
 * Deliberately not a one-tap button. Erasure cannot be undone, and the
 * realistic threat to an irreversible control is not a determined attacker but
 * a phone left unlocked on a table — so it asks for the PIN, which only the
 * owner knows, and for a word to be typed, which only somebody who has read the
 * consequences will do.
 *
 * It also says plainly what survives. A citizen told "everything is deleted"
 * and later shown an audit entry has been misled; the audit chain does survive,
 * carries no personal text, and exists so that what the programme did to them
 * stays provable after they are gone.
 */
export function DeleteAccount({ isLastAdmin }: { isLastAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirm }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok || json.error) throw new Error(json.error?.message ?? "Suppression impossible.");
      // A full load, not a router push. The account no longer exists and the
      // session cookie has been cleared by the response; a soft navigation
      // keeps the React tree, its caches and any rendered personal data alive
      // in the tab of somebody who just asked to be forgotten.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/?compte=supprime";
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Suppression impossible.");
      setBusy(false);
    }
  }

  return (
    <section className="card border-danger/30 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-danger">
        <IconAlert size={18} /> Supprimer mon compte
      </h2>

      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
        Vos enregistrements vocaux, vos photos et le texte de vos échanges sont effacés. Votre identité est remplacée par
        un identifiant sans retour possible. Le journal d&apos;audit, qui ne contient aucun texte personnel, conserve la
        trace de ce que le programme a fait — c&apos;est ce qui rend vos droits vérifiables après votre départ.
      </p>

      {isLastAdmin ? (
        <div className="mt-3">
          <Notice tone="warn">
            Vous êtes le seul administrateur de la plateforme. Nommez un autre administrateur avant de pouvoir supprimer
            ce compte : sans vous, plus personne ne pourrait créer de comptes.
          </Notice>
        </div>
      ) : !open ? (
        <button type="button" className="btn mt-4 bg-danger text-white hover:opacity-90" onClick={() => setOpen(true)}>
          Supprimer définitivement mon compte
        </button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <FieldLabel htmlFor="delete-pin">Votre code PIN</FieldLabel>
            <input
              id="delete-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className={inputClass}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="delete-confirm">
              Tapez SUPPRIMER pour confirmer
            </FieldLabel>
            <input
              id="delete-confirm"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoCapitalize="characters"
              required
            />
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn bg-danger text-white hover:opacity-90 disabled:opacity-50" disabled={busy || confirm !== "SUPPRIMER"}>
              {busy && <IconSpinner size={14} />}
              <span className={busy ? "ml-1.5" : ""}>Supprimer définitivement</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
