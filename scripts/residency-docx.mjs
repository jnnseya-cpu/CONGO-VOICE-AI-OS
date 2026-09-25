/**
 * Builds the data-residency inventory as a Word document, from the same data
 * the Markdown is built from (docs/DATA_RESIDENCY.json), so the two cannot say
 * different things about where a citizen's words are allowed to travel.
 *
 *   npm run residency:docx
 *
 * The file is read back after it is written and checked row for row: an
 * inventory that opens on a reviewer's machine with a destination missing is
 * worse than no inventory at all.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const docx = require(process.env.DOCX_MODULE ?? "docx");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = docx;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/DATA_RESIDENCY.json"), "utf8"));
const out = process.argv[2] ?? path.join(ROOT, "docs/CONGO_VOICE_AI_OS_Data_Residency.docx");

/* A4 landscape: six columns, two of which are sentences. */
const PAGE = { width: 11906, height: 16838 };
const MARGIN = 720;
const TABLE_WIDTH = PAGE.height - MARGIN * 2;
const COLS = [1500, 1700, 2700, 2100, 1100, 6298];
if (COLS.reduce((a, b) => a + b, 0) !== TABLE_WIDTH) throw new Error("column widths must sum to the usable page width");

const INK = "1F2937";
const MUTED = "4B5563";
const LINE = "D1D5DB";
const HEADER_FILL = "0B1220";
const SAFETY_FILL = "FDECEC";
const LOCAL_FILL = "E7F6EC";

function text(value, opts = {}) {
  return new TextRun({ text: value, size: opts.size ?? 17, bold: opts.bold, italics: opts.italics, color: opts.color ?? INK, font: "Calibri" });
}

function para(value, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 260 },
    children: Array.isArray(value) ? value : [text(value, opts)],
  });
}

function cell(children, opts = {}) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
    children,
  });
}

function heading(value) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 140 },
    children: [text(value, { bold: true, size: 24 })],
  });
}

/** A destination in the deployment's own country is the one that never travels. */
function isLocal(row) {
  return /same as the deployment/i.test(row.jurisdiction);
}

function inventoryTable() {
  const head = new TableRow({
    tableHeader: true,
    children: ["Destination", "Kind", "Operator", "Jurisdiction", "Safety path", "What it receives"].map((label, i) =>
      cell([para([text(label, { bold: true, color: "FFFFFF", size: 17 })], { after: 0 })], { width: COLS[i], fill: HEADER_FILL }),
    ),
  });

  const rows = data.destinations.map(
    (r) =>
      new TableRow({
        children: [
          cell([para([text(r.id, { bold: true, size: 16 })], { after: 0 })], { width: COLS[0], fill: isLocal(r) ? LOCAL_FILL : undefined }),
          cell([para([text(r.kindLabel, { size: 16 })], { after: 0 })], { width: COLS[1] }),
          cell([para([text(r.operator, { size: 16, color: MUTED })], { after: 0 })], { width: COLS[2] }),
          cell([para([text(r.jurisdiction, { size: 16, bold: !isLocal(r) })], { after: 0 })], { width: COLS[3], fill: isLocal(r) ? LOCAL_FILL : undefined }),
          cell([para([text(r.onSafetyPath ? "yes" : "no", { size: 16, bold: r.onSafetyPath })], { after: 0 })], {
            width: COLS[4],
            fill: r.onSafetyPath ? SAFETY_FILL : undefined,
          }),
          cell([para([text(r.sends, { size: 16, color: MUTED })], { after: 0 })], { width: COLS[5] }),
        ],
      }),
  );

  return new Table({ columnWidths: COLS, width: { size: TABLE_WIDTH, type: WidthType.DXA }, rows: [head, ...rows] });
}

function consequenceTable() {
  const widths = [1800, TABLE_WIDTH - 1800];
  const head = new TableRow({
    tableHeader: true,
    children: ["Destination", "What is lost if the policy refuses it"].map((label, i) =>
      cell([para([text(label, { bold: true, color: "FFFFFF", size: 17 })], { after: 0 })], { width: widths[i], fill: HEADER_FILL }),
    ),
  });
  const rows = data.destinations.map(
    (r) =>
      new TableRow({
        children: [
          cell([para([text(r.id, { bold: true, size: 16 })], { after: 0 })], { width: widths[0] }),
          cell([para([text(r.ifRefused, { size: 16, color: MUTED })], { after: 0 })], { width: widths[1] }),
        ],
      }),
  );
  return new Table({ columnWidths: widths, width: { size: TABLE_WIDTH, type: WidthType.DXA }, rows: [head, ...rows] });
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 140 },
    children: [text("CONGO VOICE AI OS — Where citizen data can go", { bold: true, size: 36 })],
  }),
  para(
    [text("Every destination a citizen's words, voice, photographs or telephone number can reach, and what each one receives. Generated from the same declarations the platform enforces at runtime, so it cannot describe a system other than the one that is running.", { color: MUTED })],
    { after: 200 },
  ),

  heading("The position"),
  para("The programme's intent is that everything stays in the Democratic Republic of the Congo. There is no cloud region in the country, so the pilot runs from the nearest available one — Johannesburg — and migrates when an in-country option exists. That is a decision with a date on it, not a permanent posture, and this document exists so that the gap between the intent and the deployment is stated rather than assumed."),

  heading("How it is enforced"),
  para("DATA_RESIDENCY names the jurisdictions a deployment permits, as a comma-separated list of ISO 3166-1 alpha-2 codes. A destination outside that set is never registered: it has no code path, so no ordering, retry or fallback can reach it."),
  para("A message channel outside it returns a delivery failure, which the escalation path reports and the readiness probe degrades on — the argument for changing the policy or the carrier, made at the moment it matters rather than after an incident."),
  para([text("Unset means unrestricted. That is right on a laptop and is reported as a finding in any deployment that serves citizens.", { italics: true, color: MUTED })]),

  heading("What moving the container does not fix"),
  para([
    text("A voice recording sent to a transcription service abroad has left the country whether the server is in Johannesburg or in Kinshasa. ", {}),
    text("The providers below are the residency question; the hosting is the smaller half of it.", { bold: true }),
  ]),

  heading("The inventory"),
  inventoryTable(),
  para("", { after: 120 }),
  para([text("Rows shaded green stay inside the deployment's own country. Rows marked on the safety path are ones the platform's deterministic escalation depends on.", { size: 15, color: MUTED, italics: true })]),

  heading("What refusing a destination costs"),
  consequenceTable(),

  heading("The strictest useful setting"),
  para([text("DATA_RESIDENCY=CD    DEPLOYMENT_JURISDICTION=CD", { bold: true, size: 18 })]),
  para("Every remote provider is refused. The platform still triages by protocol, still detects danger signs, still grades severity and still speaks the fixed emergency scripts — none of that ever used a model. What it loses is understanding free speech and transcribing a voice note."),
  para([text("That is a different product, and under a strict localisation requirement it is the honest one.", { bold: true })]),

  heading("The question this document does not answer"),
  para("Whether the DRC Code du numérique (Ordonnance-loi n° 23/010 of 13 March 2023) requires localisation, or sets conditions on cross-border transfer, is a legal question. It decides both the host and which providers may be enabled, and it is recorded as an open Phase 0 decision. This inventory is what that review needs in front of it, not a substitute for it."),
];

const doc = new Document({
  creator: "CONGO VOICE AI OS",
  title: "CONGO VOICE AI OS — Where citizen data can go",
  description: `${data.destinations.length} destinations a citizen's data can reach, and what each one receives.`,
  styles: { default: { document: { run: { font: "Calibri", size: 17, color: INK } } } },
  sections: [
    {
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 15, color: MUTED, font: "Calibri" })],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

fs.writeFileSync(out, await Packer.toBuffer(doc));

/* Read it back: every destination present, and the table rows accounted for. */
const xml = execFileSync("unzip", ["-p", out, "word/document.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const written = [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
  .map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"))
  .join(" \u0000 ");
const missing = data.destinations.filter((d) => !written.includes(d.id)).map((d) => d.id);
const rowCount = (xml.match(/<w:tr[ >]/g) ?? []).length;
const expected = data.destinations.length * 2 + 2;
if (missing.length > 0 || rowCount !== expected) {
  console.error(`The written document does not match the data.`);
  if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
  if (rowCount !== expected) console.error(`  ${rowCount} table rows, expected ${expected}`);
  process.exit(1);
}

console.log(`${data.destinations.length} destinations written to ${out}`);
console.log(`Read back: every destination present, ${rowCount} table rows as expected.`);
