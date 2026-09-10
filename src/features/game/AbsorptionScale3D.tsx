"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MaterialDefinition } from "./data";
import type { AbsorptionPhase } from "./absorption";
import type { AbsorptionScene } from "./absorption-scene";
import sceneStyles from "./LabScene3D.module.css";
import { installOrbitDrag, reportRendererStatus } from "./browser-compat";

export function AbsorptionScale3D({ material, phase, children }: {
  material: MaterialDefinition;
  phase: AbsorptionPhase;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AbsorptionScene | null>(null);
  const inputRef = useRef({ material, phase, startedAt: 0 });
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
      sceneRef.current.update(current.material, current.phase, current.startedAt);
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
    inputRef.current = { material, phase, startedAt };
    sceneRef.current?.update(material, phase, startedAt);
  }, [material, phase]);

  const changeView = (next: "front" | "perspective") => { setView(next); sceneRef.current?.setView(next); };
  const weighed = phase === "weighAfter" || phase === "done";

  return <div className={sceneStyles.scene} data-renderer={status}>
    <div className={sceneStyles.viewport} hidden={status !== "ready"}>
      <canvas ref={canvasRef} className={sceneStyles.canvas} tabIndex={status === "ready" ? 0 : -1}
        role="img" aria-label={`เครื่องทดสอบการดูดซับน้ำ 3 มิติ แสดง${material.name} ${phase === "idle" ? "ก่อนสัมผัสน้ำ" : weighed ? "หลังสัมผัสน้ำ" : "กำลังทดสอบ"}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          sceneRef.current?.rotate(event.key === "ArrowLeft" ? -.12 : .12);
          setView("perspective");
        }} />
      <span className={sceneStyles.value} aria-hidden="true">{weighed ? material.waterDrops[2] : 0} หน่วย</span>
    </div>
    {status !== "ready" && (status === "loading" ? <p className={sceneStyles.status}>กำลังเตรียมเครื่องทดสอบน้ำ 3D…</p> : children)}
    <div className={sceneStyles.tools}>
      {status === "ready" ? <><span className={sceneStyles.badge}>3D</span><span>ลากเพื่อหมุนดู</span><div role="group" aria-label="มุมมองเครื่องทดสอบน้ำ"><button type="button" aria-pressed={view === "front"} onClick={() => changeView("front")}>มุมตรง</button><button type="button" aria-pressed={view === "perspective"} onClick={() => changeView("perspective")}>มุม 3D</button></div></> : <><span>{status === "fallback" ? "อุปกรณ์นี้แสดง 3D ไม่ได้ · ใช้ภาพจำลองสำรอง" : "3D"}</span>{status === "fallback" && <button type="button" onClick={() => { setStatus("loading"); setRendererAttempt((attempt) => attempt + 1); }}>ลองเปิด 3D อีกครั้ง</button>}</>}
    </div>
  </div>;
}
