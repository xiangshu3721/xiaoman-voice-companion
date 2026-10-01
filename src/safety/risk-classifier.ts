import type { ChatMessage } from "@/lib/providers";
import type { RiskLevel, SafetyAssessment } from "./types";

const ordinaryExpressions = /(气死我了|烦死了|累死了|笑死了|我恨你|你去死|去死吧)/;
const criticalSelfHarm = /((我|已经|现在|今晚|马上).*(自杀| suicid|结束生命|跳楼|割腕|割脉|喝药|上吊))|(准备.*(伤害自己|自残))|(马上.*(伤害自己|自残))/i;
const highSelfHarm = /(不想活了|不想活下去|活着没意思|想死了|想去死|想自杀|想伤害自己|自残|结束自己的生命)/i;
const harmOther = /(我(要|准备|打算)?(杀了|弄死|捅死|伤害)\s*\S+|我要杀人|我要伤害他人|准备去找他算账)/;
const immediateDanger = /(已经(割|吃药|跳|伤害自己)|手里有刀|已经动手|有人正在伤害我|他正在打我|她正在打我|现在就要死)/;
const severeDistress = /(撑不住了|快崩溃了|崩溃了|彻底崩了|控制不住自己|喘不过气|呼吸不过来|极度痛苦|我受不了了)/;
const ambiguousConcern = /(不想面对明天|没有意义了|想消失|不想醒来|真的好累|没人需要我|我完了|真想撞墙|想撞墙)/;

function assessment(level: RiskLevel, signals: string[], confidence: number, currentTextRisk: boolean): SafetyAssessment {
  const responseMode = level === "CRITICAL" ? "urgent" : level === "HIGH" ? "stabilize" : level === "MEDIUM" ? "check_in" : level === "LOW" ? "check_in" : "none";
  return { active: level === "MEDIUM" || level === "HIGH" || level === "CRITICAL", conflictLocked: level === "HIGH" || level === "CRITICAL", riskLevel: level, signals, confidence, responseMode, currentTextRisk };
}

export function classifyRisk(text: string, history: ChatMessage[] = []): SafetyAssessment {
  const clean = text.trim();
  const recent = history.filter((message) => message.role === "user").slice(-5).map((message) => message.content).join("\n");
  const combined = `${recent}\n${clean}`;
  if (ordinaryExpressions.test(clean) && !criticalSelfHarm.test(clean) && !highSelfHarm.test(clean) && !harmOther.test(clean)) {
    return assessment("NONE", [], 0.04, false);
  }
  if (immediateDanger.test(clean) || criticalSelfHarm.test(clean)) {
    return assessment("CRITICAL", [immediateDanger.test(clean) ? "IMMEDIATE_DANGER" : "EXPLICIT_SELF_HARM_PLAN"], 0.98, true);
  }
  if (harmOther.test(clean)) return assessment("HIGH", ["EXPLICIT_HARM_OTHER"], 0.95, true);
  if (highSelfHarm.test(clean)) return assessment("HIGH", ["EXPLICIT_SELF_HARM_SIGNAL"], 0.94, true);
  if (severeDistress.test(clean) && /(不想活|自杀|伤害自己|没人需要我|消失)/.test(combined)) {
    return assessment("HIGH", ["SEVERE_DISTRESS", "CONTEXTUAL_SELF_HARM_CONCERN"], 0.86, true);
  }
  if (severeDistress.test(clean)) return assessment("MEDIUM", ["SEVERE_DISTRESS"], 0.7, true);
  if (ambiguousConcern.test(clean)) return assessment("MEDIUM", ["AMBIGUOUS_DISTRESS"], 0.62, true);
  return assessment("NONE", [], 0.08, false);
}
