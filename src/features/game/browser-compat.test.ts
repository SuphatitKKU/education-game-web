import { describe, expect, it, vi } from "vitest";
import { createCompatibleWebGLContext, createOrbitDragTracker, handleWebGLContextLoss, installModelViewerInputFallback, listenToMediaQuery, observeElementResize, readRendererStatuses, selectRenderCompatibility } from "./browser-compat";

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

  it("requests WebGL 1 directly with low-memory attributes for an old iPad", () => {
    const webgl1 = { getParameter: vi.fn() } as unknown as WebGLRenderingContext;
    const getContext = vi.fn((name: string, _attributes?: WebGLContextAttributes) => name === "webgl" ? webgl1 : null);
    const context = createCompatibleWebGLContext({ getContext } as unknown as HTMLCanvasElement, selectRenderCompatibility(1, 2, 4096));
    expect(context).toBe(webgl1);
    expect(getContext.mock.calls.map(([name]) => name)).toEqual(["webgl"]);
    expect(getContext.mock.calls[0][1]).toMatchObject({ antialias: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
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

  it("tracks vertical drag deltas for full-orbit camera controls", () => {
    const deltas: Array<[number, number]> = [];
    const tracker = createOrbitDragTracker((deltaX, deltaY) => deltas.push([deltaX, deltaY]));
    tracker.start(7, 100, 40);
    expect(tracker.move(7, 116, 54)).toBe(true);
    expect(tracker.move(7, 111, 48)).toBe(true);
    expect(deltas).toEqual([[16, 14], [-5, -6]]);
  });

  it("installs native touch controls for model-viewer when Pointer Events are missing", () => {
    const listeners: Record<string, EventListener> = {};
    const attributes = new Map<string, string>();
    const element = {
      addEventListener: vi.fn((type: string, listener: EventListener) => { listeners[type] = listener; }),
      removeEventListener: vi.fn(),
      setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
      getCameraOrbit: () => ({ theta: 1, phi: .8, radius: 4 }),
      jumpCameraToGoal: vi.fn(),
    };
    const windowListeners: Record<string, EventListener> = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((type: string, listener: EventListener) => { windowListeners[type] = listener; }),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("PointerEvent", undefined);
    const cleanup = installModelViewerInputFallback(element as unknown as HTMLElement);
    listeners.touchstart({ changedTouches: [{ identifier: 5, clientX: 100, clientY: 100 }] } as unknown as Event);
    const move = { changedTouches: [{ identifier: 5, clientX: 120, clientY: 120 }], preventDefault: vi.fn() };
    listeners.touchmove(move as unknown as Event);
    expect(attributes.get("camera-orbit")).toBe("0.8rad 0.6000000000000001rad 4m");
    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(element.jumpCameraToGoal).toHaveBeenCalledOnce();
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalled();
    vi.unstubAllGlobals();
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
