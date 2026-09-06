/**
 * CSV renderer: a single UTF-8 file with a governance header, then one block per section.
 * Opens directly in Excel thanks to the byte-order mark added by the download route.
 */
import type { ReportDocument } from "./types";

const esc = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function renderCsv(doc: ReportDocument): string {
  const lines: string[] = [];
  lines.push(esc(doc.programme));
  lines.push(esc(doc.title));
  lines.push(`Période,${esc(doc.period.label)}`);
  lines.push(`Périmètre,${esc(Object.entries(doc.scope).map(([k, v]) => `${k}=${String(v)}`).join(" · ") || "national")}`);
  lines.push(`Généré le,${esc(doc.generatedAt)}`);
  lines.push(`Fraîcheur des données,${esc(doc.dataFreshness ?? "aucune donnée sur la période")}`);
  lines.push("");
  lines.push("Synthèse");
  lines.push("Indicateur,Valeur");
  for (const s of doc.summary) lines.push(`${esc(s.label)},${esc(s.value)}`);

  for (const section of doc.sections) {
    lines.push("");
    lines.push(esc(section.title));
    if (section.description) lines.push(esc(section.description));
    lines.push(section.columns.map((c) => esc(c.label)).join(","));
    for (const row of section.rows) lines.push(section.columns.map((c) => esc(row[c.key])).join(","));
    if (section.note) lines.push(esc(section.note));
  }

  lines.push("");
  lines.push("Définitions");
  for (const d of doc.definitions) lines.push(`${esc(d.term)},${esc(d.meaning)}`);
  lines.push("");
  lines.push("Dénominateurs");
  for (const d of doc.denominators) lines.push(esc(d));
  lines.push("");
  lines.push(esc(doc.suppressionNote));
  return lines.join("\n");
}
