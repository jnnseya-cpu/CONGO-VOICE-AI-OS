/**
 * Distributed tracing (NFR-O-01).
 *
 * One turn crosses a channel adapter, the orchestrator, several agents, the AI
 * gateway and the database. When a citizen says the answer took too long, the
 * question is which of those it was, and no amount of per-service logging
 * answers it. A trace does.
 *
 * Off unless an endpoint is configured: a platform that has to run on one
 * machine in a health zone should not be opening connections to a collector
 * that is not there, and tracing must never be the reason a turn fails.
 */
export async function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startTracing } = await import("@server/observability/tracing");
    await startTracing(endpoint);
  } catch (err) {
    // Never fatal: a missing collector must not stop the platform answering.
    console.warn("[otel] tracing not started:", err instanceof Error ? err.message : err);
  }
}
