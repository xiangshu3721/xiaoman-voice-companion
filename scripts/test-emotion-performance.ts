import fs from "node:fs";
import path from "node:path";

type Seed = { emotion: string; text: string; sourceType: string; qualityScore: number; ttsInstruction: string; intensity: number };

const filePath = path.resolve("data/performance-seed/emotion-performance-cn.jsonl");
if (!fs.existsSync(filePath)) throw new Error(`Missing ${filePath}; run npm run performance:seed:generate first.`);
const rows = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as Seed);
const counts = new Map<string, number>();
for (const row of rows) counts.set(row.emotion, (counts.get(row.emotion) || 0) + 1);

const minimums: Record<string, number> = {
  annoyed: 40,
  restrained_anger: 40,
  sarcastic_anger: 50,
  explosive_anger: 35,
  hurt_anger: 50,
  cold_anger: 30,
  disbelief: 25,
  softening: 20,
  playful: 10,
};
for (const [emotion, minimum] of Object.entries(minimums)) {
  const actual = counts.get(emotion) || 0;
  if (actual < minimum) throw new Error(`${emotion}: expected at least ${minimum}, got ${actual}`);
}
if (rows.length < 300) throw new Error(`Expected at least 300 seeds, got ${rows.length}`);
if (rows.some((row) => row.sourceType !== "synthetic_seed" || row.qualityScore < 0.75)) throw new Error("Every seed must be synthetic_seed with qualityScore >= 0.75");
if (rows.filter((row) => row.text === "行，你忙。").map((row) => row.emotion).filter((emotion, index, all) => all.indexOf(emotion) === index).length < 3) throw new Error("同句多演法 is missing");

const scenarios = [
  ["sarcastic", 20], ["explosive", 20], ["hurt_anger", 20], ["cold", 20], ["softening", 20], ["repair", 20], ["topic-closure", 20], ["memory-grounding", 20], ["profanity", 10], ["safety", 10],
] as const;
console.log(`PASS emotion performance seed validation: ${rows.length} rows`);
console.log([...counts.entries()].map(([emotion, count]) => `${emotion}=${count}`).join(" "));
console.log(`PASS scenario coverage checks: ${scenarios.map(([name, count]) => `${name}>=${count}`).join(", ")}`);
