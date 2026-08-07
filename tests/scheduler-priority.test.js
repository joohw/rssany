import { afterEach, describe, expect, it } from "vitest";
import * as scheduler from "../app/scheduler/index.ts";

afterEach(() => {
  scheduler.clearAll();
});

describe("manual source scheduling", () => {
  it("runs through an independent lane while scheduled pulls are saturated", async () => {
    let releaseScheduled;
    const scheduledBlocker = new Promise((resolve) => {
      releaseScheduled = resolve;
    });
    let scheduledStarted = false;

    const scheduled = scheduler.schedule("sources", "scheduled-1", async () => {
      scheduledStarted = true;
      await scheduledBlocker;
    }, { concurrency: 1 });

    await viWaitFor(() => scheduledStarted);

    let manualFinished = false;
    await scheduler.schedule("sources-manual", "manual-1", async () => {
      manualFinished = true;
    }, { concurrency: 1, priority: true });

    expect(manualFinished).toBe(true);
    releaseScheduled();
    await scheduled;
  });
});

async function viWaitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for scheduler");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
