type WatchdogState = "PREPARING_MIC" | "LISTENING" | "RECOVERING_ASR";

class ReadinessWatchdogModel {
  readyRef = false;
  generation = 0;
  state: WatchdogState = "PREPARING_MIC";
  stopCount = 0;
  recoveryCount = 0;
  timer: ReturnType<typeof setTimeout> | null = null;

  start(delayMs: number) {
    this.clearTimer();
    const generation = ++this.generation;
    this.readyRef = false;
    this.timer = setTimeout(() => {
      const isCurrentGeneration = generation === this.generation;
      if (isCurrentGeneration) this.timer = null;
      if (!isCurrentGeneration || this.readyRef) return;
      this.stopCount += 1;
      this.recoveryCount += 1;
      this.state = "RECOVERING_ASR";
    }, delayMs);
    return generation;
  }

  onReady(generation: number) {
    if (generation !== this.generation) return;
    this.clearTimer();
    this.readyRef = true;
    this.state = "LISTENING";
  }

  stop() {
    this.clearTimer();
    this.generation += 1;
    this.readyRef = false;
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

async function run() {
  // A: onReady before 2.8s must prevent false recovery.
  const a = new ReadinessWatchdogModel();
  const aGeneration = a.start(12);
  await wait(2);
  a.onReady(aGeneration);
  await wait(20);
  assert(a.stopCount === 0 && a.state === "LISTENING", "A failed: ready ASR was recovered incorrectly");

  // B: a stale timeout from an old generation must not affect the new one.
  const b = new ReadinessWatchdogModel();
  const bOldGeneration = b.start(30);
  const bNewGeneration = b.start(12);
  b.onReady(bNewGeneration);
  await wait(35);
  assert(bOldGeneration !== bNewGeneration && b.stopCount === 0 && b.state === "LISTENING", "B failed: stale generation affected current ASR");

  // C: no onReady must still recover.
  const c = new ReadinessWatchdogModel();
  c.start(8);
  await wait(20);
  assert(c.stopCount === 1 && c.recoveryCount === 1 && c.state === "RECOVERING_ASR", "C failed: missing onReady did not recover");

  // D: onReady must clear the watchdog timer.
  const d = new ReadinessWatchdogModel();
  const dGeneration = d.start(25);
  d.onReady(dGeneration);
  assert(d.timer === null && d.readyRef, "D failed: onReady did not clear watchdog");

  // E: stop/reset followed by a new start must invalidate old callbacks.
  const e = new ReadinessWatchdogModel();
  const eOldGeneration = e.start(8);
  e.stop();
  const eNewGeneration = e.start(25);
  e.onReady(eOldGeneration);
  await wait(15);
  assert(eOldGeneration !== eNewGeneration && e.stopCount === 0 && e.state === "PREPARING_MIC", "E failed: old callback affected post-reset ASR");
  e.onReady(eNewGeneration);

  console.log("ASR readiness watchdog regression tests passed: A-E");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
