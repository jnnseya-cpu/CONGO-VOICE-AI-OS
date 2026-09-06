/**
 * Fire-and-forget work started by a channel that must answer immediately.
 *
 * USSD sessions are killed by the operator after a few seconds and telephony webhooks must
 * ACK fast, so the answer is produced after the response is sent and delivered over SMS or
 * WhatsApp. The promises are tracked so tests (and a graceful shutdown) can wait for them.
 */
import "server-only";

const holder = globalThis as unknown as { __cvosBackground?: Set<Promise<unknown>> };

function tasks(): Set<Promise<unknown>> {
  return (holder.__cvosBackground ??= new Set());
}

export function runInBackground(work: Promise<unknown>): void {
  const tracked = work.catch((err: unknown) => {
    console.error("[channels:background]", err);
  });
  tasks().add(tracked);
  void tracked.finally(() => tasks().delete(tracked));
}

/** Waits for every background task started so far. */
export async function awaitBackground(): Promise<void> {
  while (tasks().size > 0) {
    await Promise.allSettled([...tasks()]);
  }
}

export function pendingBackgroundCount(): number {
  return tasks().size;
}
