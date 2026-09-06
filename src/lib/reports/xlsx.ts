/**
 * XLSX renderer (exceljs): one sheet for the cover and the summary, one sheet per section,
 * and a final sheet carrying the definitions, denominators and the suppression rule — the
 * same governance metadata as the PDF, so a spreadsheet can never travel without it.
 */
import "server-only";
import ExcelJS from "exceljs";
import { PROGRAMME_NAME, type ReportDocument } from "./types";

const HEADER_FILL = "FF0B6E4F";

export async function renderXlsx(doc: ReportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = PROGRAMME_NAME;
  wb.created = new Date(doc.generatedAt);
  wb.title = doc.title;

  const cover = wb.addWorksheet("Synthèse");
  cover.columns = [{ width: 42 }, { width: 46 }];
  cover.addRow([PROGRAMME_NAME, ""]).font = { bold: true, size: 14 };
  cover.addRow([doc.title, ""]).font = { bold: true, size: 12 };
  cover.addRow(["Période", doc.period.label]);
  cover.addRow(["Périmètre", Object.entries(doc.scope).map(([k, v]) => `${k}=${String(v)}`).join(" · ") || "national"]);
  cover.addRow(["Généré le", doc.generatedAt]);
  cover.addRow(["Fraîcheur des données", doc.dataFreshness ?? "aucune donnée sur la période"]);
  cover.addRow(["Destinataires", doc.audience]);
  cover.addRow(["Finalité", doc.purpose]);
  cover.addRow([]);
  const summaryHeader = cover.addRow(["Indicateur", "Valeur"]);
  styleHeader(summaryHeader);
  for (const s of doc.summary) cover.addRow([s.label, s.value]);

  for (const [i, section] of doc.sections.entries()) {
    const sheet = wb.addWorksheet(sheetName(section.title, i));
    sheet.columns = section.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(14, Math.min(46, c.label.length + 10)) }));
    styleHeader(sheet.getRow(1));
    for (const row of section.rows) {
      sheet.addRow(section.columns.reduce<Record<string, unknown>>((acc, c) => ({ ...acc, [c.key]: row[c.key] ?? "" }), {}));
    }
    if (section.note) {
      sheet.addRow([]);
      const note = sheet.addRow([section.note]);
      note.font = { italic: true, size: 9 };
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const meta = wb.addWorksheet("Définitions");
  meta.columns = [{ width: 34 }, { width: 96 }];
  styleHeader(meta.addRow(["Terme", "Définition"]));
  for (const d of doc.definitions) meta.addRow([d.term, d.meaning]);
  meta.addRow([]);
  styleHeader(meta.addRow(["Dénominateurs", ""]));
  for (const d of doc.denominators) meta.addRow(["", d]);
  meta.addRow([]);
  styleHeader(meta.addRow(["Confidentialité", ""]));
  meta.addRow(["", doc.suppressionNote]);
  meta.addRow(["", "Ce document ne contient aucune donnée nominative."]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
}

/** Excel sheet names: 31 characters, no []:*?/\ */
function sheetName(title: string, index: number): string {
  const clean = title.replace(/[[\]:*?/\\]/g, " ").trim();
  return (clean.length > 28 ? `${clean.slice(0, 25)}…` : clean) || `Section ${index + 1}`;
}
