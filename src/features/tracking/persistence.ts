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

type DbMember = { id: string; name: string; avatar: string; position: number };
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
  const { data, error } = await client
    .from("teams")
    .select("id,name,created_at,updated_at,team_members(id,name,avatar,position),game_runs(id,team_id,status,current_stage,save_state,revision,started_at,updated_at,completed_at,legacy_run_id)")
    .eq("status", "active")
    .order("updated_at", { ascending: false });
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

async function sendCheckpoint(item: OutboxItem): Promise<TrackedRun> {
  const client = requireClient();
  const fn = item.complete ? "complete_run" : "save_run_checkpoint";
  const { data, error } = await client.rpc(fn, {
    p_run_id: item.run.id,
    p_expected_revision: item.run.revision,
    p_save_state: item.save,
    p_current_stage: item.save.stage,
    p_events: item.events.map((event) => ({
      event_type: event.eventType,
      stage: event.stage,
      member_id: event.memberId ?? null,
      payload: event.payload ?? {},
    })),
  });
  if (error) throw error;
  const payload = data as Record<string, unknown>;
  const serverRun = rpcRun((payload.run ?? payload) as Record<string, unknown>, item.save.team);
  if (payload.conflict === true) throw new RevisionConflictError(serverRun);
  return serverRun;
}

function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as OutboxItem[] : [];
  } catch { return []; }
}

function writeOutbox(items: OutboxItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-20)));
}

function enqueue(item: OutboxItem): void {
  writeOutbox(compactOutbox(readOutbox(), item));
}

export function compactOutbox(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  return [...items.filter((queued) => queued.run.id !== item.run.id), item].slice(-20);
}

export async function saveCheckpoint(
  run: ActiveRunRef,
  save: GameSave,
  events: LearningEventInput[] = [],
  complete = false,
): Promise<TrackedRun> {
  if (typeof window !== "undefined") localStorage.setItem(SAVE_CACHE_KEY, JSON.stringify(save));
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    run,
    save,
    events,
    complete,
    createdAt: new Date().toISOString(),
  };
  if (!isSupabaseConfigured() || (typeof navigator !== "undefined" && !navigator.onLine)) {
    enqueue(item);
    throw new Error("offline");
  }
  try {
    return await sendCheckpoint(item);
  } catch (error) {
    if (!(error instanceof RevisionConflictError)) enqueue(item);
    throw error;
  }
}

export async function flushOutbox(): Promise<TrackedRun | null> {
  if (!isSupabaseConfigured() || (typeof navigator !== "undefined" && !navigator.onLine)) return null;
  const items = readOutbox();
  let latest: TrackedRun | null = null;
  const remaining: OutboxItem[] = [];
  for (const item of items) {
    try {
      latest = await sendCheckpoint({ ...item, run: latest?.id === item.run.id ? { id: latest.id, teamId: latest.teamId, revision: latest.revision } : item.run });
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        latest = error.serverRun;
      } else {
        remaining.push(item);
      }
    }
  }
  writeOutbox(remaining);
  return latest;
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
