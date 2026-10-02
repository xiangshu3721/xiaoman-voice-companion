import type { TranscriptAccumulatorState } from "./types";

export class TranscriptAccumulator {
  private state: TranscriptAccumulatorState = { committedTranscript: "", interimTranscript: "", segmentHistory: [] };
  reset() { this.state = { committedTranscript: "", interimTranscript: "", segmentHistory: [] }; }
  accept(text: string, isFinal: boolean) {
    const value = text.trim();
    if (!value) return this.state;
    if (isFinal) {
      const last = this.state.segmentHistory.at(-1);
      if (last !== value) {
        this.state.segmentHistory.push(value);
        this.state.committedTranscript = appendSegment(this.state.committedTranscript, value);
      }
      this.state.interimTranscript = "";
    } else {
      this.state.interimTranscript = value;
    }
    return this.state;
  }
  snapshot() { return { ...this.state, segmentHistory: [...this.state.segmentHistory] }; }
  fullText() { return [this.state.committedTranscript, this.state.interimTranscript].filter(Boolean).join("").trim(); }
  finalText() { return this.fullText(); }
}

function appendSegment(committed: string, next: string) {
  if (!committed) return next;
  if (committed.endsWith(next)) return committed;
  if (next.startsWith(committed)) return next;
  const maximumOverlap = Math.min(committed.length, next.length);
  for (let overlap = maximumOverlap; overlap >= 2; overlap -= 1) {
    if (committed.slice(-overlap) === next.slice(0, overlap)) return committed + next.slice(overlap);
  }
  return committed + next;
}
