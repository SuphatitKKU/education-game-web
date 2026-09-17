"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MaterialDefinition } from "./data";
import type { AbsorptionPhase } from "./absorption";
import type { AbsorptionScene } from "./absorption-scene";
import layoutStyles from "./CompressionLab.module.css";
import { installOrbitDrag, reportRendererStatus } from "./browser-compat";

export function AbsorptionScale3D({ materials, phase, focusedMaterialId, children }: {
  materials: MaterialDefinition[];
  phase: AbsorptionPhase;
  focusedMaterialId: string | null;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AbsorptionScene | null>(null);
  const inputRef = useRef({ materials, phase, focusedMaterialId, startedAt: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [view, setView] = useState<"front" | "perspective">("front");
  const [rendererAttempt, setRendererAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    reportRendererStatus("absorption", "loading");
    const fail = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      if (active) { setStatus("fallback"); reportRendererStatus("absorption", "fallback"); }
    };
    void import("./absorption-scene").then(({ createAbsorptionScene }) => {
      if (!active || !canvasRef.current) return;
      sceneRef.current = createAbsorptionScene(canvasRef.current, fail);
      sceneRef.current.setView(view);
      const current = inputRef.current;
      sceneRef.current.update(current.materials, current.phase, current.focusedMaterialId, current.startedAt);
      setStatus("ready");
      reportRendererStatus("absorption", "ready");
    }).catch(fail);
    return () => { active = false; sceneRef.current?.dispose(); sceneRef.current = null; reportRendererStatus("absorption", "idle"); };
  }, [rendererAttempt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return installOrbitDrag(canvas, (delta) => sceneRef.current?.rotate(delta), () => setView("perspective"));
  }, []);

  useEffect(() => {
    const startedAt = performance.now();
    inputRef.current = { materials, phase, focusedMaterialId, startedAt };
    sceneRef.current?.update(materials, phase, focusedMaterialId, startedAt);
  }, [materials, phase, focusedMaterialId]);

  const changeView = (next: "front" | "perspective") => { setView(next); sceneRef.current?.setView(next); };
  return <div className={layoutStyles.press3D} data-renderer={status}>
    <div className={layoutStyles.sceneViewport} hidden={status !== "ready"}>
      <canvas ref={canvasRef} className={layoutStyles.sceneCanvas} tabIndex={status === "ready" ? 0 : -1}
        role="img" aria-label={`ชุดทดลองแถบวัสดุทั้ง ${materials.length} ชนิดในน้ำสี 3 มิติ ${phase === "idle" ? "ก่อนจุ่ม" : phase === "done" ? "แสดงรอยเปียกหลังจับเวลา" : "กำลังจุ่มพร้อมกัน"}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          sceneRef.current?.rotate(event.key === "ArrowLeft" ? -.12 : .12);
          setView("perspective");
        }} />
    </div>
    {status !== "ready" && children}
    <div className={layoutStyles.sceneTools}>
      {status === "ready" ? <><span className={layoutStyles.sceneBadge}>3D</span><span>ลากเพื่อหมุนดู</span><div role="group" aria-label="มุมมองเครื่องทดสอบน้ำ"><button type="button" aria-pressed={view === "front"} onClick={() => changeView("front")}>มุมตรง</button><button type="button" aria-pressed={view === "perspective"} onClick={() => changeView("perspective")}>มุม 3D</button></div></> : <><span role="status">{status === "loading" ? "กำลังเตรียมเครื่องทดลองน้ำสี 3D…" : "อุปกรณ์นี้แสดง 3D ไม่ได้ · ใช้ภาพจำลองสำรอง"}</span>{status === "fallback" && <button type="button" onClick={() => { setStatus("loading"); setRendererAttempt((attempt) => attempt + 1); }}>ลองเปิด 3D อีกครั้ง</button>}</>}
    </div>
  </div>;
}
