import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SAVE } from "@/features/game/data";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true, getSupabaseClient: () => ({ rpc, from }) }));
const run = { id: "durable-run", teamId: "test-team", revision: 0 };
const first = { ...EMPTY_SAVE, stage: "inspection" as const, inspectionFindings: { dent: "แรงกด" as const } };
const second = { ...first, inspectionFindings: { dent: "แรงกด" as const, cup: "แรงกระแทก" as const } };
function response(args: Record<string, any>, complete = false) {
  return { error: null, data: { conflict: false, run: { id: run.id, team_id: run.teamId, revision: args.p_expected_revision + 1, save_state: args.p_save_state, current_stage: args.p_current_stage, status: complete ? "completed" : "in_progress" } } };
}
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  rpc.mockImplementation(async (_name, args) => response(args));
});
afterEach(() => vi.unstubAllGlobals());

describe("durable answer delivery", () => {
  it("retains in-memory answers when browser storage is full and still sends them", async () => {
    const p = await import("./persistence");
    const original = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("quota"); };
    expect(() => p.queueCheckpoint(run, first)).toThrow("quota");
    expect(p.readOutbox()[0].save.inspectionFindings).toEqual(first.inspectionFindings);
    localStorage.setItem = original;
    await p.flushOutbox();
    expect(rpc.mock.calls[0][1].p_save_state.inspectionFindings).toEqual(first.inspectionFindings);
    expect(p.readOutbox()).toEqual([]);
  });
  it("writes to the durable queue before any network request and survives module/page reload", async () => {
    const p = await import("./persistence");
    p.queueCheckpoint(run, first);
    expect(rpc).not.toHaveBeenCalled();
    vi.resetModules();
    const reloaded = await import("./persistence");
    expect(reloaded.readOutbox()[0].save.inspectionFindings).toEqual(first.inspectionFindings);
    await reloaded.flushOutbox();
    expect(reloaded.readOutbox()).toEqual([]);
    expect(rpc.mock.calls[0][1].p_save_state.inspectionFindings).toEqual(first.inspectionFindings);
  });
  it("serializes rapid answers and rebases the second revision without erasing the second answer", async () => {
    const p = await import("./persistence");
    let resolveFirst!: (value: unknown) => void;
    rpc.mockImplementationOnce((_name, args) => new Promise((resolve) => { resolveFirst = () => resolve(response(args)); }));
    p.queueCheckpoint(run, first, [{ eventType: "first", stage: "inspection" }]);
    const flush = p.flushOutbox();
    p.queueCheckpoint(run, second, [{ eventType: "second", stage: "inspection" }]);
    const concurrentFlush = p.flushOutbox();
    expect(rpc).toHaveBeenCalledTimes(1);
    resolveFirst(null);
    await Promise.all([flush, concurrentFlush]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_expected_revision: 1, p_save_state: { inspectionFindings: second.inspectionFindings }, p_events: [{ event_type: "second" }] });
    expect(p.readOutbox()).toEqual([]);
  });
  it("keeps offline answers and sends them when connection returns", async () => {
    const p = await import("./persistence");
    vi.stubGlobal("navigator", { onLine: false });
    await expect(p.saveCheckpoint(run, first)).rejects.toThrow("offline");
    expect(p.readOutbox()).toHaveLength(1);
    vi.stubGlobal("navigator", { onLine: true });
    await p.flushOutbox();
    expect(p.readOutbox()).toEqual([]);
  });
  it("keeps local answers on genuine conflicts instead of replacing them with server answers", async () => {
    const p = await import("./persistence");
    rpc.mockResolvedValue({ error: null, data: { conflict: true, run: { id: run.id, team_id: run.teamId, revision: 4, save_state: EMPTY_SAVE, status: "in_progress" } } });
    await expect(p.saveCheckpoint(run, second)).rejects.toBeInstanceOf(p.RevisionConflictError);
    expect(p.readOutbox()[0].save.inspectionFindings).toEqual(second.inspectionFindings);
  });
  it("recognizes a committed completion after its HTTP response was lost and does not complete twice", async () => {
    const p = await import("./persistence");
    rpc.mockImplementation(async (_name, args) => {
      from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: response(args, true).data.run }) }) }) });
      return { error: { message: "response lost" }, data: null };
    });
    await p.saveCheckpoint(run, { ...first, stage: "mission1Complete" }, [], true);
    await p.saveCheckpoint(run, { ...first, stage: "overview" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(p.readOutbox()).toEqual([]);
  });
});
