import type { GameSave, Stage, TeamMember } from "@/features/game/data";

export type RunStatus = "in_progress" | "completed";

export type SaveIndicator = "idle" | "saving" | "saved" | "offline" | "conflict";

export type LearningEventInput = {
  id?: string;
  answeredAt?: string;
  eventType: string;
  stage: Stage;
  memberId?: string | null;
  payload?: Record<string, unknown>;
};

export type TrackedTeamMember = TeamMember & {
  id?: string;
  position?: number;
};

export type TrackedRun = {
  id: string;
  teamId: string;
  status: RunStatus;
  currentStage: Stage;
  saveState: GameSave;
  revision: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  legacyRunId?: string | null;
};

export type TeamOverview = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: TrackedTeamMember[];
  runs: TrackedRun[];
  activeRun: TrackedRun | null;
  completedRuns: TrackedRun[];
};

export type ActiveRunRef = {
  id: string;
  teamId: string;
  revision: number;
};

export type StudentResponse = {
  id: string;
  runId: string;
  memberId: string;
  memberName: string;
  k: string;
  p: string;
  v: string;
  savedAt: string;
};

export type LearningEvent = {
  id: number;
  runId: string;
  teamId: string;
  memberId: string | null;
  memberName: string | null;
  eventType: string;
  stage: Stage;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type TeacherTeamDetail = {
  team: TeamOverview;
  responses: StudentResponse[];
  events: LearningEvent[];
};

export type LegacyStatistic = {
  runId?: string;
  submittedAt?: string;
  members?: string[];
  studyFocus?: Record<string, boolean>;
  exitTickets?: Record<string, { k: string; p: string; v: string }>;
};

export type LegacyBundle = {
  save: GameSave | null;
  statistics: LegacyStatistic[];
};
