import { describe, expect, it } from "vitest";
import { clampHorizontalPan, clampVerticalPan, continuousMicroscopyOpacity, corrugatedZoomFrame, horizontalPanLimit, MATERIAL_MICROSCOPES, materialScaleForZoom, verticalPanLimit, type MaterialMicroscopeId } from "./MaterialMicroscope";

const activeMaterials: MaterialMicroscopeId[] = [
  "corrugated_cardboard",
  "cardboard",
  "bubble_wrap",
  "closed_cell_pe_foam",
  "pe_sheet",
];

describe("material microscope lesson", () => {
  it("moves through normal, micro and nano while zooming continuously", () => {
    expect([0, 20, 33].map(materialScaleForZoom)).toEqual(["normal", "normal", "normal"]);
    expect([34, 50, 67].map(materialScaleForZoom)).toEqual(["micro", "micro", "micro"]);
    expect([68, 85, 100].map(materialScaleForZoom)).toEqual(["nano", "nano", "nano"]);
  });

  it("keeps one continuously tightening camera path for corrugated cardboard", () => {
    const frames = Array.from({ length: 101 }, (_, depth) => corrugatedZoomFrame(depth));
    expect(frames[0]).toMatchObject({ centerX: 600, centerY: 350, width: 1200, height: 700 });
    expect(frames[100].width).toBeCloseTo(5.2);
    expect(frames.every((frame, index) => index === 0 || frame.width <= frames[index - 1].width)).toBe(true);
    expect(frames.every((frame) => Number.isFinite(frame.centerX) && Number.isFinite(frame.centerY))).toBe(true);
  });

  it("keeps a visible layer throughout every normal-to-micro-to-nano transition", () => {
    for (let depth = 0; depth <= 100; depth += 1) {
      const { micro, nano } = continuousMicroscopyOpacity(depth);
      const model = Math.max(0, Math.min(1, (54 - depth) / 16));
      const combinedOpacity = 1 - (1 - model) * (1 - micro) * (1 - nano);
      expect(combinedOpacity).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("keeps four-direction image dragging inside the microscope window", () => {
    expect(horizontalPanLimit(1000)).toBe(160);
    expect(clampHorizontalPan(-300, 1000)).toBe(-160);
    expect(clampHorizontalPan(80, 1000)).toBe(80);
    expect(clampHorizontalPan(300, 1000)).toBe(160);
    expect(verticalPanLimit(600)).toBeCloseTo(84);
    expect(clampVerticalPan(-200, 600)).toBeCloseTo(-84);
    expect(clampVerticalPan(45, 600)).toBe(45);
    expect(clampVerticalPan(200, 600)).toBeCloseTo(84);
  });

  it("provides micro and nano views for every active material", () => {
    expect(Object.keys(MATERIAL_MICROSCOPES)).toEqual(activeMaterials);
    for (const materialId of activeMaterials) {
      for (const level of ["micro", "nano"] as const) {
        const definition = MATERIAL_MICROSCOPES[materialId][level];
        expect(definition.features).toHaveLength(3);
        expect(definition.intro.length).toBeGreaterThan(30);
        expect(definition.features.every((feature) => feature.label.length > 3 && feature.detail.length > 30)).toBe(true);
        expect(new Set(definition.features.map((feature) => feature.id)).size).toBe(3);
        expect(definition.features.every((feature) => feature.x >= 20 && feature.x <= 80 && feature.y >= 20 && feature.y <= 80)).toBe(true);
        expect(definition.features.every((feature) => feature.y <= 60)).toBe(true);
        for (let featureIndex = 0; featureIndex < definition.features.length; featureIndex += 1) {
          for (let comparisonIndex = featureIndex + 1; comparisonIndex < definition.features.length; comparisonIndex += 1) {
            const first = definition.features[featureIndex];
            const second = definition.features[comparisonIndex];
            expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(20);
          }
        }
      }
    }
  });
});
