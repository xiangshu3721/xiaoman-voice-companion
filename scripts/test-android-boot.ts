import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const home = readFileSync("app/page.tsx", "utf8");
const provider = readFileSync("lib/providers.ts", "utf8");
const mic = readFileSync("src/realtime/microphone-permission.ts", "utf8");
const check = (name: string, value: boolean) => assert.equal(value, true, name);

check("core UI boot trace exists", home.includes('mobileBootTrace.mark("CORE_UI_READY")'));
check("voice config is deferred off first render", home.includes("window.setTimeout(loadVoiceConfig, 1200)"));
check("ASR stall watchdog exists", home.includes("ASR_STALL") || home.includes("没有回传，正在无损重连"));
check("ASR onend schedules restart", provider.includes("this.scheduleRestart(Recognition)"));
check("ASR does not submit from provider", !provider.includes("submitMessage(") && !provider.includes("finalizeTurn("));
check("getUserMedia live track is authority", mic.includes("getUserMedia success plus a live audio track is authoritative"));
check("mobile diagnostics route exists", existsSync("app/mobile-diagnostics/page.tsx"));
check("global recovery page exists", existsSync("app/error.tsx"));

console.log("android boot audit passed: 8 invariants");

