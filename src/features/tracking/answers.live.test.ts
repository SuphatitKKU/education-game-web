import { describe, expect, it } from "vitest";
import { AVATARS, EMPTY_SAVE, type GameSave } from "@/features/game/data";
import { LAB_MATERIALS } from "@/features/game/labs";
import { recordCompression } from "@/features/game/compression";
import { recordImpact } from "@/features/game/impact";
import { recordAbsorption } from "@/features/game/absorption";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createTeam, listTeams, startOrResumeRun, saveCheckpoint } from "./persistence";
import { answerEvents } from "./answer-events";

// Opt-in only. Creates ONE clearly marked synthetic team; never edits classroom teams.
describe.skipIf(process.env.RUN_LIVE_ANSWER_TEST !== "1")("live database answer round trip", () => {
  it("writes and reads actual game_runs, student_responses and learning_events", async () => {
    const teamName = process.env.LIVE_QA_TEAM_NAME || `QA คำตอบ ${new Date().toISOString().replace(/[:.]/g, "-")}`;
    if (!teamName.startsWith("QA คำตอบ ")) throw new Error("Refusing to modify a non-QA team");
    const existing = process.env.LIVE_QA_TEAM_NAME ? (await listTeams()).find((item) => item.name === teamName) : undefined;
    const team = existing ?? await createTeam(teamName, AVATARS.slice(0, 6).map((avatar, index) => ({ name: `ทดสอบ${index + 1}`, avatar })));
    console.log(`LIVE_QA_TEAM=${teamName}`);
    let run = await startOrResumeRun(team);
    const memberKey = `member-${team.members[0].id}`;
    const save: GameSave = { ...EMPTY_SAVE, runId: run.saveState.runId, team: team.members, stage: "exitTicket",
      inspectionFindings: { dent: "แรงกด", wet: "น้ำ", corner: "แรงกระแทก", cup: "แรงกระแทก" },
      studyFocus: { compression: true, elasticity: true, water: true },
      exitTickets: { [memberKey]: { k: "1. กล่องยุบ สัมพันธ์กับสมบัติ → ความต้านทานแรงกดทับ\n2. สิ่งของภายในเสียหายจากแรงกระแทก สัมพันธ์กับสมบัติ → _____\n3. กล่องเปียก สัมพันธ์กับสมบัติ → _____", p: "", v: "ไม่เหมาะสม\nเหตุผล: ข้อมูลทดสอบระบบบันทึก" } },
      recapAnswers: { "0": [1, 0] }, labAnswerDrafts: { compression: { cardboard: "slight" }, impact: { cardboard: "much" } },
      compressionResults: { cardboard: recordCompression(LAB_MATERIALS[1], "slight") },
      impactResults: { cardboard: recordImpact("cardboard", "much") },
      absorptionResults: { cardboard: recordAbsorption(LAB_MATERIALS[1]) },
    };
    run = await saveCheckpoint({ id: run.id, teamId: team.id, revision: run.revision }, save, answerEvents(run.saveState, save));
    const client = getSupabaseClient()!;
    const { data: snapshot, error: snapshotError } = await client.from("game_runs").select("save_state,revision").eq("id", run.id).single();
    expect(snapshotError).toBeNull();
    expect(snapshot?.save_state).toMatchObject(save);
    const { data: responses, error: responseError } = await client.from("student_responses").select("member_id,k,p,v").eq("run_id", run.id);
    expect(responseError).toBeNull();
    expect(responses).toEqual([expect.objectContaining({ member_id: team.members[0].id, ...save.exitTickets[memberKey] })]);
    const { data: events, error: eventError } = await client.from("learning_events").select("event_type,payload").eq("run_id", run.id);
    expect(eventError).toBeNull();
    expect(events!.some((event) => event.event_type === "damage_finding_saved" && event.payload.key === "dent")).toBe(true);
    expect(events!.some((event) => event.event_type === "recap_answer_saved" && event.payload.answer.join(",") === "1,0")).toBe(true);
    const resumed = await startOrResumeRun(team);
    expect(resumed.id).toBe(run.id);
    expect(resumed.saveState.exitTickets[memberKey]).toEqual(save.exitTickets[memberKey]);
    console.log(`LIVE_QA_TEAM=${teamName}`);
    console.log(`LIVE_QA_RUN=${run.id}`);
    console.log("Verified game_runs + partial student_responses + learning_events + resume from database.");
  }, 60000);
});
