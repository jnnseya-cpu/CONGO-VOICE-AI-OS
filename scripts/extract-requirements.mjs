/**
 * Rebuilds tests/fixtures/prd-requirements.tsv from the two .docx requirement
 * documents, so the traceability matrix is checked against the documents
 * themselves rather than against a list someone retyped.
 *
 *   node scripts/extract-requirements.mjs <dev.docx> <prd.docx>
 *
 * A .txt export of either document is accepted in place of the .docx.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PATTERN = /\b((?:FR|NFR|SEC|AI|CP|CM|DO|HEA|AGR|EDU|IAM|CON|CAS|NOT)-[A-Z]{0,3}-?\d{2,3}|\bE\d{2}\b)\b/g;

/** Limit on the sentence kept beside each identifier. Long enough that the row
 * reads as the requirement rather than as a fragment, short enough that the
 * matrix stays a table. */
const CONTEXT_CHARS = 400;

function sourceText(path) {
  // A .txt export of the same document is accepted so the matrix can be
  // regenerated where only the extracted text survives. In such an export a
  // table row arrives as one line per cell, each prefixed with a pipe, so the
  // continuation cells are folded back onto the line that names the identifier
  // — otherwise a requirement stated in a table reads as its identifier alone.
  if (!path.endsWith(".txt")) return docxText(path);
  const folded = [];
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (line.trim().startsWith("|") && folded.length > 0) folded[folded.length - 1] += " " + line.trim().replace(/^\|\s*/, "").replace(/\s*\|$/, "");
    else folded.push(line);
  }
  return folded.join("\n");
}

function docxText(path) {
  // The document body is one entry in the zip; read the text runs in order.
  const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parts = [];
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>|<\/w:p>|<\/w:tc>|<\/w:tr>/gs)) {
    if (m[1] !== undefined) parts.push(m[1]);
    else if (m[0] === "</w:p>" || m[0] === "</w:tr>") parts.push("\n");
    else parts.push(" | ");
  }
  return parts
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/extract-requirements.mjs <docx|txt> [<docx|txt>…]");
  process.exit(1);
}

const seen = new Map();
for (const file of files) {
  for (const line of sourceText(file).split("\n")) {
    for (const m of line.matchAll(PATTERN)) {
      // Keep the fullest statement of a requirement, whichever document or
      // which mention of it turns out to carry it.
      const context = line.trim().replace(/\s+/g, " ").slice(0, CONTEXT_CHARS);
      if ((seen.get(m[1])?.length ?? 0) < context.length) seen.set(m[1], context);
    }
  }
}

const header = [
  "# Requirement identifiers extracted from the two product requirement documents.",
  "# Source: CONGO_VOICE_AI_OS_Developer_Ready_PRD_v1.0.docx and CONGO_VOICE_AI_OS_PRD_v1.0.docx (6 September 2026).",
  "# One identifier per line, with the sentence that defines it. Regenerate with scripts/extract-requirements.mjs.",
];
const body = [...seen].map(([id, context]) => `${id}\t${context}`);
fs.writeFileSync(process.env.REQUIREMENTS_TSV ?? "tests/fixtures/prd-requirements.tsv", [...header, ...body].join("\n") + "\n");
console.log(`${seen.size} identifiers written`);
