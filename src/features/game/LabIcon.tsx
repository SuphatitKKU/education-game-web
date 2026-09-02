import type { ReactNode } from "react";

export type LabIconName = "flask" | "scale" | "height" | "layers" | "home" | "save" | "book" | "chart" | "play" | "size" | "bulb" | "drop" | "clock" | "surface";
export function LabIcon({ name }: { name: LabIconName }) {
  const paths: Record<LabIconName, ReactNode> = {
    flask: <><path d="M9 3h6M10 3v7L5 19q-.6 2 2 2h10q2.6 0 2-2l-5-9V3M8 15h8" /><circle cx="11" cy="18" r=".6" /></>,
    scale: <><path d="M12 3v18M7 21h10M3 7h18M6 7l-4 8h8L6 7Zm12 0-4 8h8l-4-8Z" /><circle cx="12" cy="5" r="2" /></>,
    height: <><path d="M5 3v18m-3-3 3 3 3-3M2 6l3-3 3 3M13 3h7v18h-7ZM13 7h4M13 11h3M13 15h4" /></>,
    layers: <path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5" />,
    home: <path d="m2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9" />,
    save: <path d="M4 3h13l4 4v14H3V3h1ZM7 3v7h10V3M7 21v-7h10v7" />,
    book: <path d="M6 3h14v18H6q-3 0-3-3V6q0-3 3-3Zm0 0v18M10 7h6M10 11h6M10 15h4" />,
    chart: <path d="M4 21V12h4v9M10 21V3h4v18M16 21V8h4v13" />,
    play: <path d="m7 3 15 9L7 21V3Z" fill="currentColor" stroke="none" />,
    size: <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />,
    bulb: <><path d="M8 17c0-4-3-4-3-8a7 7 0 0 1 14 0c0 4-3 4-3 8ZM8 20h8M10 23h4M12 0v-2M2 1l-2-2M22 1l2-2" /></>,
    drop: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Zm-3 14c.4 1.6 1.5 2.5 3.2 2.7" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
    surface: <><path d="M3 17h18l-3-5H6l-3 5Z" /><path d="M8 8c0 2-3 2-3 4M12 6c0 3-3 3-3 6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
