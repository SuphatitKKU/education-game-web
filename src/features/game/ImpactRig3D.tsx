"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MaterialDefinition } from "./data";
import type { ImpactPhase } from "./impact";
import type { ImpactScene } from "./impact-scene";
import sceneStyles from "./LabScene3D.module.css";

export function ImpactRig3D({ material, phase, children }: {
  material: MaterialDefinition;
  phase: ImpactPhase;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ImpactScene | null>(null);
  const inputRef = useRef({ material, phase, startedAt: 0 });
  const dragRef = useRef<{ id: number; x: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [view, setView] = useState<"front" | "perspective">("front");

  useEffect(() => {
    let active = true;
    const fail = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      if (active) setStatus("fallback");
    };
    void import("./impact-scene").then(({ createImpactScene }) => {
      if (!active || !canvasRef.current) return;
      sceneRef.current = createImpactScene(canvasRef.current, fail);
      sceneRef.current.setView(view);
      const current = inputRef.current;
      sceneRef.current.update(current.material, current.phase, current.startedAt);
      setStatus("ready");
    }).catch(fail);
    return () => { active = false; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, []);

  useEffect(() => {
    const startedAt = performance.now();
    inputRef.current = { material, phase, startedAt };
    sceneRef.current?.update(material, phase, startedAt);
  }, [material, phase]);

  const changeView = (next: "front" | "perspective") => { setView(next); sceneRef.current?.setView(next); };
  const running = phase === "preparing" || phase === "dropping" || phase === "settling";

  return <div className={sceneStyles.scene} data-renderer={status}>
    <div className={sceneStyles.viewport} hidden={status !== "ready"}>
      <canvas ref={canvasRef} className={sceneStyles.canvas} tabIndex={status === "ready" ? 0 : -1}
        role="img" aria-label={`เครื่องทดสอบแรงกระแทก 3 มิติ ใช้${material.name}รองรับไข่จำลอง ${running ? "กำลังทดลอง" : phase === "done" ? "แสดงผลหลังตกกระแทก" : "พร้อมทดลอง"}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { id: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== event.pointerId) return;
          sceneRef.current?.rotate((event.clientX - drag.x) * .006);
          drag.x = event.clientX;
          setView("perspective");
        }}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
        onLostPointerCapture={() => { dragRef.current = null; }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          sceneRef.current?.rotate(event.key === "ArrowLeft" ? -.12 : .12);
          setView("perspective");
        }} />
    </div>
    {status !== "ready" && (status === "loading" ? <p className={sceneStyles.status}>กำลังเตรียมเครื่องทดสอบแรงกระแทก 3D…</p> : children)}
    <div className={sceneStyles.tools}>
      {status === "ready" ? <><span className={sceneStyles.badge}>3D</span><span>ลากเพื่อหมุนดู</span><div role="group" aria-label="มุมมองเครื่องทดสอบแรงกระแทก"><button type="button" aria-pressed={view === "front"} onClick={() => changeView("front")}>มุมตรง</button><button type="button" aria-pressed={view === "perspective"} onClick={() => changeView("perspective")}>มุม 3D</button></div></> : <span>{status === "fallback" ? "อุปกรณ์นี้แสดง 3D ไม่ได้ · ใช้ภาพจำลองสำรอง" : "3D"}</span>}
    </div>
  </div>;
}
