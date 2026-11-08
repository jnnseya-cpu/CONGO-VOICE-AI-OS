/**
 * The platform's surface, extracted from source.
 *
 * This exists to answer one question in CI: did anything disappear? The test
 * suite proves that what is here behaves correctly; nothing proved that it is
 * still here. A route file deleted, a permission dropped from a role, a
 * scheduler step removed, a language taken out of the enum — every one of those
 * leaves the suite green and the platform quietly smaller.
 *
 * So the surface is extracted structurally, written to inventory.lock.json, and
 * compared on every run. Growth is caught too, because a lock that only
 * objected to removals would let a new route appear with nobody looking at it.
 *
 * Extraction is textual on purpose. It needs no database, no API key, no module
 * loading and no build step, so it gives the same answer in CI, in a test and on
 * a laptop with nothing configured.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const read = (root, p) => readFileSync(join(root, p), "utf8");

/** Every match of a capture group, sorted and de-duplicated. */
function all(source, pattern) {
  return [...new Set([...source.matchAll(pattern)].map((m) => m[1]))].sort();
}

/** Files under `dir` matching `name`, as paths relative to `root`. */
function walk(root, dir, match) {
  const out = [];
  const base = join(root, dir);
  if (!existsSync(base)) return out;
  const visit = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (match(entry)) out.push(relative(root, full).split("\\").join("/"));
    }
  };
  visit(base);
  return out.sort();
}

/** The values of a `const X = [...] as const;` driver list. */
function driverList(source, name) {
  const block = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!block) return [];
  return [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
}

/**
 * Just the ROLE_PERMISSIONS object.
 *
 * ROLE_MODULE_SCOPE and ROLE_LABELS are shaped the same way and sit in the same
 * file, so matching the whole file would silently merge three different maps
 * into one and lock none of them correctly.
 */
function rolePermissionsBlock(rbac) {
  const start = rbac.indexOf("export const ROLE_PERMISSIONS");
  const end = rbac.indexOf("ROLE_MODULE_SCOPE");
  return rbac.slice(start, end === -1 ? undefined : end);
}

/** Expands the CITIZEN and FIELD_OFFICER spreads to a count per role. */
function resolvedRoleSizes(rbac) {
  const listOf = (name) => {
    const m = rbac.match(new RegExp(`const ${name}: Permission\\[\\] = \\[([\\s\\S]*?)\\];`));
    return m ? [...m[1].matchAll(/"([a-z_:]+)"/g)].map((x) => x[1]) : [];
  };
  const citizen = listOf("CITIZEN");
  const field = [...citizen, ...listOf("FIELD_OFFICER").filter((p) => !citizen.includes(p))];
  const sizes = {};
  for (const m of rolePermissionsBlock(rbac).matchAll(/^\s{2}([a-z_]+):\s*(\[[\s\S]*?\]|[A-Z_]+),\s*$/gm)) {
    const body = m[2];
    const perms = body === "CITIZEN" ? [...citizen] : [];
    if (body !== "CITIZEN") {
      if (body.includes("...CITIZEN")) perms.push(...citizen);
      if (body.includes("...FIELD_OFFICER")) perms.push(...field);
      perms.push(...[...body.matchAll(/"([a-z_:]+)"/g)].map((x) => x[1]));
    }
    sizes[m[1]] = new Set(perms).size;
  }
  return sizes;
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

/**
 * Files whose content must not change without somebody deciding to change it.
 *
 * These are the deterministic layer: the rules that decide whether a child's
 * danger sign escalates, who may read what, which credentials may be set, and
 * whether a channel can actually reach a person. A behavioural test proves they
 * work today; a hash proves nobody altered them in a commit that was about
 * something else.
 */
export const GUARDED_FILES = [
  "src/server/ai/safety.ts",
  "src/server/ai/agents/risk.ts",
  "src/server/ai/agents/workflow.ts",
  "src/server/ai/protocols/engine.ts",
  "src/server/ai/language/gates.ts",
  "src/server/ai/review/gate.ts",
  "src/server/core/rbac.ts",
  "src/server/core/credentials.ts",
  "src/server/core/status.ts",
  "src/server/core/mfa.ts",
  "src/server/core/residency.ts",
  "src/server/channels/modes.ts",
];

export function collectInventory(root) {
  const schema = read(root, "src/server/db/schema.ts");
  const rbac = read(root, "src/server/core/rbac.ts");
  const credentials = read(root, "src/server/core/credentials.ts");
  const scheduler = read(root, "src/server/core/scheduler.ts");
  const slo = read(root, "src/server/core/slo.ts");
  const types = read(root, "src/server/ai/types.ts");
  const modes = read(root, "src/server/channels/modes.ts");
  // The driver lists are declared next to the credential allow-list, because
  // both halves of "this channel can send" are decided in the same place.
  const drivers = credentials;

  // pgTable("name", …) and pgTable(\n  "name", … are both in this schema.
  const tables = all(schema, /pgTable\(\s*"([a-z0-9_]+)"/g);

  // An enum losing a value is a breaking change that no type error catches at
  // the database boundary, so values are locked, not just the enum's name.
  const enums = {};
  for (const m of schema.matchAll(/pgEnum\(\s*"([a-z0-9_]+)"\s*,\s*\[([\s\S]*?)\]/g)) {
    enums[m[1]] = [...m[2].matchAll(/"([a-z0-9_]+)"/g)].map((v) => v[1]);
  }

  const routeFiles = walk(root, "src/app/api", (f) => f === "route.ts");
  const routes = routeFiles
    .map((f) => f.replace("src/app/api/", "").replace("/route.ts", ""))
    .sort();

  return {
    db: {
      tables,
      tableCount: tables.length,
      enums,
      migrations: walk(root, "drizzle", (f) => f.endsWith(".sql")),
    },
    api: {
      routes: routes.filter((r) => r.startsWith("v1/")),
      hooks: routes.filter((r) => r.startsWith("hooks/")),
      routeCount: routes.length,
    },
    rbac: {
      roles: [...(schema.match(/pgEnum\(\s*"user_role"\s*,\s*\[([\s\S]*?)\]/) ?? [])[1]
        ?.matchAll(/"([a-z_]+)"/g) ?? []].map((m) => m[1]),
      // The Permission union, one `| "name"` per line.
      permissions: all(
        rbac.slice(rbac.indexOf("export type Permission"), rbac.indexOf("const CITIZEN")),
        /\|\s*"([a-z_:]+)"/g,
      ),
      // The literal text of each role's grant, spreads included. Locking the
      // text rather than a count means narrowing a role is caught even when the
      // number of entries stays the same.
      roleGrants: Object.fromEntries(
        [...rolePermissionsBlock(rbac).matchAll(/^\s{2}([a-z_]+):\s*(\[[\s\S]*?\]|[A-Z_]+),\s*$/gm)].map((m) => [
          m[1],
          m[2].replace(/\s+/g, " ").trim(),
        ]),
      ),
      /**
       * Each role's resolved permission count.
       *
       * roleGrants locks the text of each role's line, which catches a change
       * to that line. It does not catch a permission removed from the shared
       * CITIZEN or FIELD_OFFICER list: every field role would quietly shrink
       * with all seven role lines byte-identical. This number does catch it.
       */
      roleGrantSizes: resolvedRoleSizes(rbac),
      moduleScope: (rbac.match(/ROLE_MODULE_SCOPE[\s\S]*?\{([\s\S]*?)\}/) ?? [])[1]
        ?.replace(/\s+/g, " ")
        .trim(),
    },
    ai: {
      agents: readdirSync(join(root, "src/server/ai/agents")).filter((f) => f.endsWith(".ts")).sort(),
      providers: readdirSync(join(root, "src/server/ai/providers")).filter((f) => f.endsWith(".ts")).sort(),
      capabilities: (types.match(/export type Capability\s*=\s*([^;]+);/) ?? [])[1]
        ?.match(/"([a-z]+)"/g)
        ?.map((s) => s.replaceAll('"', "")) ?? [],
    },
    scheduler: {
      steps: [...scheduler.matchAll(/step\(\s*"([a-z_]+)"/g)].map((m) => m[1]),
    },
    slo: {
      objectives: all(slo, /\{\s*id:\s*"([a-z_0-9]+)"/g),
    },
    credentials: {
      settable: all(credentials, /\{\s*name:\s*"([A-Z0-9_]+)"/g),
      neverSettable: [...(credentials.match(/NEVER_SETTABLE\s*=\s*\[([\s\S]*?)\]/) ?? [])[1]
        ?.matchAll(/"([A-Z_]+)"/g) ?? []].map((m) => m[1]),
    },
    channels: {
      // The operators the platform actually implements. An entry removed here
      // silently stops a deployment's configured channel from ever sending.
      smsDrivers: driverList(drivers, "SMS_DRIVERS"),
      voiceDrivers: driverList(drivers, "VOICE_DRIVERS"),
      whatsappDrivers: driverList(drivers, "WHATSAPP_DRIVERS"),
      // The three mode resolvers. Losing one means a channel stops consulting
      // the rule that decides whether it can really reach a person.
      modeResolvers: all(modes, /export function ([a-zA-Z]+)\(/g),
      adapters: readdirSync(join(root, "src/server/channels")).filter((f) => f.endsWith(".ts")).sort(),
    },
    pages: {
      public: walk(root, "src/app/(public)", (f) => f === "page.tsx").map((f) =>
        f.replace("src/app/(public)/", "").replace("/page.tsx", "")),
      app: walk(root, "src/app/(app)", (f) => f === "page.tsx").map((f) =>
        f.replace("src/app/(app)/", "").replace("/page.tsx", "")),
    },
    docs: {
      // The AI-OS document set. Eighteen files that took a long time to write
      // and that nothing else in the build would miss.
      aiOs: readdirSync(join(root, "docs/ai-os")).filter((f) => f.endsWith(".md")).sort(),
      core: readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).sort(),
      launchAudit: existsSync(join(root, "launch-audit"))
        ? readdirSync(join(root, "launch-audit")).filter((f) => f.endsWith(".md")).sort()
        : [],
      blogArticles: existsSync(join(root, "content/blog"))
        ? readdirSync(join(root, "content/blog")).filter((f) => f.endsWith(".md")).length
        : 0,
    },
    tests: {
      files: readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.ts")).sort(),
      fileCount: readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.ts")).length,
    },
    scripts: {
      files: readdirSync(join(root, "scripts")).sort(),
      npm: Object.keys(JSON.parse(read(root, "package.json")).scripts).sort(),
    },
    /** Content fingerprints of the deterministic layer. See GUARDED_FILES. */
    guarded: Object.fromEntries(GUARDED_FILES.map((f) => [f, sha256(read(root, f))])),
  };
}

/** Stable JSON, so the lock file diffs cleanly and byte-compares. */
export function serialise(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}
