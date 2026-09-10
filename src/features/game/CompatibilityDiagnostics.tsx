"use client";

import { useEffect, useState } from "react";
import { detectRenderCompatibility, readRendererStatuses, type RenderCompatibilityProfile, type RendererStatusRecord } from "./browser-compat";

const BUILD_VERSION = "ipad-mini2-webgl1-20260911";
const CACHE_VERSION = "parcel-lab-shell-v6-ipad-mini2";

export function CompatibilityDiagnostics() {
  const [visible, setVisible] = useState(false);
  const [profile, setProfile] = useState<RenderCompatibilityProfile | null>(null);
  const [statuses, setStatuses] = useState<Record<string, RendererStatusRecord>>({});
  const [viewport, setViewport] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("compat") !== "1") return;
    const refresh = () => {
      setProfile(detectRenderCompatibility());
      setStatuses(readRendererStatuses());
      setViewport(`${window.innerWidth}×${window.innerHeight}`);
    };
    setVisible(true);
    refresh();
    window.addEventListener("parcel-renderer-status", refresh);
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("parcel-renderer-status", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  if (!visible || !profile) return null;
  const close = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("compat");
    window.history.replaceState(null, "", url.toString());
    setVisible(false);
  };

  return <aside className="compat-diagnostics" aria-label="ข้อมูลตรวจสอบ Safari และ WebGL">
    <header><b>3D Compatibility</b><button type="button" onClick={close} aria-label="ปิดข้อมูลตรวจสอบ">×</button></header>
    <dl>
      <div><dt>Build</dt><dd>{BUILD_VERSION}</dd></div>
      <div><dt>Cache</dt><dd>{CACHE_VERSION}</dd></div>
      <div><dt>Renderer</dt><dd>{profile.renderer}</dd></div>
      <div><dt>WebGL</dt><dd>{profile.webglVersion || "ไม่มี"}</dd></div>
      <div><dt>DPR</dt><dd>{window.devicePixelRatio || 1} → {profile.maxDevicePixelRatio}</dd></div>
      <div><dt>Texture</dt><dd>{profile.maxTextureSize || "ไม่ทราบ"}</dd></div>
      <div><dt>Viewport</dt><dd>{viewport}</dd></div>
    </dl>
    <section><b>สถานะฉาก</b>{Object.keys(statuses).length === 0 ? <span>ยังไม่ได้เปิดฉาก 3D</span> : Object.entries(statuses).map(([name, value]) => <span key={name}><strong>{name}</strong>: {value.status}{value.detail ? ` · ${value.detail}` : ""}</span>)}</section>
    <details><summary>Safari user agent</summary><code>{navigator.userAgent}</code></details>
  </aside>;
}
