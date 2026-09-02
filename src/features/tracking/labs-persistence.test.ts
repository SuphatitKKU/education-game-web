import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SAVE, type GameSave } from "@/features/game/data";
import { LAB_MATERIALS, LAB_ROOMS } from "@/features/game/labs";
import { recordCompression } from "@/features/game/compression";
import { recordImpact } from "@/features/game/impact";
import { recordAbsorption } from "@/features/game/absorption";
import { saveCheckpoint } from "./persistence";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ rpc }),
}));

beforeEach(() => vi.stubGlobal("navigator", { onLine: true }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("laboratory checkpoint contract (mock Supabase)", () => {
  it("persists every response surface, including partial individual answers", async () => {
    const save: GameSave = {
      ...EMPTY_SAVE,
      stage: "exitTicket",
      team: [{ id: "member-1", name: "ฟ้า", avatar: "inventor_sun", position: 0 }],
      inspectionFindings: { dent: "แรงกด" },
      studyFocus: { compression: true },
      exitTickets: { "member-member-1": { k: "คำตอบ K ที่กำลังทำ", p: "", v: "" } },
      recapAnswers: { "0": [1, 0] },
    };
    rpc.mockResolvedValue({ error: null, data: {
      id: "run-test", team_id: "team-test", revision: 8, current_stage: "exitTicket", save_state: save, status: "in_progress",
    } });

    await saveCheckpoint({ id: "run-test", teamId: "team-test", revision: 7 }, save);

    expect(rpc).toHaveBeenCalledWith("save_run_checkpoint", expect.objectContaining({
      p_save_state: expect.objectContaining({
        inspectionFindings: { dent: "แรงกด" },
        studyFocus: { compression: true },
        exitTickets: expect.objectContaining({ "member-member-1": { k: "คำตอบ K ที่กำลังทำ", p: "", v: "" } }),
        recapAnswers: { "0": [1, 0] },
      }),
    }));
  });

  it.each(LAB_ROOMS)("persists the $id checkpoint and event with the expected revision", async (room) => {
    const runId = `run-${room.id}`;
    const save: GameSave = { ...EMPTY_SAVE, stage: room.id,
      compressionResults: { cardboard: recordCompression(LAB_MATERIALS[1], "slight") },
      absorptionResults: { [LAB_MATERIALS[1].id]: recordAbsorption(LAB_MATERIALS[1]) },
      elasticityResults: { cardboard: { materialId: "cardboard", stretch: [1, 2, 3], residual: 1, recovered: 2, summary: "test" } },
      impactResults: { cardboard: recordImpact("cardboard", "slight") },
    };
    rpc.mockResolvedValue({ error: null, data: {
      id: runId, team_id: "team-test", revision: 8, current_stage: room.id, save_state: save, status: "in_progress",
    } });
    const result = await saveCheckpoint({ id: runId, teamId: "team-test", revision: 7 }, save,
      [{ eventType: `${room.id}_result_saved`, stage: room.id, payload: { materials: ["cardboard"] } }]);
    expect(rpc).toHaveBeenCalledWith("save_run_checkpoint", expect.objectContaining({
      p_run_id: runId, p_expected_revision: 7, p_current_stage: room.id, p_save_state: expect.objectContaining({ ...save, checkpointId: expect.any(String) }),
      p_events: [expect.objectContaining({ event_type: `${room.id}_result_saved`, stage: room.id })],
    }));
    expect(result.saveState[room.resultsKey]).toEqual(save[room.resultsKey]);
    expect(result.revision).toBe(8);
    expect(result.status).toBe("in_progress");
  });
});
