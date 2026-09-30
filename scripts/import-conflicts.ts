import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run conflicts:import -- data/raw/file.jsonl");
const raw = readFileSync(input, "utf8").trim();
const records = input.endsWith(".jsonl") ? raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : JSON.parse(raw);
const list = Array.isArray(records) ? records : [records];
const anonymize = (value: string) => value
  .replace(/1[3-9]\d{9}/g, "[手机号]")
  .replace(/\b\d{15,18}\b/g, "[证件号]")
  .replace(/微信(?:号|ID)?[:：]?\s*[A-Za-z0-9_-]+/gi, "微信[账号]")
  .replace(/(?:北京|上海|广州|深圳)市?/g, "[城市]");
const normalized = list.map((record, index) => ({
  ...record,
  id: record.id || `IMPORTED_${String(index + 1).padStart(4, "0")}`,
  sourceType: record.sourceType || "human",
  sourceReference: record.sourceReference || `raw://${basename(input)}`,
  consentStatus: record.consentStatus || "pending_review",
  copyrightStatus: record.copyrightStatus || "pending_review",
  privacyStatus: record.privacyStatus || "anonymized",
  needsHumanReview: true,
  turns: (record.turns || []).map((turn: { text?: string }) => ({ ...turn, text: anonymize(String(turn.text || "")) })),
}));
const output = join(process.cwd(), "data", "raw", `${basename(input).replace(/\.[^.]+$/, "")}.normalized.json`);
writeFileSync(output, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ input, output, records: normalized.length }, null, 2));
