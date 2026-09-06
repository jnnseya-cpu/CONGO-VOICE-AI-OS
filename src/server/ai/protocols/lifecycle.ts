/** Lifecycle states shared by protocol, prompt and knowledge versions. */
export const LIFECYCLE_STATUSES = ["draft", "review", "approved", "canary", "active", "retired"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
