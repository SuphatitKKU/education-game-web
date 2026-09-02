import { EMPTY_SAVE, type GameSave, type Stage, type TeamMember } from "@/features/game/data";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  ActiveRunRef,
  LearningEvent,
  LearningEventInput,
  LegacyBundle,
  StudentResponse,
  TeacherTeamDetail,
  TeamOverview,
  TrackedRun,
  TrackedTeamMember,
} from "./types";

const OUTBOX_KEY = "parcel-lab-supabase-outbox-v1";
const SAVE_CACHE_KEY = "parcel-lab-web-save-v1";

type DbMember = { id: string; name: string; avatar: string; position: number; is_active?: boolean };
type DbRun = {
  id: string;
  team_id: string;
  status: "in_progress" | "completed";
  current_stage: Stage;
  save_state: GameSave;
  revision: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  legacy_run_id?: string | null;
};
type DbTeam = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  team_members?: DbMember[];
  game_runs?: DbRun[];
};

export type OutboxItem = {
  id: string;
  run: ActiveRunRef;
  save: GameSave;
  events: LearningEventInput[];
  complete: boolean;
  createdAt: string;
};

export class RevisionConflictError extends Error {
  constructor(public readonly serverRun: TrackedRun) {
    super("ข้อมูลบนฐานข้อมูลใหม่กว่าข้อมูลในเครื่อง");
    this.name = "RevisionConflictError";
  }
}

function asRun(row: DbRun, members: TrackedTeamMember[] = []): TrackedRun {
  const saveState = { ...EMPTY_SAVE, ...(row.save_state ?? {}), team: row.save_state?.team?.length ? row.save_state.team : members };
  return {
    id: row.id,
    teamId: row.team_id,
    status: row.status,
    currentStage: row.current_stage,
    saveState,
    revision: row.revision,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    legacyRunId: row.legacy_run_id,
  };
}

function asTeam(row: DbTeam): TeamOverview {
  const members = [...(row.team_members ?? [])]
    .filter((member) => member.is_active !== false)
    .sort((a, b) => a.position - b.position)
    .map((member) => ({ id: member.id, name: member.name, avatar: member.avatar, position: member.position }));
  const runs = [...(row.game_runs ?? [])]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .map((run) => asRun(run, members));
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members,
    runs,
    activeRun: runs.find((run) => run.status === "in_progress") ?? null,
    completedRuns: runs.filter((run) => run.status === "completed"),
  };
}

function rpcRun(value: unknown, members: TeamMember[] = []): TrackedRun {
  const data = value as Record<string, unknown>;
  const row: DbRun = {
    id: String(data.id),
    team_id: String(data.team_id),
    status: data.status === "completed" ? "completed" : "in_progress",
    current_stage: (data.current_stage as Stage) ?? "story",
    save_state: (data.save_state as GameSave) ?? { ...EMPTY_SAVE, team: members },
    revision: Number(data.revision ?? 0),
    started_at: String(data.started_at ?? new Date().toISOString()),
    updated_at: String(data.updated_at ?? new Date().toISOString()),
    completed_at: data.completed_at ? String(data.completed_at) : null,
    legacy_run_id: data.legacy_run_id ? String(data.legacy_run_id) : null,
  };
  return asRun(row, members);
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return client;
}

export async function listTeams(): Promise<TeamOverview[]> {
  const client = requireClient();
  const current = await client
    .from("teams")
    .select("id,name,created_at,updated_at,team_members(id,name,avatar,position,is_active),game_runs(id,team_id,status,current_stage,save_state,revision,started_at,updated_at,completed_at,legacy_run_id)")
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  let data: unknown = current.data;
  let error = current.error;
  // Keep existing classrooms readable while the roster migration is being deployed.
  if (error && /is_active/i.test(error.message)) {
    const legacy = await client
      .from("teams")
      .select("id,name,created_at,updated_at,team_members(id,name,avatar,position),game_runs(id,team_id,status,current_stage,save_state,revision,started_at,updated_at,completed_at,legacy_run_id)")
      .eq("status", "active")
      .order("updated_at", { ascending: false });
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;
  return ((data ?? []) as unknown as DbTeam[]).map(asTeam);
}

export async function deleteTeam(teamId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("delete_team_for_teacher", { p_team_id: teamId });
  if (error) throw error;
}

export async function createTeam(name: string, members: TeamMember[]): Promise<TeamOverview> {
  const client = requireClient();
  const { data, error } = await client.rpc("create_team_with_members", {
    p_name: name,
    p_members: members.map((member, position) => ({ ...member, position })),
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const now = new Date().toISOString();
  const trackedMembers = (row.members as DbMember[] | undefined)?.map((member) => ({ ...member }))
    ?? members.map((member, position) => ({ ...member, position }));
  return {
    id: String(row.id),
    name: String(row.name ?? name),
    createdAt: String(row.created_at ?? now),
    updatedAt: String(row.updated_at ?? now),
    members: trackedMembers,
    runs: [],
    activeRun: null,
    completedRuns: [],
  };
}

export async function updateTeamMembers(teamId: string, members: TeamMember[]): Promise<TeamOverview> {
  const client = requireClient();
  const { data, error } = await client.rpc("update_team_members", {
    p_team_id: teamId,
    p_members: members.map((member, position) => ({
      id: member.id ?? null,
      name: member.name,
      avatar: member.avatar,
      position,
    })),
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const trackedMembers = ((row.members as DbMember[] | undefined) ?? [])
    .sort((a, b) => a.position - b.position)
    .map((member) => ({ id: member.id, name: member.name, avatar: member.avatar, position: member.position }));
  return {
    id: String(row.id ?? teamId),
    name: String(row.name ?? "ทีม"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    members: trackedMembers,
    runs: [],
    activeRun: null,
    completedRuns: [],
  };
}

export async function startOrResumeRun(team: TeamOverview): Promise<TrackedRun> {
  const client = requireClient();
  const seed: GameSave = { ...EMPTY_SAVE, team: team.members, stage: "mission", runId: crypto.randomUUID() };
  const { data, error } = await client.rpc("start_or_resume_run", {
    p_team_id: team.id,
    p_seed_state: seed,
  });
  if (error) throw error;
  return rpcRun(data, team.members);
}

export function withLegacyExitTicketKeys(save: GameSave): GameSave {
  const exitTickets = { ...save.exitTickets };
  save.team.forEach((member, index) => {
    if (!member.id) return;
    const stableTicket = exitTickets[`member-${member.id}`];
    if (stableTicket) exitTickets[`student-${member.position ?? index}`] = stableTicket;
  });
  return { ...save, exitTickets };
}

async function sendCheckpoint(item: OutboxItem): Promise<TrackedRun> {
  const client = requireClient();
  const fn = item.complete ? "complete_run" : "save_run_checkpoint";
  const serverSave = { ...withLegacyExitTicketKeys(item.save), checkpointId: item.id };
  const { data, error } = await client.rpc(fn, {
    p_run_id: item.run.id,
    p_expected_revision: item.run.revision,
    p_save_state: serverSave,
    p_current_stage: item.save.stage,
    p_events: item.events.map((event) => ({
      event_type: event.eventType,
      stage: event.stage,
      member_id: event.memberId ?? null,
      payload: { ...event.payload, answerEventId: event.id, answeredAt: event.answeredAt },
    })),
  });
  if (error) {
    // A response can be lost after Postgres commits (including complete_run).
    const { data: committed } = await client.from("game_runs").select("*").eq("id", item.run.id).maybeSingle();
    if (committed?.save_state?.checkpointId === item.id) return rpcRun(committed, item.save.team);
    throw error;
  }
  const payload = data as Record<string, unknown>;
  const serverRun = rpcRun((payload.run ?? payload) as Record<string, unknown>, item.save.team);
  if (payload.conflict === true && serverRun.saveState.checkpointId !== item.id) throw new RevisionConflictError(serverRun);
  return serverRun;
}

let memoryOutbox: OutboxItem[] = [];
let outboxStorageFailed = false;
const acknowledgedRuns = new Map<string, TrackedRun>();
let flushing: Promise<TrackedRun | null> | null = null;

export function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined" || outboxStorageFailed) return memoryOutbox;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as OutboxItem[] : memoryOutbox;
  } catch { return memoryOutbox; }
}

function writeOutbox(items: OutboxItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    outboxStorageFailed = false;
  } catch (error) {
    outboxStorageFailed = true;
    throw error;
  }
}

function enqueue(item: OutboxItem): void {
  memoryOutbox = compactOutbox(readOutbox(), item);
  writeOutbox(memoryOutbox);
}

export function compactOutbox(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const previous = items.find((queued) => queued.run.id === item.run.id);
  const events = [...(previous?.events ?? []), ...item.events];
  const uniqueEvents = events.filter((event, index) => !event.id || events.findIndex((other) => other.id === event.id) === index);
  const newest = previous?.complete && !item.complete ? previous : item;
  return [...items.filter((queued) => queued.run.id !== item.run.id), {
    ...newest,
    run: previous && previous.run.revision > item.run.revision ? previous.run : item.run,
    events: uniqueEvents,
  }];
}

export function queueCheckpoint(
  run: ActiveRunRef,
  save: GameSave,
  events: LearningEventInput[] = [],
  complete = false,
): void {
  const acknowledged = acknowledgedRuns.get(run.id);
  if (acknowledged?.status === "completed") return;
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    run: acknowledged && acknowledged.revision > run.revision ? { id: run.id, teamId: run.teamId, revision: acknowledged.revision } : run,
    save,
    events: events.map((event) => ({ ...event, id: event.id ?? crypto.randomUUID(), answeredAt: event.answeredAt ?? new Date().toISOString() })),
    complete,
    createdAt: new Date().toISOString(),
  };
  // Persist BEFORE debouncing/network I/O so refresh and page changes cannot drop answers.
  enqueue(item);
  if (typeof window !== "undefined") localStorage.setItem(SAVE_CACHE_KEY, JSON.stringify(save));
}

export async function saveCheckpoint(run: ActiveRunRef, save: GameSave, events: LearningEventInput[] = [], complete = false): Promise<TrackedRun> {
  queueCheckpoint(run, save, events, complete);
  await flushOutbox(run.id);
  const persisted = acknowledgedRuns.get(run.id);
  if (!persisted) throw new Error("ยังมีคำตอบรอส่ง");
  return persisted;
}

async function drainOutbox(runId?: string): Promise<TrackedRun | null> {
  if (!isSupabaseConfigured() || (typeof navigator !== "undefined" && navigator.onLine === false)) throw new Error("offline");
  let latest: TrackedRun | null = null;
  while (true) {
    const item = readOutbox().find((queued) => !runId || queued.run.id === runId);
    if (!item) break;
    latest = await sendCheckpoint(item);
    acknowledgedRuns.set(latest.id, latest);
    const sentIds = new Set(item.events.map((event) => event.id));
    // Do not erase answers that arrived while the request was in flight.
    memoryOutbox = readOutbox().flatMap((queued) => {
      if (queued.run.id !== item.run.id) return [queued];
      if (queued.id === item.id) return [];
      return [{ ...queued, run: { ...queued.run, revision: latest!.revision }, events: queued.events.filter((event) => !sentIds.has(event.id)) }];
    });
    writeOutbox(memoryOutbox);
  }
  return latest;
}

export async function flushOutbox(runId?: string): Promise<TrackedRun | null> {
  // Only one writer in this tab, including reconnects, retries and rapid edits.
  while (flushing) { try { await flushing; } catch { /* this caller retries its own queue */ } }
  flushing = drainOutbox(runId);
  try { return await flushing; } finally { flushing = null; }
}

export async function importLegacyBundle(teamName: string, bundle: LegacyBundle): Promise<TeamOverview> {
  const client = requireClient();
  const { data, error } = await client.rpc("import_legacy_bundle", {
    p_team_name: teamName,
    p_save_state: bundle.save,
    p_statistics: bundle.statistics,
  });
  if (error) throw error;
  const teamId = String((data as Record<string, unknown>).team_id);
  const teams = await listTeams();
  const team = teams.find((item) => item.id === teamId);
  if (!team) throw new Error("นำเข้าข้อมูลแล้ว แต่ไม่พบทีมที่สร้าง");
  return team;
}

export async function getTeacherTeamDetail(team: TeamOverview): Promise<TeacherTeamDetail> {
  const client = requireClient();
  const runIds = team.runs.map((run) => run.id);
  if (!runIds.length) return { team, responses: [], events: [] };
  const [{ data: responseRows, error: responseError }, { data: eventRows, error: eventError }] = await Promise.all([
    client.from("student_responses").select("id,run_id,member_id,k,p,v,saved_at,team_members(name)").in("run_id", runIds).order("saved_at", { ascending: false }),
    client.from("learning_events").select("id,run_id,team_id,member_id,event_type,stage,payload,occurred_at,team_members(name)").in("run_id", runIds).order("occurred_at", { ascending: false }).limit(500),
  ]);
  if (responseError) throw responseError;
  if (eventError) throw eventError;
  const responses: StudentResponse[] = ((responseRows ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    runId: String(row.run_id),
    memberId: String(row.member_id),
    memberName: String((row.team_members as { name?: string } | null)?.name ?? "นักเรียน"),
    k: String(row.k ?? ""),
    p: String(row.p ?? ""),
    v: String(row.v ?? ""),
    savedAt: String(row.saved_at),
  }));
  const events: LearningEvent[] = ((eventRows ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    runId: String(row.run_id),
    teamId: String(row.team_id),
    memberId: row.member_id ? String(row.member_id) : null,
    memberName: (row.team_members as { name?: string } | null)?.name ?? null,
    eventType: String(row.event_type),
    stage: row.stage as Stage,
    payload: (row.payload as Record<string, unknown>) ?? {},
    occurredAt: String(row.occurred_at),
  }));
  return { team, responses, events };
}
