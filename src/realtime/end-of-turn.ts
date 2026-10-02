const UNFINISHED = /(?:因为|但是|然后|就是|其实|我觉得|我想说|你知道吗|问题是|主要是|还有|而且|所以我|如果|虽然|我刚才|就是说|怎么说呢|我其实想)$/;

export type EndOfTurnInput = {
  silenceDuration: number;
  vadActive: boolean;
  interimTranscript: string;
  lastFinalSegmentTime: number | null;
  semanticCompleteness: number;
  utteranceDuration: number;
  hasInterimTranscript?: boolean;
  now?: number;
};

export function detectEndOfTurn(input: EndOfTurnInput) {
  const now = input.now ?? Date.now();
  const text = input.interimTranscript.trim();
  const hasUnfinishedConnector = UNFINISHED.test(text);
  const finalAge = input.lastFinalSegmentTime == null ? 0 : now - input.lastFinalSegmentTime;
  const connectorGrace = hasUnfinishedConnector && input.silenceDuration < 1800;
  if (!text) return { shouldFinalize: false, confidence: 0, reason: "no_transcript" };
  if (input.utteranceDuration < 350 || input.silenceDuration < 450 || input.vadActive || connectorGrace) return { shouldFinalize: false, confidence: 0.2, reason: "still_speaking_or_grace" };
  if (input.silenceDuration < 750) return { shouldFinalize: false, confidence: 0.45, reason: "possible_end" };
  const hasInterimTranscript = input.hasInterimTranscript ?? Boolean(input.interimTranscript.trim());
  if (input.silenceDuration < 1100 && (hasInterimTranscript || finalAge < 700)) return { shouldFinalize: false, confidence: 0.6, reason: "waiting_for_asr_final" };
  const confidence = Math.min(1, 0.65 + Math.min(0.25, input.silenceDuration / 8000) + Math.min(0.1, input.semanticCompleteness * 0.1));
  return { shouldFinalize: true, confidence, reason: "joint_silence_vad_semantics" };
}

export function semanticCompleteness(text: string) {
  const value = text.trim();
  if (!value) return 0;
  if (UNFINISHED.test(value)) return 0.1;
  if (/[。！？!?]$/.test(value)) return 1;
  return Math.min(0.9, 0.45 + value.length / 80);
}
