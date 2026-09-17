import type { ExitTicket, TeamMember } from "./data";
import { evaluateValueAnswer } from "./exit-ticket-values";
import { exitTicketKey } from "./team-attendance";

export type ExitTicketMatchItem = { id: string; prompt: string; answer: string };

export const KNOWLEDGE_MATCHES: readonly ExitTicketMatchItem[] = [
  { id: "collapsed-box", prompt: "กล่องยุบ สัมพันธ์กับสมบัติใด", answer: "ความต้านทานแรงกดทับ" },
  { id: "impact-damage", prompt: "สิ่งของภายในเสียหายจากแรงกระแทก สัมพันธ์กับสมบัติใด", answer: "ความสามารถในการลดความเสียหายจากแรงกระแทก" },
  { id: "wet-box", prompt: "กล่องเปียก สัมพันธ์กับสมบัติใด", answer: "การดูดซับน้ำของวัสดุ" },
];

export const PROCESS_MATCHES: readonly ExitTicketMatchItem[] = [
  { id: "dent-trace", prompt: "รอยยุบ คาดว่าเกิดจาก", answer: "แรงกด" },
  { id: "impact-trace", prompt: "รอยบุบหรือสิ่งของภายในเสียหาย คาดว่าเกิดจาก", answer: "แรงกระแทก" },
  { id: "wet-trace", prompt: "รอยเปียก คาดว่าเกิดจาก", answer: "น้ำ" },
];

const EXIT_ANSWER_ALIASES: Record<string, string> = {
  "ความสามารถในการช่วยลดความเสียหายจากแรงกระแทก": "ความสามารถในการลดความเสียหายจากแรงกระแทก",
  "การดูดซับน้ำและความสามารถในการป้องกันน้ำซึมผ่าน": "การดูดซับน้ำของวัสดุ",
};

export function readExitTicketMatches(value: string, items: readonly ExitTicketMatchItem[]) {
  const matches: Record<string, string> = {};
  const lines = value.split("\n");
  items.forEach((item, index) => {
    const line = lines[index];
    const answer = items.map((entry) => entry.answer).find((option) => line?.includes(option)
      || Object.entries(EXIT_ANSWER_ALIASES).some(([legacy, current]) => current === option && line?.includes(legacy)));
    if (answer) matches[item.id] = answer;
  });
  return matches;
}

export function isStructuredExitTicketComplete(ticket?: ExitTicket) {
  if (!ticket) return false;
  const knowledgeMatches = readExitTicketMatches(ticket.k, KNOWLEDGE_MATCHES);
  const processMatches = readExitTicketMatches(ticket.p, PROCESS_MATCHES);
  return Object.keys(knowledgeMatches).length === KNOWLEDGE_MATCHES.length
    && Object.keys(processMatches).length === PROCESS_MATCHES.length
    && evaluateValueAnswer(ticket.v).complete;
}

function ticketForMember(tickets: Record<string, ExitTicket>, member: TeamMember, index: number) {
  return tickets[exitTicketKey(member, index)]
    ?? tickets[`student-${member.position ?? index}`]
    ?? tickets[member.name];
}

export type ExitTicketProgress = {
  completed: number;
  total: number;
  percent: number;
  complete: boolean;
};

/** Count students whose full K-P-V exit ticket is saved, while retaining legacy answer keys. */
export function exitTicketProgress(members: TeamMember[], tickets: Record<string, ExitTicket> = {}): ExitTicketProgress {
  const total = members.length;
  const completed = members.filter((member, index) => isStructuredExitTicketComplete(ticketForMember(tickets, member, index))).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    complete: total > 0 && completed === total,
  };
}
