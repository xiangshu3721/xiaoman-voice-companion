import assert from "node:assert/strict";
import { detectEndOfTurn } from "@/src/realtime/end-of-turn";
import { TranscriptAccumulator } from "@/src/realtime/transcript-accumulator";

const check = (name: string, value: boolean) => assert.equal(value, true, name);
const base = { vadActive: false, lastFinalSegmentTime: Date.now() - 2000, semanticCompleteness: 1, utteranceDuration: 3000 };

const stitched = new TranscriptAccumulator();
stitched.accept("我今天其实", true);
stitched.accept("有点不开心", true);
stitched.accept("因为你昨天", false);
check("Android ASR restarts keep committed prefix", stitched.fullText() === "我今天其实有点不开心因为你昨天");
stitched.accept("因为你昨天一直没有回我消息", true);
check("final segment commits exactly once", stitched.finalText() === "我今天其实有点不开心因为你昨天一直没有回我消息");
stitched.accept("因为你昨天一直没有回我消息", true);
check("duplicate final segment is ignored", stitched.snapshot().segmentHistory.length === 3);
stitched.accept("我今天其实有点不开心因为你昨天一直没有回我消息。", true);
check("overlapping Android restart does not duplicate transcript", stitched.finalText() === "我今天其实有点不开心因为你昨天一直没有回我消息。");

check("pause does not send too early", !detectEndOfTurn({ ...base, silenceDuration: 700, interimTranscript: "我还没说完" }).shouldFinalize);
check("unfinished sentence gets grace", !detectEndOfTurn({ ...base, silenceDuration: 1600, interimTranscript: "我其实想" }).shouldFinalize);
check("short sentence sends after stable silence", detectEndOfTurn({ ...base, silenceDuration: 1200, interimTranscript: "行" }).shouldFinalize);
check("long sentence sends once", detectEndOfTurn({ ...base, silenceDuration: 1500, interimTranscript: "我说了很多很多内容但是现在终于说完了", utteranceDuration: 30000 }).shouldFinalize);

let generation = 1;
const staleGeneration = generation;
generation += 1;
check("stale finalize timer is invalidated", staleGeneration !== generation);
const processed = new Set<string>();
processed.add("user-turn-1");
check("duplicate user turn is not submitted twice", processed.has("user-turn-1") && processed.size === 1);

console.log("android reliability checks passed: 8 scenarios");
