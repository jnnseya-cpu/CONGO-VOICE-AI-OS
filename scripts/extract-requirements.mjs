/**
 * Rebuilds tests/fixtures/prd-requirements.tsv from the two .docx requirement
 * documents, so the traceability matrix is checked against the documents
 * themselves rather than against a list someone retyped.
 *
 *   node scripts/extract-requirements.mjs <dev.docx> <prd.docx>
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PATTERN = /\b((?:FR|NFR|SEC|AI|CP|CM|DO|HEA|AGR|EDU|IAM|CON|CAS|NOT)-[A-Z]{0,3}-?\d{2,3}|\bE\d{2}\b)\b/g;

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
  console.error("usage: node scripts/extract-requirements.mjs <docx> [<docx>…]");
  process.exit(1);
}

const seen = new Map();
for (const file of files) {
  for (const line of docxText(file).split("\n")) {
    for (const m of line.matchAll(PATTERN)) {
      if (!seen.has(m[1])) seen.set(m[1], line.trim().slice(0, 150));
    }
  }
}

const header = [
  "# Requirement identifiers extracted from the two product requirement documents.",
  "# Source: CONGO_VOICE_AI_OS_Developer_Ready_PRD_v1.0.docx and CONGO_VOICE_AI_OS_PRD_v1.0.docx (6 September 2026).",
  "# One identifier per line, with the sentence that defines it. Regenerate with scripts/extract-requirements.mjs.",
];
const body = [...seen].map(([id, context]) => `${id}\t${context}`);
fs.writeFileSync("tests/fixtures/prd-requirements.tsv", [...header, ...body].join("\n") + "\n");
console.log(`${seen.size} identifiers written to tests/fixtures/prd-requirements.tsv`);
