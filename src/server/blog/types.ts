/**
 * The blog contract now lives in @shared/blog, because the components that
 * render these shapes run in the browser and may not reach into the server.
 * Re-exported here so every existing server-side import keeps working.
 */
export * from "@shared/blog";
