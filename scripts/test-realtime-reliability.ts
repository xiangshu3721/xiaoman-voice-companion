import assert from "node:assert/strict";
import { analyzeUserSemantic } from "@/src/semantic/user-semantic-analyzer";
import { detectEndOfTurn } from "@/src/realtime/end-of-turn";
import { noveltyReport } from "@/src/realtime/response-novelty";
import { TranscriptAccumulator } from "@/src/realtime/transcript-accumulator";

const base = { vadActive: false, lastFinalSegmentTime: Date.now() - 2000, semanticCompleteness: 1, utteranceDuration: 3000 };
const check = (name: string, condition: boolean) => { assert.equal(condition, true, name); };

check("first speech grace", !detectEndOfTurn({ ...base, silenceDuration: 500, interimTranscript: "我刚才想说" }).shouldFinalize);
check("unfinished connector protection", !detectEndOfTurn({ ...base, silenceDuration: 1800, interimTranscript: "我其实想" }).shouldFinalize);
check("700ms possible end waits", !detectEndOfTurn({ ...base, silenceDuration: 900, interimTranscript: "我回来了" }).shouldFinalize);
check("1200ms joint detector still waits for final", !detectEndOfTurn({ ...base, silenceDuration: 1200, interimTranscript: "我回来了" }).shouldFinalize);
check("complete turn finalizes after silence", detectEndOfTurn({ ...base, silenceDuration: 1900, interimTranscript: "我回来了" }).shouldFinalize);
check("long speech still finalizes", detectEndOfTurn({ ...base, silenceDuration: 2000, interimTranscript: "我说了很多很多内容" , utteranceDuration: 60000 }).shouldFinalize);
check("quiet microphone does not invent a turn", !detectEndOfTurn({ ...base, silenceDuration: 5000, interimTranscript: "" }).shouldFinalize);
check("VAD activity keeps turn open", !detectEndOfTurn({ ...base, silenceDuration: 2200, vadActive: true, interimTranscript: "我还没说完" }).shouldFinalize);
const accumulator = new TranscriptAccumulator();
accumulator.accept("我刚才", true); accumulator.accept("其实", true); accumulator.accept("其实", true); accumulator.accept("想说但是", false);
check("three ASR segments concatenate once", accumulator.finalText() === "我刚才其实");
check("interim is not committed", accumulator.snapshot().interimTranscript === "想说但是");
const negated = analyzeUserSemantic("对不起什么啊，我又没错");
const positive = analyzeUserSemantic("对不起，刚才是我不好");
check("partial apology is overridden by final negation", negated.negatedIntents.includes("APOLOGY") && !negated.explicitIntents.includes("APOLOGY"));
check("direct apology has evidence", positive.explicitIntents.includes("APOLOGY") && positive.evidence.some((item) => item.claim === "APOLOGY"));
const prior = [{ role: "assistant", content: "行，我记着了" }] as const;
const novelty = noveltyReport("我听见你在道歉了，具体说是哪一句", [...prior], "我跟你道歉了", analyzeUserSemantic("我跟你道歉了"));
check("novelty guard spots a fresh reply", novelty.responseNoveltyScore > 0.5 && novelty.addressesLatestDelta);
const duplicate = noveltyReport("好，我记住了", [...prior], "我饿了", analyzeUserSemantic("我饿了"));
check("novelty guard spots repeated acknowledgement", duplicate.semanticDuplicateScore >= 0.7);
check("latest delta remains visible", novelty.latestDeltaScore > 0);

console.log("realtime reliability checks passed: 15 scenarios");
