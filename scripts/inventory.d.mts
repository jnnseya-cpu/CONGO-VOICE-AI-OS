/**
 * Types for the inventory extractor.
 *
 * The extractor is plain ESM so it runs with no build step, in CI and in a
 * test alike. This file gives it a checked shape, so the lock test stays as
 * strictly typed as the rest of the codebase.
 */

export interface Inventory {
  db: {
    tables: string[];
    tableCount: number;
    /** Enum name → its values, in declaration order. */
    enums: Record<string, string[]>;
    migrations: string[];
  };
  api: {
    routes: string[];
    hooks: string[];
    routeCount: number;
  };
  rbac: {
    roles: string[];
    permissions: string[];
    /** Role → the literal text of its grant, spreads included. */
    roleGrants: Record<string, string>;
    /** Role → permission count with CITIZEN and FIELD_OFFICER expanded. */
    roleGrantSizes: Record<string, number>;
    moduleScope: string | undefined;
  };
  ai: {
    agents: string[];
    providers: string[];
    /** Subdirectory of src/server/ai → its .ts files; "." is the directory itself. */
    modules: Record<string, string[]>;
    core: string[];
    capabilities: string[];
  };
  scheduler: { steps: string[] };
  slo: { objectives: string[] };
  credentials: { settable: string[]; neverSettable: string[] };
  channels: {
    smsDrivers: string[];
    voiceDrivers: string[];
    whatsappDrivers: string[];
    modeResolvers: string[];
    adapters: string[];
  };
  pages: { public: string[]; app: string[] };
  docs: { aiOs: string[]; core: string[]; launchAudit: string[]; blogArticles: number };
  tests: { files: string[]; fileCount: number };
  scripts: { files: string[]; npm: string[] };
  /** Guarded file path → the first 16 hex characters of its SHA-256. */
  guarded: Record<string, string>;
}

export declare const GUARDED_FILES: string[];
export declare function collectInventory(root: string): Inventory;
export declare function serialise(inventory: Inventory): string;
