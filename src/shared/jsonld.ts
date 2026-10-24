/**
 * Structured data, serialised safely into a `<script>` element.
 *
 * `JSON.stringify` produces valid JSON, not valid *script content*: HTML parses
 * the first `</script` inside the element as the end of the element, whatever
 * the JSON says. A title containing that sequence would therefore close the tag
 * early and let the rest of the string be parsed as markup — a stored cross-site
 * scripting hole whose entry point is an ordinary piece of copy.
 *
 * Everything the platform puts in structured data is repository content today,
 * so this is a guard against the day that stops being true, and against a
 * well-meant author who pastes a tag into a description. Escaping `<` as its
 * unicode form keeps the JSON equivalent — a JSON parser reads `\u003c` as `<`
 * — while making the sequence invisible to the HTML parser.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
