"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MaterialDefinition } from "./data";
import type { CompressionPhase } from "./compression";
import type { CompressionScene } from "./compression-scene";
import styles from "./CompressionLab.module.css";
import { installOrbitDrag, reportRendererStatus } from "./browser-compat";

export function CompressionPress3D({ material, phase, children }: {
  material: MaterialDefinition; phase: CompressionPhase; children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CompressionScene | null>(null);
  const inputRef = useRef({ material, phase, startedAt: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [view, setView] = useState<"front" | "perspective">("front");
  const [rendererAttempt, setRendererAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    reportRendererStatus("compression", "loading");
    const fail = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      if (active) { setStatus("fallback"); reportRendererStatus("compression", "fallback"); }
    };
    // The 3D library is downloaded only when this experiment is opened.
    void import("./compression-scene").then(({ createCompressionScene }) => {
      if (!active || !canvasRef.current) return;
      sceneRef.current = createCompressionScene(canvasRef.current, fail);
      // Preserve the selected camera if a visual update recreates the renderer.
      sceneRef.current.setView(view);
      const current = inputRef.current;
      sceneRef.current.update(current.material, current.phase, current.startedAt);
      setStatus("ready");
      reportRendererStatus("compression", "ready");
    }).catch(fail);
    return () => { active = false; sceneRef.current?.dispose(); sceneRef.current = null; reportRendererStatus("compression", "idle"); };
  }, [rendererAttempt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return installOrbitDrag(canvas, (delta) => sceneRef.current?.rotate(delta), () => setView("perspective"));
  }, []);

  useEffect(() => {
    const startedAt = performance.now();
    inputRef.current = { material, phase, startedAt };
    sceneRef.current?.update(material, phase, startedAt);
  }, [material, phase]);

  const changeView = (next: "front" | "perspective") => { setView(next); sceneRef.current?.setView(next); };
  const running = phase === "lifting" || phase === "approach" || phase === "pressing";

  return <div className={styles.press3D} data-renderer={status}>
    <div className={styles.sceneLabels} hidden={status !== "ready"} aria-hidden="true">
      <span>ก่อนกด</span><span>ขณะรับแรงกด</span>
    </div>
    <div className={styles.sceneViewport} hidden={status !== "ready"}>
      <canvas ref={canvasRef} className={styles.sceneCanvas} tabIndex={status === "ready" ? 0 : -1}
        role="img" aria-label={`เครื่องกด 3 มิติ ${material.name} เปรียบเทียบก่อนกดและ${phase === "idle" ? "พร้อมทดสอบ" : phase === "lifting" ? "กำลังยกแท่นเพื่อเริ่มใหม่" : running ? "กำลังกด" : "หลังรับแรงกด"} ใช้ปุ่มลูกศรซ้ายขวาเพื่อหมุนมุมมอง`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          sceneRef.current?.rotate(event.key === "ArrowLeft" ? -.12 : .12);
          setView("perspective");
        }} />
      <span className={styles.sceneCompareArrow} aria-hidden="true">···➜</span>
    </div>
    {status !== "ready" && children}
    <div className={styles.sceneTools}>
      {status === "ready" ? <>
        <span className={styles.sceneBadge}>3D</span>
        <span>ลากเพื่อหมุนดู</span>
        <div role="group" aria-label="มุมมองเครื่องกด">
          <button type="button" aria-pressed={view === "front"} onClick={() => changeView("front")}>มุมตรง</button>
          <button type="button" aria-pressed={view === "perspective"} onClick={() => changeView("perspective")}>มุม 3D</button>
        </div>
      </> : <><span role="status">{status === "loading" ? "กำลังเตรียมเครื่องกด 3D…" : "อุปกรณ์นี้แสดง 3D ไม่ได้ · ใช้ภาพจำลองสำรอง"}</span>{status === "fallback" && <button type="button" onClick={() => { setStatus("loading"); setRendererAttempt((attempt) => attempt + 1); }}>ลองเปิด 3D อีกครั้ง</button>}</>}
    </div>
  </div>;
}
