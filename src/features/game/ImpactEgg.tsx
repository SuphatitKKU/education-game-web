import { useId } from "react";
import type { ImpactDamage } from "./data";

/** Vector cracks are clipped to the shell, so they never float off the egg. */
export function ImpactEgg({ damage = "none", label, className }: { damage?: ImpactDamage; label?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const shell = "M50 9C28 9 14 49 14 75C14 102 29 115 50 115C71 115 86 102 86 75C86 49 72 9 50 9Z";
  return <svg className={className} viewBox="0 0 100 124" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <defs>
      <radialGradient id={`${id}-shell`} cx="32%" cy="28%" r="85%"><stop stopColor="#fff2d9" /><stop offset=".47" stopColor="#fbd59d" /><stop offset=".84" stopColor="#d6a367" /><stop offset="1" stopColor="#b8874c" /></radialGradient>
      <clipPath id={`${id}-clip`}><path d={shell} /></clipPath>
    </defs>
    <ellipse cx="50" cy="116" rx="33" ry="5" fill="#23354e" opacity=".13" />
    <path d={shell} fill={`url(#${id}-shell)`} stroke="#d6a263" strokeWidth="1.15" />
    <ellipse cx="37" cy="32" rx="8" ry="13" transform="rotate(27 37 32)" fill="#fff8e9" opacity=".63" />
    {damage !== "none" && <g clipPath={`url(#${id}-clip)`} fill="none" stroke="#af7d47" strokeWidth={damage === "much" ? 1.4 : .85} strokeLinejoin="round">
      <path d="m20 51 9 10 9-4 5 12 11 5-5 10 8 9-3 21M43 69l10-11 9 4 7-8 13 2M29 61l-4 14 9 6-3 12 9 12M53 58l-5-10 6-7" />
      {damage === "much" && <><path d="m63 57 4 16 12 6-5 13 9 9M54 87l13-8M35 80l13 4M32 21l6 14-6 9 11 9" /><path d="m39 16 6 7 10-8 4 13 11 3-8 10 4 10-13-2-9 10-8-12-11-4 10-10-3-11Z" fill="#bb8951" /><path d="m39 16 6 7 10-8 4 13 11 3-8 10" stroke="#fff0cd" strokeWidth="2.4" /></>}
    </g>}
    {damage === "much" && <><path d="m34 15 6-9 4 17Z" fill="#ffe4b8" stroke="#d0a166" /><path d="m60 9 9 9-11 8Z" fill="#f9d49d" stroke="#d0a166" /></>}
  </svg>;
}
