import type { ReactNode } from "react";

/**
 * Renders the clinical reference library's Markdown.
 *
 * The library is authored as Markdown — headings, bullet lists, and a table for
 * the vaccination calendar — and was being split on blank lines and printed as
 * paragraphs. So a health worker looking up the immunisation schedule saw
 * "## Calendrier de l'enfant" and a table flattened into one unreadable line,
 * because a Markdown table's rows are separated by single newlines and the split
 * kept them together. The age of a measles dose was in there somewhere.
 *
 * Parsed to elements rather than to an HTML string: this text reaches the page
 * from the database, where an administrator can edit it, and
 * dangerouslySetInnerHTML on an editable field is a stored cross-site scripting
 * hole. Returning React elements cannot inject markup whatever the text says.
 *
 * The subset is what the library actually uses. Anything else renders as its
 * own literal text, which is wrong but legible — never blank.
 */

/** `**bold**` inside a line. Nothing else: emphasis in a protocol means "do not miss this". */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-t${i}`}>{part}</span>
    ),
  );
}

const isTableRow = (line: string) => line.trimStart().startsWith("|");
/** The `|---|---|` line under a table's header. */
const isTableRule = (line: string) => /^\s*\|[\s|:-]+\|\s*$/.test(line);
const cells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function ClinicalBody({ body, className }: { body: string; className?: string }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} className="text-[13.5px] leading-relaxed text-ink-2">
        {inline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    const key = `ul${blocks.length}`;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-1 text-[13.5px] leading-relaxed text-ink-2">
        {list.map((item, i) => (
          <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const depth = heading[1].length;
      const key = `h${blocks.length}`;
      const text = heading[2];
      blocks.push(
        depth <= 2 ? (
          <h3 key={key} className="mt-4 text-[14px] font-semibold text-ink first:mt-0">
            {text}
          </h3>
        ) : (
          <h4 key={key} className="mt-3 text-[13px] font-semibold text-ink-2">
            {text}
          </h4>
        ),
      );
      continue;
    }

    if (isTableRow(line)) {
      flush();
      const rows: string[][] = [];
      let header: string[] | null = null;
      while (i < lines.length && isTableRow(lines[i])) {
        if (isTableRule(lines[i])) {
          // The rule marks the row above as the header rather than being data.
          header = rows.pop() ?? null;
        } else {
          rows.push(cells(lines[i]));
        }
        i++;
      }
      i--;
      const key = `tb${blocks.length}`;
      blocks.push(
        // Scrollable, because a five-column calendar does not fit a phone and a
        // clipped table silently hides the last vaccine.
        <div key={key} className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-[13px]">
            {header && (
              <thead>
                <tr>
                  {header.map((c, j) => (
                    <th key={`${key}-h${j}`} className="border-b border-line px-2 py-1.5 text-left font-semibold text-ink">
                      {inline(c, `${key}-h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, r) => (
                <tr key={`${key}-r${r}`}>
                  {row.map((c, j) => (
                    <td key={`${key}-r${r}c${j}`} className="border-b border-line px-2 py-1.5 align-top text-ink-2">
                      {inline(c, `${key}-r${r}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }
  flush();

  return <div className={className ?? "space-y-2"}>{blocks}</div>;
}
