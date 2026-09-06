/**
 * Branded PDF renderer (pdfkit).
 *
 * Every page carries the programme name, the report title, the period and a page number;
 * the first page carries the summary, and the last page carries the definitions, the
 * denominators, the data-freshness stamp and the suppression rule. A figure without its
 * definition and its denominator is not publishable.
 */
import "server-only";
import PDFDocument from "pdfkit";
import { PROGRAMME_NAME, type ReportDocument, type ReportSection } from "./types";

const INK = "#101828";
const MUTED = "#667085";
const ACCENT = "#0B6E4F";
const RULE = "#E4E7EC";
const MARGIN = 48;

export async function renderPdf(doc: ReportDocument): Promise<Buffer> {
  const pdf = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: `${doc.title} — ${PROGRAMME_NAME}`, Author: PROGRAMME_NAME, Subject: doc.purpose } });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  cover(pdf, doc);
  for (const section of doc.sections) renderSection(pdf, section);
  appendix(pdf, doc);
  paginate(pdf, doc);

  pdf.end();
  return done;
}

type Pdf = InstanceType<typeof PDFDocument>;

function contentWidth(pdf: Pdf): number {
  return pdf.page.width - MARGIN * 2;
}

function cover(pdf: Pdf, doc: ReportDocument) {
  pdf.fillColor(ACCENT).font("Helvetica-Bold").fontSize(10).text(PROGRAMME_NAME.toUpperCase(), { characterSpacing: 1.2 });
  pdf.moveDown(0.6);
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(doc.title);
  pdf.moveDown(0.3);
  pdf.fillColor(MUTED).font("Helvetica").fontSize(10).text(`Période : ${doc.period.label}`);
  const scopeEntries = Object.entries(doc.scope).filter(([, v]) => v !== undefined && v !== null && v !== "");
  pdf.text(`Périmètre : ${scopeEntries.length ? scopeEntries.map(([k, v]) => `${k} = ${String(v)}`).join(" · ") : "national"}`);
  pdf.text(`Généré le : ${formatIso(doc.generatedAt)}`);
  pdf.text(`Fraîcheur des données : ${doc.dataFreshness ? formatIso(doc.dataFreshness) : "aucune donnée sur la période"}`);
  pdf.text(`Destinataires : ${doc.audience}`);
  pdf.moveDown(0.8);
  rule(pdf);
  pdf.moveDown(0.8);

  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Synthèse");
  pdf.moveDown(0.4);
  const width = contentWidth(pdf);
  const colWidth = width / 2 - 8;
  let x = MARGIN;
  let y = pdf.y;
  for (const [i, item] of doc.summary.entries()) {
    if (i > 0 && i % 2 === 0) {
      y += 40;
      x = MARGIN;
    }
    pdf.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(item.label.toUpperCase(), x, y, { width: colWidth });
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(String(item.value), x, y + 12, { width: colWidth });
    x += colWidth + 16;
  }
  pdf.x = MARGIN;
  pdf.y = y + 46;
  pdf.moveDown(0.5);
  pdf.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8.5).text(doc.purpose, { width: contentWidth(pdf) });
  pdf.moveDown(0.8);
}

function renderSection(pdf: Pdf, section: ReportSection) {
  ensureSpace(pdf, 120);
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(section.title, MARGIN, pdf.y);
  if (section.description) {
    pdf.moveDown(0.2);
    pdf.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(section.description, { width: contentWidth(pdf) });
  }
  pdf.moveDown(0.4);

  const width = contentWidth(pdf);
  const cols = section.columns;
  const colWidth = width / cols.length;

  const header = () => {
    const y = pdf.y;
    pdf.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5);
    cols.forEach((c, i) => {
      pdf.text(c.label, MARGIN + i * colWidth, y, { width: colWidth - 6, align: c.align === "right" ? "right" : "left" });
    });
    pdf.y = y + 14;
    rule(pdf);
    pdf.y += 4;
  };
  header();

  if (section.rows.length === 0) {
    pdf.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9).text("Aucune donnée sur la période.", MARGIN, pdf.y, { width });
    pdf.moveDown(1);
    return;
  }

  pdf.font("Helvetica").fontSize(9);
  for (const row of section.rows) {
    if (pdf.y > pdf.page.height - MARGIN - 60) {
      pdf.addPage();
      header();
      pdf.font("Helvetica").fontSize(9);
    }
    const y = pdf.y;
    let height = 12;
    cols.forEach((c, i) => {
      const value = row[c.key];
      const text = value === null || value === undefined ? "—" : String(value);
      pdf.fillColor(INK).text(text, MARGIN + i * colWidth, y, { width: colWidth - 6, align: c.align === "right" ? "right" : "left" });
      height = Math.max(height, pdf.y - y);
    });
    pdf.y = y + height + 2;
  }
  if (section.note) {
    pdf.moveDown(0.3);
    pdf.fillColor(MUTED).font("Helvetica-Oblique").fontSize(8).text(section.note, MARGIN, pdf.y, { width });
  }
  pdf.moveDown(1);
}

function appendix(pdf: Pdf, doc: ReportDocument) {
  pdf.addPage();
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(13).text("Définitions et méthode");
  pdf.moveDown(0.5);
  for (const d of doc.definitions) {
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(d.term, { continued: true });
    pdf.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(` — ${d.meaning}`, { width: contentWidth(pdf) });
    pdf.moveDown(0.3);
  }
  pdf.moveDown(0.5);
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Dénominateurs");
  pdf.moveDown(0.3);
  for (const den of doc.denominators) {
    pdf.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(`• ${den}`, { width: contentWidth(pdf) });
  }
  pdf.moveDown(0.6);
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Fraîcheur des données");
  pdf.moveDown(0.3);
  pdf
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      doc.dataFreshness
        ? `Dernier enregistrement inclus : ${formatIso(doc.dataFreshness)}. Rapport généré le ${formatIso(doc.generatedAt)}.`
        : `Aucun enregistrement sur la période. Rapport généré le ${formatIso(doc.generatedAt)}.`,
      { width: contentWidth(pdf) },
    );
  pdf.moveDown(0.6);
  pdf.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Confidentialité");
  pdf.moveDown(0.3);
  pdf.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(doc.suppressionNote, { width: contentWidth(pdf) });
  pdf.moveDown(0.3);
  pdf.text("Ce document ne contient aucune donnée nominative. Toute réutilisation doit respecter la finalité déclarée.", { width: contentWidth(pdf) });
}

function paginate(pdf: Pdf, doc: ReportDocument) {
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    const y = pdf.page.height - MARGIN + 12;
    pdf.fillColor(MUTED).font("Helvetica").fontSize(8);
    pdf.text(`${PROGRAMME_NAME} · ${doc.title} · ${doc.period.label}`, MARGIN, y, { width: contentWidth(pdf) - 60, align: "left", lineBreak: false });
    pdf.text(`Page ${i - range.start + 1} / ${range.count}`, pdf.page.width - MARGIN - 60, y, { width: 60, align: "right", lineBreak: false });
  }
}

function rule(pdf: Pdf) {
  pdf.save().strokeColor(RULE).lineWidth(0.8).moveTo(MARGIN, pdf.y).lineTo(pdf.page.width - MARGIN, pdf.y).stroke().restore();
}

function ensureSpace(pdf: Pdf, needed: number) {
  if (pdf.y > pdf.page.height - MARGIN - needed) pdf.addPage();
}

function formatIso(iso: string): string {
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}
