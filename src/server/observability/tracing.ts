/**
 * Starts distributed tracing (NFR-O-01).
 *
 * Kept out of `instrumentation.ts` so the edge bundle never analyses Node APIs
 * it cannot run: this file is only ever reached through a dynamic import under
 * the Node.js runtime.
 */
export async function startTracing(endpoint: string): Promise<void> {
  const [{ NodeSDK }, { OTLPTraceExporter }, { resourceFromAttributes }, semconv] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
  ]);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [semconv.ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "congo-voice-ai-os",
      [semconv.ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.1.0",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }),
  });

  sdk.start();

  // A trace that outlives the process is no trace at all.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void sdk.shutdown().catch(() => undefined);
    });
  }
}
