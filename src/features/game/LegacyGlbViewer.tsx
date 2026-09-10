"use client";

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { installOrbitDrag } from "./browser-compat";
import type { LegacyGlbScene, LegacyHotspotPosition } from "./legacy-glb-scene";
import styles from "./LegacyGlbViewer.module.css";

export type LegacyGlbViewerHandle = { setOrbit: (orbit: string, target?: string) => void };
export type LegacyGlbHotspot = {
  id: string;
  position: string;
  className?: string;
  ariaLabel: string;
  disabled?: boolean;
  dataDamage?: string;
  content?: ReactNode;
  onClick: () => void;
};

export function LegacyGlbViewer({ src, alt, poster, orbit, target, hotspots = [], style, className, viewerRef, onLoad, onError }: {
  src: string;
  alt: string;
  poster?: string;
  orbit?: string;
  target?: string;
  hotspots?: LegacyGlbHotspot[];
  style?: CSSProperties;
  className?: string;
  viewerRef?: Ref<LegacyGlbViewerHandle>;
  onLoad: () => void;
  onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LegacyGlbScene | null>(null);
  const callbacksRef = useRef({ onLoad, onError });
  callbacksRef.current = { onLoad, onError };
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<Record<string, LegacyHotspotPosition>>({});

  useImperativeHandle(viewerRef, () => ({ setOrbit: (nextOrbit, nextTarget) => sceneRef.current?.setOrbit(nextOrbit, nextTarget) }), []);

  useEffect(() => {
    let active = true;
    let loaded = false;
    setReady(false);
    setPositions({});
    const fail = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      if (active) callbacksRef.current.onError();
    };
    void import("./legacy-glb-scene").then(({ createLegacyGlbScene }) => {
      if (!active || !canvasRef.current) return;
      sceneRef.current = createLegacyGlbScene(canvasRef.current, {
        src,
        orbit,
        target,
        hotspots,
        onHotspots: (next) => { if (active) setPositions(next); },
        onLoad: () => {
          if (!active) return;
          loaded = true;
          setReady(true);
          callbacksRef.current.onLoad();
        },
        onFailure: fail,
      });
    }).catch(fail);
    const timeout = window.setTimeout(() => { if (!loaded) fail(); }, 10000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return installOrbitDrag(canvas, (delta) => sceneRef.current?.rotate(delta), () => undefined);
  }, []);

  return <div className={`${styles.viewer} ${className ?? ""}`} style={style} data-ready={ready ? "true" : "false"}>
    {poster && !ready && <img className={styles.poster} src={poster} alt="" aria-hidden="true" />}
    <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={alt} tabIndex={0} onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      sceneRef.current?.rotate(event.key === "ArrowLeft" ? -.12 : .12);
    }} />
    {ready && hotspots.map((hotspot) => {
      const position = positions[hotspot.id];
      return <button
        key={hotspot.id}
        type="button"
        className={hotspot.className}
        aria-label={hotspot.ariaLabel}
        disabled={hotspot.disabled}
        data-damage={hotspot.dataDamage}
        onClick={hotspot.onClick}
        style={{ position: "absolute", left: `${position?.left ?? 50}%`, top: `${position?.top ?? 50}%`, transform: "translate(-50%, -50%)", display: position?.visible === false ? "none" : undefined }}
      >{hotspot.content}</button>;
    })}
  </div>;
}
