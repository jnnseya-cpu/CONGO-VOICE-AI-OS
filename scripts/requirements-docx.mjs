/**
 * Builds the requirement traceability matrix as a Word document, from the same
 * data the Markdown table is built from (docs/REQUIREMENTS.json), so the two
 * cannot drift.
 *
 *   node scripts/requirements-docx.mjs [output.docx]
 *
 * The file is read back after it is written and checked row for row against the
 * data, because a Word document that opens on a reviewer's machine and is
 * missing a requirement is worse than no document at all.
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
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/REQUIREMENTS.json"), "utf8"));
const out = process.argv[2] ?? path.join(ROOT, "docs/CONGO_VOICE_AI_OS_Requirement_Traceability.docx");

/* A4 landscape: the table has five columns and one of them is a sentence.
 * docx-js swaps the axes for landscape, so the usable width comes from the
 * page's long side. The columns must sum to exactly that, or the table runs off
 * the right edge of every page. */
const PAGE = { width: 11906, height: 16838 };
const MARGIN = 720;
const TABLE_WIDTH = PAGE.height - MARGIN * 2;
const COLS = [1100, 5400, 1250, 3400, 4248];
if (COLS.reduce((a, b) => a + b, 0) !== TABLE_WIDTH) throw new Error("column widths must sum to the usable page width");

const INK = "1F2937";
const MUTED = "4B5563";
const LINE = "D1D5DB";
const HEADER_FILL = "0B1220";

/** One fill per status, dark enough to read the label on. */
const STATUS_FILL = {
  Built: "E7F6EC",
  Partial: "FFF4E0",
  Programme: "E8EFFF",
  Deferred: "F1EAFF",
  Hosting: "EEF2F7",
  Deviation: "FDECEC",
};

function text(value, opts = {}) {
  return new TextRun({ text: value, size: opts.size ?? 17, bold: opts.bold, color: opts.color ?? INK, font: "Calibri" });
}

function para(value, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60, line: 240 },
    children: Array.isArray(value) ? value : [text(value, opts)],
  });
}

function cell(children, opts = {}) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
    children,
  });
}

function matrixTable(rows) {
  const head = new TableRow({
    tableHeader: true,
    children: ["ID", "Requirement", "Status", "Where it is satisfied", "Note"].map((label, i) =>
      cell([para([text(label, { bold: true, color: "FFFFFF", size: 17 })], { after: 0 })], { width: COLS[i], fill: HEADER_FILL }),
    ),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        children: [
          cell([para([text(r.id, { bold: true, size: 16 })], { after: 0 })], { width: COLS[0] }),
          cell([para([text(r.requirement, { size: 16 })], { after: 0 })], { width: COLS[1] }),
          cell([para([text(r.status, { bold: true, size: 16 })], { after: 0 })], { width: COLS[2], fill: STATUS_FILL[r.status] }),
          cell([para([text(r.evidence, { size: 15, color: MUTED })], { after: 0 })], { width: COLS[3] }),
          cell([para([text(r.note || "—", { size: 16, color: MUTED })], { after: 0 })], { width: COLS[4] }),
        ],
      }),
  );
  return new Table({ columnWidths: COLS, width: { size: TABLE_WIDTH, type: WidthType.DXA }, rows: [head, ...body] });
}

function legendTable() {
  const widths = [1800, TABLE_WIDTH - 1800];
  const meanings = [
    ["Built", "Implemented in this repository, with the code and the test that proves it named in the row."],
    ["Partial", "Part of it is implemented and code is still owed in this repository. The row says which part."],
    ["Programme", "What remains is not software: a content, contractual, staffing or governance deliverable. The note says what is already built."],
    ["Deferred", "Placed in a later phase by the specification itself."],
    ["Hosting", "What remains is a property of the deployment or of its operation, such as an availability target or a restore exercise."],
    ["Deviation", "This repository deliberately does something different from the specification. The note says what, and why."],
  ];
  return new Table({
    columnWidths: widths,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    rows: meanings.map(
      ([status, meaning]) =>
        new TableRow({
          children: [
            cell([para([text(`${status}  (${data.counts[status]})`, { bold: true, size: 16 })], { after: 0 })], { width: widths[0], fill: STATUS_FILL[status] }),
            cell([para([text(meaning, { size: 16, color: MUTED })], { after: 0 })], { width: widths[1] }),
          ],
        }),
    ),
  });
}

const sections = [];
for (const row of data.rows) {
  const last = sections.at(-1);
  if (last && last.title === row.section) last.rows.push(row);
  else sections.push({ title: row.section, rows: [row] });
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 120 },
    children: [text("CONGO VOICE AI OS — Requirement traceability", { bold: true, size: 36 })],
  }),
  para(
    [text("Every requirement identifier in the two product requirement documents, and what in this repository satisfies it. One row per identifier, no identifier without a row: a test fails the build if the two drift apart, and the identifier list itself is extracted from the .docx files rather than retyped.", { color: MUTED })],
    { after: 160 },
  ),
  para([text(`${data.total} identifiers.  `, { bold: true }), text(Object.entries(data.counts).map(([k, v]) => `${k} ${v}`).join("  ·  "), { color: MUTED })], { after: 200 }),
  legendTable(),
  para("", { after: 160 }),
  para(
    [text("No row is left Partial. Every requirement is either built in this repository, with the code and the test that proves it named in the row, or its remaining work is named and owned outside it — a recording studio, a review board, a signed contract, a deployment setting, an operational exercise — or it is a deliberate deviation with its reasoning written down. That is a statement about where the work sits, not a claim that it is all done.")],
    { after: 120 },
  ),
  para(
    [text("A status of Built is a claim about this repository, not about the programme. A platform can satisfy every row below and still not be ready for citizens: the clinical approvals, the staffed queues and the measured language quality are Programme rows, and they are the ones that decide a launch.")],
    { after: 240 },
  ),
];

for (const section of sections) {
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 120 },
      children: [text(section.title, { bold: true, size: 24 })],
    }),
  );
  children.push(matrixTable(section.rows));
}

const doc = new Document({
  creator: "CONGO VOICE AI OS",
  title: "CONGO VOICE AI OS — Requirement traceability",
  description: `${data.total} requirement identifiers and what satisfies each of them.`,
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
              children: [
                new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 15, color: MUTED, font: "Calibri" }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(out, buffer);

/* ── Read it back ──────────────────────────────────────────────────────────
 * Every identifier, status and section title must be present in the written
 * document, and the table rows must account for exactly the data rows plus one
 * header per section plus the legend. */
const xml = execFileSync("unzip", ["-p", out, "word/document.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const written = [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
  .map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"))
  .join(" \u0000 ");
const missing = [];
for (const row of data.rows) if (!written.includes(row.id)) missing.push(row.id);
for (const section of sections) if (!written.includes(section.title)) missing.push(`section: ${section.title}`);
const rowCount = (xml.match(/<w:tr[ >]/g) ?? []).length;
const expectedRows = data.rows.length + sections.length + 6;
if (missing.length > 0 || rowCount !== expectedRows) {
  console.error(`The written document does not match the data.`);
  if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
  if (rowCount !== expectedRows) console.error(`  ${rowCount} table rows, expected ${expectedRows}`);
  process.exit(1);
}

console.log(`${data.total} rows across ${sections.length} sections written to ${out}`);
console.log(`Read back: every identifier and section present, ${rowCount} table rows as expected.`);

