"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { filterInputClass, filterSelectClass } from "../dashboard/Common";

export function AuditFilters({ actions, entityTypes }: { actions: string[]; entityTypes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [entityId, setEntityId] = useState(params.get("entityId") ?? "");

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        set("entityId", entityId.trim());
      }}
    >
      <select aria-label="Action" className={`${filterSelectClass} min-w-[200px]`} value={params.get("action") ?? ""} onChange={(e) => set("action", e.target.value)}>
        <option value="">Toutes les actions</option>
        {actions.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select aria-label="Type d'entité" className={`${filterSelectClass} min-w-[170px]`} value={params.get("entityType") ?? ""} onChange={(e) => set("entityType", e.target.value)}>
        <option value="">Toutes les entités</option>
        {entityTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input aria-label="Identifiant d'entité" className={`${filterInputClass} min-w-[220px] font-mono`} placeholder="Identifiant d'entité" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
      <button type="submit" className="btn btn-ghost h-10">
        Filtrer
      </button>
      {(params.get("action") || params.get("entityType") || params.get("entityId")) && (
        <button
          type="button"
          className="text-[13px] font-semibold text-muted hover:text-ink"
          onClick={() => {
            setEntityId("");
            router.push(pathname);
          }}
        >
          Réinitialiser
        </button>
      )}
    </form>
  );
}
