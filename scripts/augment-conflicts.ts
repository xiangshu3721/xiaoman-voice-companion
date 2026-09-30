import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = process.argv[2] || join(process.cwd(), "data", "conflicts", "episodes.json");
const output = process.argv[3] || join(process.cwd(), "data", "raw", "augmented.json");
const records = JSON.parse(readFileSync(input, "utf8")) as Array<Record<string, any>>;
const variants = records.slice(0, 50).map((record, index) => {
  const turns = (record.turns || []).map((turn: Record<string, any>, turnIndex: number) => ({ ...turn, text: turnIndex === 0 ? `${turn.text} 你先别急着把它说成小事。` : turn.text }));
  return { ...record, id: `${record.id}_A${String(index + 1).padStart(3, "0")}`, sourceType: "synthetic", sourceReference: `augment://${record.id}`, qualityScore: Math.max(0.7, Number(record.qualityScore || 0.8) - 0.03), turns, needsHumanReview: true };
});
writeFileSync(output, `${JSON.stringify(variants, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ input, output, augmented: variants.length }, null, 2));
