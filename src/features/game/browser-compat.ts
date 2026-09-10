export type WebGLVersion = 0 | 1 | 2;

export type RenderCompatibilityProfile = {
  webglVersion: WebGLVersion;
  renderer: "none" | "webgl1-legacy" | "webgl2";
  antialias: boolean;
  maxDevicePixelRatio: number;
  precision: "mediump" | "highp";
  modelViewerShadowScale: number;
  maxTextureSize: number;
};

export type RendererStatus = "idle" | "loading" | "ready" | "fallback" | "context-lost";
export type RendererStatusRecord = { status: RendererStatus; detail?: string };

const rendererStatuses: Record<string, RendererStatusRecord> = {};
let cachedProfile: RenderCompatibilityProfile | null = null;

export function selectRenderCompatibility(webglVersion: WebGLVersion, devicePixelRatio = 1, maxTextureSize = 0): RenderCompatibilityProfile {
  if (webglVersion === 0) {
    return { webglVersion, renderer: "none", antialias: false, maxDevicePixelRatio: 1, precision: "mediump", modelViewerShadowScale: 0, maxTextureSize };
  }
  if (webglVersion === 1) {
    return { webglVersion, renderer: "webgl1-legacy", antialias: false, maxDevicePixelRatio: Math.min(Math.max(devicePixelRatio, 1), 1), precision: "mediump", modelViewerShadowScale: .28, maxTextureSize };
  }
  return { webglVersion, renderer: "webgl2", antialias: true, maxDevicePixelRatio: Math.min(Math.max(devicePixelRatio, 1), 1.75), precision: "highp", modelViewerShadowScale: 1, maxTextureSize };
}

export function detectRenderCompatibility(): RenderCompatibilityProfile {
  if (cachedProfile) return cachedProfile;
  if (typeof document === "undefined") return selectRenderCompatibility(0);

  const canvas = document.createElement("canvas");
  const attributes: WebGLContextAttributes = { alpha: true, antialias: false, powerPreference: "low-power" };
  const forceWebGL1 = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compat") === "webgl1";
  let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let webglVersion: WebGLVersion = 0;
  try {
    context = forceWebGL1 ? null : canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null;
    if (context) webglVersion = 2;
    else {
      context = (canvas.getContext("webgl", attributes) || canvas.getContext("experimental-webgl", attributes)) as WebGLRenderingContext | null;
      if (context) webglVersion = 1;
    }
  } catch {
    context = null;
  }

  let maxTextureSize = 0;
  if (context) {
    try { maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || 0; } catch { /* diagnostics only */ }
    try { context.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* optional extension */ }
  }
  cachedProfile = selectRenderCompatibility(webglVersion, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, maxTextureSize);
  return cachedProfile;
}

export function resetRenderCompatibilityForTests() {
  cachedProfile = null;
  for (const key of Object.keys(rendererStatuses)) delete rendererStatuses[key];
}

export function observeElementResize(element: Element, callback: () => void) {
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(callback);
    observer.observe(element);
    return () => observer.disconnect();
  }
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

export function listenToMediaQuery(media: LegacyMediaQueryList, callback: () => void) {
  const listener = () => callback();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener?.(listener);
  return () => media.removeListener?.(listener);
}

export function reportRendererStatus(name: string, status: RendererStatus, detail?: string) {
  rendererStatuses[name] = { status, detail };
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("parcel-renderer-status"));
  }
}

export function handleWebGLContextLoss(event: Event, onFailure: () => void, rendererName?: string) {
  event.preventDefault();
  if (rendererName) reportRendererStatus(rendererName, "context-lost");
  onFailure();
}

export function readRendererStatuses() {
  return { ...rendererStatuses };
}

export function createOrbitDragTracker(onDelta: (deltaX: number) => void) {
  let activeId: number | string | null = null;
  let previousX = 0;
  return {
    start(id: number | string, x: number) { activeId = id; previousX = x; },
    move(id: number | string, x: number) {
      if (activeId !== id) return false;
      onDelta(x - previousX);
      previousX = x;
      return true;
    },
    finish(id: number | string) {
      if (activeId !== id) return false;
      activeId = null;
      return true;
    },
  };
}

export function installOrbitDrag(canvas: HTMLCanvasElement, onRotate: (delta: number) => void, onPerspective: () => void) {
  const tracker = createOrbitDragTracker((deltaX) => { onRotate(deltaX * .006); onPerspective(); });
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, listener: EventListener, options?: AddEventListenerOptions | boolean) => {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  if (typeof PointerEvent !== "undefined") {
    on(canvas, "pointerdown", ((event: PointerEvent) => {
      if (event.button !== 0) return;
      tracker.start(event.pointerId, event.clientX);
      canvas.setPointerCapture?.(event.pointerId);
    }) as EventListener);
    on(canvas, "pointermove", ((event: PointerEvent) => { tracker.move(event.pointerId, event.clientX); }) as EventListener);
    const finish = ((event: PointerEvent) => {
      tracker.finish(event.pointerId);
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
    }) as EventListener;
    on(canvas, "pointerup", finish);
    on(canvas, "pointercancel", finish);
  } else {
    on(canvas, "touchstart", ((event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touch) tracker.start(touch.identifier, touch.clientX);
    }) as EventListener, { passive: true });
    on(canvas, "touchmove", ((event: TouchEvent) => {
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        const touch = event.changedTouches[index];
        if (tracker.move(touch.identifier, touch.clientX)) { event.preventDefault(); break; }
      }
    }) as EventListener, { passive: false });
    const touchFinish = ((event: TouchEvent) => {
      for (let index = 0; index < event.changedTouches.length; index += 1) tracker.finish(event.changedTouches[index].identifier);
    }) as EventListener;
    on(canvas, "touchend", touchFinish);
    on(canvas, "touchcancel", touchFinish);
    on(canvas, "mousedown", ((event: MouseEvent) => { if (event.button === 0) tracker.start("mouse", event.clientX); }) as EventListener);
    on(window, "mousemove", ((event: MouseEvent) => { tracker.move("mouse", event.clientX); }) as EventListener);
    on(window, "mouseup", (() => tracker.finish("mouse")) as EventListener);
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

type LegacyModelViewerElement = HTMLElement & {
  cameraOrbit?: string;
  getCameraOrbit?: () => { theta: number; phi: number; radius: number };
  jumpCameraToGoal?: () => void;
};

export function installModelViewerInputFallback(element: LegacyModelViewerElement) {
  if (typeof PointerEvent !== "undefined") return () => undefined;

  const tracker = createOrbitDragTracker((deltaX) => {
    const orbit = element.getCameraOrbit?.();
    if (!orbit) return;
    const nextOrbit = `${orbit.theta - deltaX * .01}rad ${orbit.phi}rad ${orbit.radius}m`;
    element.cameraOrbit = nextOrbit;
    element.setAttribute("camera-orbit", nextOrbit);
    element.jumpCameraToGoal?.();
  });
  const cleanups: Array<() => void> = [];
  const on = (target: HTMLElement | Window, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };

  on(element, "touchstart", ((event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (touch) tracker.start(touch.identifier, touch.clientX);
  }) as EventListener, { passive: true });
  on(element, "touchmove", ((event: TouchEvent) => {
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const touch = event.changedTouches[index];
      if (tracker.move(touch.identifier, touch.clientX)) { event.preventDefault(); break; }
    }
  }) as EventListener, { passive: false });
  const finishTouch = ((event: TouchEvent) => {
    for (let index = 0; index < event.changedTouches.length; index += 1) tracker.finish(event.changedTouches[index].identifier);
  }) as EventListener;
  on(element, "touchend", finishTouch);
  on(element, "touchcancel", finishTouch);
  on(element, "mousedown", ((event: MouseEvent) => {
    if (event.button === 0) tracker.start("model-viewer-mouse", event.clientX);
  }) as EventListener);
  on(window, "mousemove", ((event: MouseEvent) => { tracker.move("model-viewer-mouse", event.clientX); }) as EventListener);
  on(window, "mouseup", (() => tracker.finish("model-viewer-mouse")) as EventListener);
  return () => cleanups.forEach((cleanup) => cleanup());
}
