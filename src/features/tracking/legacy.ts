import { EMPTY_SAVE, type GameSave } from "@/features/game/data";
import type { LegacyBundle, LegacyStatistic } from "./types";

export const LEGACY_SAVE_KEY = "parcel-lab-web-save-v1";
export const LEGACY_STATS_KEY = "parcel-lab-group-design-statistics-v1";
export const LEGACY_IMPORTED_KEY = "parcel-lab-supabase-imported-v1";
export const SUPABASE_CACHE_BOUND_KEY = "parcel-lab-supabase-cache-bound-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseLegacyBundle(rawSave: string | null, rawStatistics: string | null): LegacyBundle {
  let save: GameSave | null = null;
  let statistics: LegacyStatistic[] = [];
  try {
    if (rawSave) {
      const parsed = JSON.parse(rawSave) as Partial<GameSave>;
      if (Array.isArray(parsed.team) && parsed.team.length >= 6) {
        save = { ...EMPTY_SAVE, ...parsed };
      }
    }
  } catch { /* malformed legacy data stays untouched */ }
  try {
    const parsed: unknown = rawStatistics ? JSON.parse(rawStatistics) : [];
    if (Array.isArray(parsed)) statistics = parsed.filter(isRecord) as LegacyStatistic[];
  } catch { /* malformed legacy data stays untouched */ }
  return { save, statistics };
}

export function readLegacyBundle(): LegacyBundle {
  if (typeof window === "undefined") return { save: null, statistics: [] };
  return parseLegacyBundle(localStorage.getItem(LEGACY_SAVE_KEY), localStorage.getItem(LEGACY_STATS_KEY));
}

export function hasLegacyData(bundle: LegacyBundle): boolean {
  return Boolean(bundle.save || bundle.statistics.length);
}

export function markLegacyImported(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(LEGACY_IMPORTED_KEY, new Date().toISOString());
    localStorage.setItem(SUPABASE_CACHE_BOUND_KEY, "true");
  }
}

export function wasLegacyImported(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(LEGACY_IMPORTED_KEY) || localStorage.getItem(SUPABASE_CACHE_BOUND_KEY));
}

export function markSupabaseCacheBound(): void {
  if (typeof window !== "undefined") localStorage.setItem(SUPABASE_CACHE_BOUND_KEY, "true");
}
