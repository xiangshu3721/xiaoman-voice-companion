import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = process.argv[2] || join(process.cwd(), "data", "raw", "import.json");
if (!existsSync(input)) throw new Error(`Input not found: ${input}`);
const records = JSON.parse(readFileSync(input, "utf8")) as Array<Record<string, unknown>>;
const seen = new Set<string>();
const normalized = records.filter((record) => {
  const id = String(record.id || "");
  if (!id || seen.has(id)) return false;
  seen.add(id);
  return true;
}).map((record) => ({ ...record, qualityScore: Number(record.qualityScore || 0), needsHumanReview: record.needsHumanReview !== false }));
const output = process.argv[3] || join(process.cwd(), "data", "conflicts", "imported.json");
writeFileSync(output, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ input, output, records: normalized.length }, null, 2));
