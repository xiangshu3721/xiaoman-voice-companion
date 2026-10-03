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
        this.state.committedTranscript = [this.state.committedTranscript, value].filter(Boolean).join("");
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
