import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { collectInventory, GUARDED_FILES, serialise, type Inventory } from "../scripts/inventory.mjs";

/**
 * Nothing changes or drops without somebody saying so.
 *
 * Every other test in this suite proves that what exists behaves correctly.
 * None of them notices when something stops existing. A route file deleted, a
 * permission removed from a role, a scheduler step taken out, a language
 * dropped from the enum, one of the eighteen AI-OS documents gone — each leaves
 * the suite green and the platform quietly smaller.
 *
 * This file compares the platform's surface against inventory.lock.json and
 * fails on any difference in either direction. A removal is the dangerous case;
 * an addition is caught too, because a surface that appears without anyone
 * looking at it is how a platform grows an unreviewed route.
 *
 * To declare a change: `npm run lock`, and commit the lock with the change that
 * caused it.
 */

const ROOT = new URL("..", import.meta.url).pathname;
const locked = JSON.parse(
  readFileSync(new URL("../inventory.lock.json", import.meta.url), "utf8"),
) as Inventory;
const current = collectInventory(ROOT);

/** Names what moved, rather than printing two large objects at each other. */
function drift(was: unknown, now: unknown, path = ""): string[] {
  if (Array.isArray(was) && Array.isArray(now)) {
    const gone = was.filter((v) => !now.includes(v));
    const added = now.filter((v) => !was.includes(v));
    const lines: string[] = [];
    if (gone.length) lines.push(`${path} DROPPED: ${gone.join(", ")}`);
    if (added.length) lines.push(`${path} added: ${added.join(", ")}`);
    if (!lines.length && JSON.stringify(was) !== JSON.stringify(now)) lines.push(`${path} reordered`);
    return lines;
  }
  if (was && now && typeof was === "object" && typeof now === "object") {
    const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
    return keys.flatMap((k) => {
      const a = (was as Record<string, unknown>)[k];
      const b = (now as Record<string, unknown>)[k];
      const next = path ? `${path}.${k}` : k;
      if (a === undefined) return [`${next} is NEW`];
      if (b === undefined) return [`${next} was REMOVED ENTIRELY`];
      return drift(a, b, next);
    });
  }
  return JSON.stringify(was) === JSON.stringify(now)
    ? []
    : [`${path}: was ${JSON.stringify(was)}, now ${JSON.stringify(now)}`];
}

describe("the platform's surface matches inventory.lock.json", () => {
  it("has not changed or dropped anything undeclared", () => {
    const lines = drift(locked, current);
    expect(
      lines,
      lines.length === 0
        ? ""
        : `\n\n${lines.length} undeclared change(s) to the platform's surface:\n\n  ${lines.join(
            "\n  ",
          )}\n\nIf every line is intended, declare it with:  npm run lock\nand commit inventory.lock.json alongside the change.\n`,
    ).toEqual([]);
  });

  it("serialises byte-identically, so the lock file never churns", () => {
    const onDisk = readFileSync(new URL("../inventory.lock.json", import.meta.url), "utf8");
    expect(serialise(current)).toBe(onDisk);
  });
});

/**
 * The deterministic layer, pinned by content.
 *
 * These files decide whether a child's danger sign escalates, who may read
 * what, which credentials may be set, and whether a channel can actually reach
 * a person. They are allowed to change — but never in a commit that was about
 * something else, and never without the hash moving in the diff where a
 * reviewer sees it.
 */
describe("the deterministic safety layer is pinned by content", () => {
  it("guards every file the platform's safety claims rest on", () => {
    // A file silently dropped from this list would disable its own guard.
    expect(GUARDED_FILES).toEqual(Object.keys(locked.guarded));
    expect(GUARDED_FILES.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of GUARDED_FILES) {
    it(`${file} is unchanged since the lock`, () => {
      expect(
        current.guarded[file],
        `${file} changed. If that was deliberate, run \`npm run lock\` and commit the lock with it.`,
      ).toBe(locked.guarded[file]);
    });
  }
});

/**
 * Floors, not equalities.
 *
 * The checks above catch any movement. These say what must never be true
 * regardless of what the lock happens to hold — so an operator who regenerates
 * the lock to silence a failure still cannot shrink the platform past the point
 * where its promises hold.
 */
describe("floors that a regenerated lock cannot lower", () => {
  it("keeps every role and the permission model", () => {
    expect(current.rbac.roles).toEqual([
      "citizen",
      "chw",
      "agri_officer",
      "teacher",
      "ngo",
      "gov_admin",
      "platform_admin",
    ]);
    expect(current.rbac.permissions.length).toBeGreaterThanOrEqual(25);
    // A citizen must never gain a permission that reads anyone else's data.
    expect(current.rbac.roleGrants.citizen).toBe("CITIZEN");
    expect(current.rbac.roleGrantSizes.citizen).toBe(5);
  });

  it("never quietly shrinks a role through the lists they share", () => {
    // Removing a permission from CITIZEN or FIELD_OFFICER leaves all seven role
    // lines byte-identical while every field role loses it.
    expect(current.rbac.roleGrantSizes).toEqual(locked.rbac.roleGrantSizes);
    for (const role of ["chw", "agri_officer", "teacher"]) {
      expect(current.rbac.roleGrantSizes[role]).toBeGreaterThanOrEqual(13);
    }
    // A partner organisation observes; it must never gain the power to act on a
    // citizen's case.
    expect(current.rbac.roleGrants.ngo).not.toContain("case:write");
    expect(current.rbac.roleGrants.ngo).not.toContain("case:escalate");
    // A government administrator supervises; holding the vendor keys is a
    // different job and stays with the platform operator.
    expect(current.rbac.roleGrants.gov_admin).not.toContain("admin:config");
    expect(current.rbac.roleGrants.gov_admin).not.toContain("user:manage");
    expect(current.rbac.roleGrants.gov_admin).not.toContain("dashboard:admin");
  });

  it("keeps all five national languages", () => {
    expect(current.db.enums.language_code).toEqual(["fr", "ln", "kg", "sw", "lua"]);
  });

  it("keeps all three service modules and the general fallback", () => {
    expect(current.db.enums.module_type).toEqual(["health", "agriculture", "education", "general"]);
  });

  it("keeps every citizen channel, including the ones a feature phone can reach", () => {
    for (const channel of ["ivr", "ussd", "sms", "whatsapp", "pwa"]) {
      expect(current.db.enums.channel_type).toContain(channel);
    }
  });

  it("keeps a voice notification channel, because the people who need an escalation may not read", () => {
    expect(current.db.enums.notification_channel).toContain("voice");
  });

  it("keeps the offline provider, which is the floor the whole platform stands on", () => {
    expect(current.ai.providers).toContain("mock.ts");
  });

  it("keeps all four model capabilities", () => {
    expect(current.ai.capabilities).toEqual(["llm", "vision", "stt", "tts"]);
  });

  it("keeps every secret that protects the console unsettable", () => {
    for (const name of [
      "DATA_ENCRYPTION_KEY",
      "SESSION_SECRET",
      "CRON_SECRET",
      "BOOTSTRAP_TOKEN",
      "ADMIN_RECOVERY_TOKEN",
      "OIDC_CLIENT_SECRET",
      "DATABASE_URL",
      "DATABASE_CA_CERT",
    ]) {
      expect(current.credentials.neverSettable).toContain(name);
      expect(current.credentials.settable).not.toContain(name);
    }
  });

  it("keeps the scheduler jobs that enforce retention, SLA and audit integrity", () => {
    for (const step of ["sla_sweep", "media_retention", "audit_chain", "acu_caps", "language_gates"]) {
      expect(current.scheduler.steps).toContain(step);
    }
  });

  it("keeps the readiness and emergency surfaces a citizen depends on", () => {
    expect(current.api.routes).toContain("v1/system/ready");
    expect(current.api.routes).toContain("v1/system/health");
    expect(current.pages.public).toContain("urgence");
  });

  it("keeps all nine provider webhooks", () => {
    expect(current.api.hooks.length).toBe(9);
  });

  it("keeps the AI-OS document set whole", () => {
    expect(current.docs.aiOs.length).toBe(18);
    expect(current.docs.aiOs).toContain("README.md");
    expect(current.docs.aiOs).toContain("17-production-readiness.md");
  });

  it("keeps the safety, security and residency documents", () => {
    for (const doc of ["SECURITY.md", "LAUNCH_READINESS.md", "ARCHITECTURE.md", "API.md", "DATA_RESIDENCY.md"]) {
      expect(current.docs.core).toContain(doc);
    }
  });

  it("never acquires a payment surface", () => {
    // The platform is free for citizens and has no payment system. This is the
    // guard that keeps "no payment gateway" true rather than remembered.
    const forbidden = /payment|checkout|stripe|wallet|merchant|settlement|billing|invoice|subscription/i;
    for (const route of current.api.routes) {
      expect(route, `payment-shaped route appeared: ${route}`).not.toMatch(forbidden);
    }
    for (const table of current.db.tables) {
      expect(table, `payment-shaped table appeared: ${table}`).not.toMatch(forbidden);
    }
    for (const name of current.credentials.settable) {
      expect(name, `payment-shaped credential appeared: ${name}`).not.toMatch(forbidden);
    }
  });
});
