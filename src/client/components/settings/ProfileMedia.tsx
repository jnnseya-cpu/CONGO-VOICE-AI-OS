"use client";

import { useRef, useState } from "react";
import { IconImage, IconSpinner, IconUsers } from "@client/components/icons";

/**
 * The profile photograph and the cover image.
 *
 * Both are uploaded to /api/v1/me/photo and read back through /api/v1/files,
 * which serves them only to their owner or to staff who may read cases — a
 * photograph of a citizen is personal data and is never on a public URL.
 *
 * The cover is decorative and the avatar is not: an agent who appears in a
 * citizen's case timeline is more trusted when they have a face. So the avatar
 * carries the alternative text and the cover is hidden from assistive
 * technology, rather than both being announced as "image".
 */
export function ProfileMedia({
  name,
  categoryLabel,
  roleLabel,
  avatarFileId,
  coverFileId,
}: {
  name: string;
  categoryLabel: string;
  roleLabel: string;
  avatarFileId: string | null;
  coverFileId: string | null;
}) {
  const [avatar, setAvatar] = useState(avatarFileId);
  const [cover, setCover] = useState(coverFileId);
  const [busy, setBusy] = useState<"avatar" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  async function upload(slot: "avatar" | "cover", file: File) {
    setBusy(slot);
    setError(null);
    const form = new FormData();
    form.append("slot", slot);
    form.append("image", file);
    try {
      const res = await fetch("/api/v1/me/photo", { method: "POST", body: form });
      const json = (await res.json()) as { fileId?: string; error?: { message: string } };
      if (!res.ok || json.error) throw new Error(json.error?.message ?? "Échec de l'envoi.");
      if (slot === "avatar") setAvatar(json.fileId ?? null);
      else setCover(json.fileId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(slot: "avatar" | "cover") {
    setBusy(slot);
    setError(null);
    try {
      const res = await fetch(`/api/v1/me/photo?slot=${slot}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression impossible.");
      if (slot === "avatar") setAvatar(null);
      else setCover(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setBusy(null);
    }
  }

  const src = (id: string) => `/api/v1/files/${id}`;

  return (
    <section className="card overflow-hidden">
      <div className="relative">
        <div className="h-28 w-full bg-gradient-to-r from-brand-soft to-surface-2 sm:h-36">
          {cover && (
            // Decorative: the person's identity is carried by the avatar and the
            // name below, so announcing this one adds noise without meaning.
            //
            // A plain <img>, not next/image: these are served from an
            // authenticated route with `Cache-Control: private`, and the image
            // optimiser would fetch and cache a citizen's photograph on a shared
            // path where the access check no longer applies.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src(cover)} alt="" aria-hidden className="h-full w-full object-cover" />
          )}
        </div>

        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" className="btn btn-ghost bg-white/90 px-2.5 py-1.5 text-[12px]" disabled={busy !== null} onClick={() => coverInput.current?.click()}>
            {busy === "cover" ? <IconSpinner size={14} /> : <IconImage size={14} />}
            <span className="ml-1.5">{cover ? "Changer la bannière" : "Ajouter une bannière"}</span>
          </button>
          {cover && (
            <button type="button" className="btn btn-ghost bg-white/90 px-2.5 py-1.5 text-[12px]" disabled={busy !== null} onClick={() => remove("cover")}>
              Retirer
            </button>
          )}
        </div>

        <div className="-mt-10 flex items-end gap-4 px-5 sm:-mt-12">
          <div className="relative">
            <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-surface bg-surface-2 sm:h-24 sm:w-24">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src(avatar)} alt={`Photo de profil de ${name}`} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted">
                  <IconUsers size={28} />
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0 pb-1">
            <p className="truncate text-[17px] font-semibold text-ink">{name}</p>
            <p className="text-[13px] text-ink-2">
              <span className="tag tag-muted">{categoryLabel}</span>
              <span className="ml-2">{roleLabel}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-5 pt-4">
        <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-[12px]" disabled={busy !== null} onClick={() => avatarInput.current?.click()}>
          {busy === "avatar" ? <IconSpinner size={14} /> : <IconImage size={14} />}
          <span className="ml-1.5">{avatar ? "Changer la photo" : "Ajouter une photo"}</span>
        </button>
        {avatar && (
          <button type="button" className="btn btn-ghost px-2.5 py-1.5 text-[12px]" disabled={busy !== null} onClick={() => remove("avatar")}>
            Retirer la photo
          </button>
        )}
        <p className="w-full text-[12px] text-muted">
          JPEG, PNG ou WebP, 5 Mo maximum. Vos images sont chiffrées et ne sont visibles que par vous et par les agents
          habilités à traiter vos cas.
        </p>
        {error && <p className="w-full text-[13px] text-danger">{error}</p>}
      </div>

      <input
        ref={avatarInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choisir une photo de profil"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload("avatar", f);
          e.target.value = "";
        }}
      />
      <input
        ref={coverInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choisir une image de bannière"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload("cover", f);
          e.target.value = "";
        }}
      />
    </section>
  );
}
