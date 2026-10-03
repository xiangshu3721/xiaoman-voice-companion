import { ASR_BENCHMARK_CASES } from "../src/asr/benchmark-cases";
import { assessASRQuality, conservativelyCorrectTranscript } from "../src/asr/transcript";
import { createUserSemanticLedger } from "../src/semantic/semantic-grounding";
import { analyzeUserSemantic } from "../src/semantic/user-semantic-analyzer";
import { validateCurrentTurnClaims } from "../src/semantic/response-claim-validator";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

check("benchmark has 100 Chinese test sentences", ASR_BENCHMARK_CASES.length >= 100);
const corrected = conservativelyCorrectTranscript({ rawAsrText: "我们又吵价了，已经冷栈好几天", confidence: 0.96 });
check("safe domain corrections are applied", corrected.finalUserText === "我们又吵架了，已经冷战好几天");
check("raw ASR is preserved", corrected.rawAsrText === "我们又吵价了，已经冷栈好几天");
const low = conservativelyCorrectTranscript({ rawAsrText: "对不起", confidence: 0.38, alternatives: ["我不对"], speechDurationMs: 9000, asrSessionCount: 3 });
check("low confidence does not invent text", low.finalUserText === low.correctedText && low.finalUserText === "对不起");
check("low confidence critical text is guarded", assessASRQuality(low).semanticCriticalAmbiguity);
const adversarial = conservativelyCorrectTranscript({ rawAsrText: "我说对不起", confidence: 0.82, alternatives: ["我没说对不起"] });
check("critical alternative disagreement is marked", assessASRQuality(adversarial).semanticCriticalAmbiguity);
const overlap = conservativelyCorrectTranscript({ rawAsrText: "我没有说对不起" });
check("negated apology is not positive apology", !createUserSemanticLedger({ rawText: overlap.rawAsrText, correctedText: overlap.correctedText, finalText: overlap.finalUserText, analysis: analyzeUserSemantic(overlap.finalUserText) }).apologyEvidence.detected);

const cases = [
  ["我没有说对不起", "negated"], ["你别生气了", "peace"], ["我爱你", "affection"], ["原谅我吧", "forgiveness"],
  ["对不起，我刚才说重了", "explicit"], ["对不起个屁，我又没错", "sarcastic"], ["对不起行了吧", "perfunctory"], ["我才不跟你道歉", "negated"],
] as const;
for (const [text, label] of cases) {
  const transcript = conservativelyCorrectTranscript({ rawAsrText: text });
  const ledger = createUserSemanticLedger({ rawText: text, correctedText: text, finalText: text, analysis: analyzeUserSemantic(text) });
  check(`${label}: ${text}`, label === "explicit" ? ledger.apologyEvidence.type === "EXPLICIT" : label === "perfunctory" ? ledger.apologyEvidence.type === "PERFUNCTORY" : label === "sarcastic" ? ledger.apologyEvidence.type === "SARCASTIC" : !ledger.apologyEvidence.detected);
  if (label === "explicit") check("explicit apology also has ownership", ledger.explicitIntents.includes("OWNERSHIP"));
  if (label === "peace") check("peace offering is explicit", ledger.explicitIntents.includes("PEACE_OFFERING"));
  if (label === "affection") check("affection is explicit", ledger.explicitIntents.includes("AFFECTION"));
  if (label === "forgiveness") check("forgiveness request is not apology", ledger.explicitIntents.includes("FORGIVENESS_REQUEST") && !ledger.apologyEvidence.detected);
  void transcript;
}

const noApology = createUserSemanticLedger({ rawText: "我只是想让你先听我说", correctedText: "我只是想让你先听我说", finalText: "我只是想让你先听我说", analysis: analyzeUserSemantic("我只是想让你先听我说") });
check("unsupported apology claim is rejected", !validateCurrentTurnClaims("你刚才说对不起了，那就算了。", noApology).valid);
const explicitApology = createUserSemanticLedger({ rawText: "对不起，我刚才说重了", correctedText: "对不起，我刚才说重了", finalText: "对不起，我刚才说重了", analysis: analyzeUserSemantic("对不起，我刚才说重了") });
check("supported apology claim is accepted", validateCurrentTurnClaims("我听见你刚才说对不起了。", explicitApology).valid);
check("reference-like breakup claim is rejected without evidence", !validateCurrentTurnClaims("你说要分手，那你到底想怎样？", noApology).valid);

for (const sentence of ASR_BENCHMARK_CASES) {
  const ledger = createUserSemanticLedger({ rawText: sentence, correctedText: sentence, finalText: sentence, analysis: analyzeUserSemantic(sentence) });
  check(`semantic ledger remains total for case ${ASR_BENCHMARK_CASES.indexOf(sentence) + 1}`, Boolean(ledger.finalText));
}

console.log(`ASR/semantic V7: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
