import { describe, expect, it, vi } from "vitest";
import { createOrbitDragTracker, handleWebGLContextLoss, listenToMediaQuery, observeElementResize, readRendererStatuses, selectRenderCompatibility } from "./browser-compat";

describe("browser compatibility profiles", () => {
  it("keeps the modern WebGL 2 quality cap", () => {
    expect(selectRenderCompatibility(2, 2, 8192)).toMatchObject({ renderer: "webgl2", antialias: true, maxDevicePixelRatio: 1.75, precision: "highp" });
  });

  it("uses a low-memory WebGL 1 profile for iOS 12", () => {
    expect(selectRenderCompatibility(1, 2, 4096)).toMatchObject({ renderer: "webgl1-legacy", antialias: false, maxDevicePixelRatio: 1, precision: "mediump", modelViewerShadowScale: .28 });
  });

  it("selects the existing 2D fallback when WebGL is unavailable", () => {
    expect(selectRenderCompatibility(0)).toMatchObject({ renderer: "none", webglVersion: 0, modelViewerShadowScale: 0 });
  });
});

describe("legacy browser event fallbacks", () => {
  it("uses the legacy MediaQueryList listener API", () => {
    const callback = vi.fn();
    let listener: (() => void) | undefined;
    const media = {
      addListener: vi.fn((next: () => void) => { listener = next; }),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;
    const cleanup = listenToMediaQuery(media, callback);
    listener?.();
    expect(callback).toHaveBeenCalledOnce();
    cleanup();
    expect((media as unknown as { removeListener: ReturnType<typeof vi.fn> }).removeListener).toHaveBeenCalledOnce();
  });

  it("uses window resize when ResizeObserver is missing", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    vi.stubGlobal("ResizeObserver", undefined);
    const callback = vi.fn();
    const cleanup = observeElementResize({} as Element, callback);
    expect(addEventListener).toHaveBeenCalledWith("resize", callback);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("resize", callback);
    vi.unstubAllGlobals();
  });

  it("tracks touch or pointer drag deltas without Pointer Events", () => {
    const deltas: number[] = [];
    const tracker = createOrbitDragTracker((delta) => deltas.push(delta));
    tracker.start(7, 100);
    expect(tracker.move(8, 120)).toBe(false);
    expect(tracker.move(7, 116)).toBe(true);
    expect(tracker.move(7, 111)).toBe(true);
    expect(tracker.finish(7)).toBe(true);
    expect(deltas).toEqual([16, -5]);
  });

  it("prevents context-loss teardown and records diagnostics", () => {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    const fail = vi.fn();
    handleWebGLContextLoss(event, fail, "impact");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledOnce();
    expect(readRendererStatuses().impact.status).toBe("context-lost");
  });
});
