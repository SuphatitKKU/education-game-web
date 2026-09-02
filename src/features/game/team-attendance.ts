import type { ExitTicket, TeamMember } from "./data";

export function attendingMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((member) => member.present !== false);
}

export function exitTicketKey(member: TeamMember, fallbackIndex: number): string {
  if (member.id) return `member-${member.id}`;
  return `student-${member.position ?? fallbackIndex}`;
}

export function reconcileExitTickets(
  previousMembers: TeamMember[],
  nextMembers: TeamMember[],
  tickets: Record<string, ExitTicket>,
): Record<string, ExitTicket> {
  const reconciled = { ...tickets };
  nextMembers.forEach((member, nextIndex) => {
    const previousIndex = previousMembers.findIndex((candidate) => (
      member.id && candidate.id
        ? member.id === candidate.id
        : member.name === candidate.name && member.avatar === candidate.avatar
    ));
    if (previousIndex < 0) return;
    const targetKey = exitTicketKey(member, nextIndex);
    if (reconciled[targetKey]) return;
    const previous = previousMembers[previousIndex];
    const sourceKey = exitTicketKey(previous, previousIndex);
    const legacyKey = `student-${previous.position ?? previousIndex}`;
    const previousTicket = tickets[sourceKey] ?? tickets[legacyKey] ?? tickets[previous.name];
    if (previousTicket) reconciled[targetKey] = previousTicket;
  });
  return reconciled;
}
