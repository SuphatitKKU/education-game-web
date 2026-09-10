import type { ImpactDamage } from "./data";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/${path}`;
const preview: Record<ImpactDamage, string> = {
  none: "impact/impact_egg_intact.png",
  slight: "impact/impact_egg_slight.png",
  much: "impact/impact_egg_much.png",
};

/** The preview is rendered from the exact Blender model used by the 3D experiment. */
export function ImpactEgg({ damage = "none", label, className }: { damage?: ImpactDamage; label?: string; className?: string }) {
  return <svg className={className} viewBox="0 0 100 124" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <image href={asset(preview[damage])} x="-12" y="0" width="124" height="124" preserveAspectRatio="xMidYMid meet" />
  </svg>;
}
