"use client";

import { useEffect } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const scope = `${BASE_PATH}/`;
    const scriptUrl = `${BASE_PATH}/sw.js`;
    void navigator.serviceWorker.register(scriptUrl, { scope, updateViaCache: "none" }).catch(() => {
      // PWA support is progressive enhancement; the game remains fully usable without it.
    });
  }, []);

  return null;
}
