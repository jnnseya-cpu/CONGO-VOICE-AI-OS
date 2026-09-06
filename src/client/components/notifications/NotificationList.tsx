"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLanguage } from "../shell/LanguageProvider";
import { CHANNEL_FR, NOTIFICATION_TYPE_FR, Notice, filterSelectClass } from "../dashboard/Common";
import { IconBell, IconCheck } from "../icons";

export interface NotificationItem {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  mine: boolean;
  caseId: string | null;
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [type, setType] = useState("");
  const [scope, setScope] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Record<string, boolean>>({});

  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))).sort(), [items]);

  const visible = items.filter((i) => (!type || i.type === type) && (scope === "all" || !(read[i.id] ?? i.read)));

  async function markRead(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Cette notification ne peut pas être marquée comme lue.");
      }
      setRead((r) => ({ ...r, [id]: true }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'opération.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <select aria-label="Type" className={`${filterSelectClass} min-w-[170px]`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {NOTIFICATION_TYPE_FR[t] ?? t}
            </option>
          ))}
        </select>
        <button type="button" className={`btn ${scope === "unread" ? "btn-primary" : "btn-ghost"} h-10`} onClick={() => setScope(scope === "unread" ? "all" : "unread")} aria-pressed={scope === "unread"}>
          {t("unreadOnly")}
        </button>
        <span className="ml-auto text-[12.5px] text-muted">{visible.length} message(s)</span>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      )}

      <ul className="divide-y divide-line">
        {visible.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">{t("noNotifications")}</li>}
        {visible.map((n) => {
          const isRead = read[n.id] ?? n.read;
          return (
            <li key={n.id} className={`flex gap-3 px-5 py-4 ${isRead ? "" : "bg-brand-soft/40"}`}>
              <span className={`icon-tile mt-0.5 h-9 w-9 ${isRead ? "bg-surface-2 text-muted" : "bg-brand-soft text-brand"}`}>
                <IconBell size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag tag-muted">{NOTIFICATION_TYPE_FR[n.type] ?? n.type}</span>
                  <span className="tag tag-case">{CHANNEL_FR[n.channel] ?? n.channel}</span>
                  {!n.mine && <span className="tag tag-warn">File commune</span>}
                  <span className="ml-auto text-[11.5px] text-muted-2">{new Date(n.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className={`mt-1 text-[14px] ${isRead ? "font-medium text-ink-2" : "font-semibold text-ink"}`}>{n.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {n.caseId && (
                    <Link href={`/cas/${n.caseId}`} className="link">
                      {t("openCase")}
                    </Link>
                  )}
                  {!isRead && n.mine && (
                    <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline" disabled={busy === n.id} onClick={() => markRead(n.id)}>
                      <IconCheck size={14} /> {busy === n.id ? "…" : t("markAsRead")}
                    </button>
                  )}
                  {!n.mine && !isRead && <span className="text-[12px] text-muted">Message adressé à toute une équipe : il reste visible pour vos collègues.</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
