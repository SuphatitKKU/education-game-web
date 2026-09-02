"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./MaterialMicroscope.module.css";

export type MaterialMicroscopeId =
  | "corrugated_cardboard"
  | "cardboard"
  | "bubble_wrap"
  | "closed_cell_pe_foam"
  | "pe_sheet";

export type MaterialScale = "normal" | "micro" | "nano";

export function materialScaleForZoom(depth: number): MaterialScale {
  return depth < 34 ? "normal" : depth < 68 ? "micro" : "nano";
}

export type MicroscopeFeature = {
  id: string;
  label: string;
  icon: string;
  detail: string;
  x: number;
  y: number;
};

export type MicroscopeLevel = {
  eyebrow: string;
  title: string;
  scale: string;
  intro: string;
  visual: "paper" | "coated-paper" | "bubble-film" | "foam" | "pe-film" | "cellulose" | "polyethylene";
  features: readonly MicroscopeFeature[];
};

export type CorrugatedZoomFrame = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function horizontalPanLimit(viewportWidth: number) {
  return Math.max(0, viewportWidth * 0.16);
}

export function clampHorizontalPan(offset: number, viewportWidth: number) {
  const limit = horizontalPanLimit(viewportWidth);
  return clamp(offset, -limit, limit);
}

export function verticalPanLimit(viewportHeight: number) {
  return Math.max(0, viewportHeight * 0.14);
}

export function clampVerticalPan(offset: number, viewportHeight: number) {
  const limit = verticalPanLimit(viewportHeight);
  return clamp(offset, -limit, limit);
}

function useImagePan(resetKey: string) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [resetKey]);

  const viewportWidth = () => surfaceRef.current?.clientWidth ?? 0;
  const viewportHeight = () => surfaceRef.current?.clientHeight ?? 0;
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clampHorizontalPan(drag.originX + event.clientX - drag.startX, viewportWidth()),
      y: clampVerticalPan(drag.originY + event.clientY - drag.startY, viewportHeight()),
    });
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };
  const nudge = (directionX: -1 | 0 | 1, directionY: -1 | 0 | 1) => {
    const width = viewportWidth();
    const height = viewportHeight();
    setOffset((current) => ({
      x: clampHorizontalPan(current.x + directionX * width * 0.1, width),
      y: clampVerticalPan(current.y + directionY * height * 0.1, height),
    }));
  };

  return { surfaceRef, offset, dragging, begin, move, finish, nudge };
}

function PanControls({ onPan }: { onPan: (directionX: -1 | 0 | 1, directionY: -1 | 0 | 1) => void }) {
  return <div className={styles.panControls} aria-label="เครื่องมือเลื่อนภาพ">
    <button type="button" aria-label="เลื่อนภาพไปทางซ้าย" onClick={() => onPan(-1, 0)}>‹</button>
    <button type="button" aria-label="เลื่อนภาพขึ้น" onClick={() => onPan(0, -1)}>↑</button>
    <span aria-hidden="true">✥ ลากภาพได้ทุกทิศทาง</span>
    <button type="button" aria-label="เลื่อนภาพลง" onClick={() => onPan(0, 1)}>↓</button>
    <button type="button" aria-label="เลื่อนภาพไปทางขวา" onClick={() => onPan(1, 0)}>›</button>
  </div>;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function eased(progress: number) {
  const value = clamp(progress, 0, 1);
  return value * value * (3 - 2 * value);
}

export function continuousMicroscopyOpacity(depth: number) {
  const microEntry = eased((clamp(depth, 0, 100) - 20) / 20);
  const nanoBlend = eased((clamp(depth, 0, 100) - 62) / 20);
  return {
    // Keep the fully covering micrograph behind the nano image while it fades in.
    // Fading both layers at once would reveal the blue stage between them.
    micro: microEntry,
    nano: nanoBlend,
  };
}

function logarithmicLerp(from: number, to: number, progress: number) {
  return from * Math.pow(to / from, progress);
}

/** A continuous camera path: whole board -> one paper-fiber patch -> one cellulose region. */
export function corrugatedZoomFrame(depth: number): CorrugatedZoomFrame {
  const safeDepth = clamp(depth, 0, 100);
  const keyframes = [
    { depth: 0, centerX: 600, centerY: 350, width: 1200 },
    { depth: 34, centerX: 680, centerY: 238, width: 112 },
    { depth: 68, centerX: 662, centerY: 234, width: 16 },
    { depth: 100, centerX: 661, centerY: 234, width: 5.2 },
  ] as const;
  const endIndex = safeDepth <= 34 ? 1 : safeDepth <= 68 ? 2 : 3;
  const start = keyframes[endIndex - 1];
  const end = keyframes[endIndex];
  const progress = eased((safeDepth - start.depth) / (end.depth - start.depth));
  const width = logarithmicLerp(start.width, end.width, progress);
  return {
    centerX: lerp(start.centerX, end.centerX, progress),
    centerY: lerp(start.centerY, end.centerY, progress),
    width,
    height: width * (700 / 1200),
  };
}

function useAnimatedDepth(targetDepth: number) {
  const [animatedDepth, setAnimatedDepth] = useState(targetDepth);
  const currentDepth = useRef(targetDepth);

  useEffect(() => {
    const from = currentDepth.current;
    const to = clamp(targetDepth, 0, 100);
    if (Math.abs(to - from) < 0.01) return;
    const startedAt = performance.now();
    const duration = Math.min(720, 180 + Math.abs(to - from) * 7);
    let frameId = 0;
    const animate = (now: number) => {
      const progress = eased((now - startedAt) / duration);
      const nextDepth = lerp(from, to, progress);
      currentDepth.current = nextDepth;
      setAnimatedDepth(nextDepth);
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetDepth]);

  return animatedDepth;
}

type MicroscopePhoto = {
  file: string;
  alt: string;
  sourceLabel: string;
  sourceUrl: string;
  fit?: "cover" | "contain" | "panel-a";
};

const MATERIAL_MICROSCOPE_PHOTOS: Record<MaterialMicroscopeId, MicroscopePhoto | null> = {
  corrugated_cardboard: { file: "paper-fibers-micro.jpg", alt: "ภาพจากกล้องจุลทรรศน์แบบใช้แสง แสดงเส้นใยเซลลูโลสในกระดาษไขว้กัน", sourceLabel: "Wikimedia Commons · Eva Santini และ Giovanna Canu", sourceUrl: "https://commons.wikimedia.org/wiki/File:Fibre-carta.jpg" },
  // The white-front/gray-back cross section is drawn specifically instead of reusing the liner-paper photo.
  cardboard: null,
  bubble_wrap: { file: "bubble-wrap-closeup.jpg", alt: "ภาพถ่ายระยะใกล้ของแผ่นฟองอากาศจริง เห็นโดมพลาสติกใสและอากาศที่กักอยู่ภายใน", sourceLabel: "Wikimedia Commons · Juliancolton", sourceUrl: "https://commons.wikimedia.org/wiki/File:Bubble-wrap_closeup.JPG" },
  closed_cell_pe_foam: { file: "epe-closed-cell-sem.png", alt: "ภาพ FE-SEM ของโฟมพอลิเอทิลีนจริง แสดงช่องอากาศปิดและผนังเซลล์", sourceLabel: "Bohinc และคณะ · Materials 2021 · ภาพที่ 2(a)", sourceUrl: "https://doi.org/10.3390/ma14226877", fit: "contain" },
  pe_sheet: { file: "pe-sheet-ldpe-sem.png", alt: "ภาพ SEM ของผิวแผ่น LDPE ที่ยังไม่ผ่านการปรับผิว แสดงผิวเรียบต่อเนื่อง", sourceLabel: "Al-Gunaid และคณะ · Polymers 2021 · ภาพที่ 7(a)", sourceUrl: "https://doi.org/10.3390/polym13081309", fit: "contain" },
};

const paperNanoFeatures = (materialName: string): readonly MicroscopeFeature[] => [
  {
    id: "cellulose-chain",
    label: "โซ่เซลลูโลส",
    icon: "⬡",
    detail: `หน่วยน้ำตาลเล็ก ๆ ต่อกันเป็นโซ่เซลลูโลสยาว โซ่จำนวนมากรวมกันเป็นเส้นใยของ${materialName}`,
    x: 27,
    y: 35,
  },
  {
    id: "water-loving-oh",
    label: "จุดที่จับกับน้ำได้",
    icon: "💧",
    detail: "รอบโซ่เซลลูโลสมีหมู่ –OH ซึ่งจับกับโมเลกุลน้ำได้ จึงเป็นเหตุผลหนึ่งที่กระดาษเปียกและดูดน้ำได้",
    x: 69,
    y: 27,
  },
  {
    id: "hydrogen-bonds",
    label: "แรงยึดระหว่างโซ่",
    icon: "⋯",
    detail: "เส้นประแทนพันธะไฮโดรเจน แรงเล็ก ๆ หลายจุดช่วยจับโซ่เซลลูโลสให้อยู่รวมกันเป็นเส้นใย",
    x: 58,
    y: 73,
  },
];

const peNanoFeatures: readonly MicroscopeFeature[] = [
  {
    id: "pe-chain",
    label: "โซ่พลาสติก PE",
    icon: "〰",
    detail: "PE ย่อมาจากพอลิเอทิลีน โมเลกุลเป็นหน่วย –CH₂–CH₂– ต่อซ้ำกันยาวมาก คล้ายสร้อยเส้นยาว",
    x: 28,
    y: 30,
  },
  {
    id: "ordered-chains",
    label: "บริเวณที่เรียงแน่น",
    icon: "≡",
    detail: "โซ่บางช่วงวางเรียงชิดกันอย่างเป็นระเบียบ ช่วยให้ส่วนที่เป็นพลาสติกคงรูปและแข็งแรงขึ้น",
    x: 70,
    y: 32,
  },
  {
    id: "tangled-chains",
    label: "บริเวณที่โซ่พันกัน",
    icon: "➿",
    detail: "โซ่อีกบางช่วงคดและพันกัน ไม่ได้เรียงตรงทั้งหมด ส่วนนี้ช่วยให้พลาสติกโค้งงอและยืดหยุ่นได้",
    x: 56,
    y: 75,
  },
];

export const MATERIAL_MICROSCOPES: Record<MaterialMicroscopeId, { micro: MicroscopeLevel; nano: MicroscopeLevel }> = {
  corrugated_cardboard: {
    micro: {
      eyebrow: "ส่องด้วยกล้องจุลทรรศน์",
      title: "เส้นใยในกระดาษลูกฟูก",
      scale: "ประมาณ 100 ไมโครเมตร",
      intro: "จากผิวที่ดูเรียบ เมื่อขยายจะเห็นเส้นใยกระดาษไขว้กัน มีช่องว่างเล็ก ๆ และมีกาวช่วยยึดแผ่นผิวกับลอน",
      visual: "paper",
      features: [
        { id: "paper-fibers", label: "เส้นใยกระดาษ", icon: "≋", detail: "เส้นใยยาวจำนวนมากวางไขว้และเกาะกัน จึงรวมเป็นแผ่นกระดาษที่เราจับได้", x: 25, y: 32 },
        { id: "fiber-pores", label: "ช่องว่างระหว่างเส้นใย", icon: "○", detail: "บริเวณมืดระหว่างเส้นใยเป็นช่องเล็ก ๆ น้ำจึงค่อย ๆ เดินทางเข้าไปในเนื้อกระดาษได้", x: 70, y: 31 },
        { id: "starch-glue", label: "จุดที่เส้นใยเกาะกัน", icon: "●", detail: "บริเวณที่เส้นใยหลายเส้นซ้อนและเกาะกันช่วยกระจายแรง ทำให้แผ่นกระดาษไม่ขาดง่าย", x: 50, y: 56 },
      ],
    },
    nano: {
      eyebrow: "ขยายลึกถึงระดับนาโน",
      title: "ผิวเส้นใย OCC จากกล้อง AFM",
      scale: "พื้นที่สแกน 1 × 1 ไมโครเมตร · วัดผิวเป็นนาโนเมตร",
      intro: "ภาพ AFM ใช้สีบอกความสูงต่ำบนผิวเส้นใย สีสว่างคือส่วนที่สูงกว่า สีเข้มคือร่อง งานวิจัยวัดความขรุขระของผิวตัวอย่างนี้ได้ประมาณ 27.949 นาโนเมตร",
      visual: "cellulose",
      features: [
        { id: "surface-high", label: "ส่วนที่สูงของผิว", icon: "▲", detail: "บริเวณสีเหลืองสว่างคือส่วนของผิวเส้นใยที่สูงกว่า ไม่ได้หมายความว่าเส้นใยมีสีเหลืองจริง", x: 52, y: 44 },
        { id: "surface-groove", label: "ร่องบนผิว", icon: "▼", detail: "บริเวณสีแดงเข้มคือส่วนที่ต่ำหรือเป็นร่องบนผิวเส้นใย ทำให้เราเห็นว่าผิวกระดาษไม่ได้เรียบสนิท", x: 20, y: 42 },
        { id: "surface-roughness", label: "ความขรุขระนาโน", icon: "≋", detail: "บริเวณที่สีสว่างและสีเข้มสลับกันแสดงความขรุขระ เครื่อง AFM วัดตัวอย่างนี้ได้ประมาณ 27.949 นาโนเมตร", x: 74, y: 60 },
      ],
    },
  },
  cardboard: {
    micro: {
      eyebrow: "ภาพจริงจากกล้อง FIB-SEM",
      title: "ชั้นเคลือบสีขาวและเส้นใยกระดาษ",
      scale: "ระดับไมโคร · มองเห็นหน้าตัดของกระดาษเคลือบ",
      intro: "ภาพตัดขวางจริงทำให้เห็นชั้นเคลือบบาง ๆ อยู่บนชั้นเส้นใย เส้นใยหลายเส้นซ้อนกันและมีช่องว่างเล็ก ๆ อยู่ด้านใน",
      visual: "coated-paper",
      features: [
        { id: "white-coating", label: "ชั้นเคลือบสีขาว", icon: "▰", detail: "แถบบางด้านบนคือชั้นเคลือบที่ช่วยให้หน้ากระดาษเรียบ สว่าง และพิมพ์สีได้ชัด", x: 72, y: 20 },
        { id: "pressed-fibers", label: "ชั้นเส้นใยกระดาษ", icon: "≋", detail: "เส้นใยจำนวนมากวางซ้อนและไขว้กัน จึงรวมเป็นแผ่นกระดาษที่แข็งกว่ากระดาษบาง", x: 35, y: 43 },
        { id: "gray-recycled-fibers", label: "ช่องว่างระหว่างเส้นใย", icon: "○", detail: "ส่วนสีดำระหว่างเส้นใยคือช่องว่างเล็ก ๆ จึงทำให้น้ำค่อย ๆ ซึมเข้าเนื้อกระดาษได้", x: 66, y: 55 },
      ],
    },
    nano: {
      eyebrow: "ภาพจริงจากกล้อง AFM",
      title: "ความสูงต่ำของผิวกระดาษเคลือบ",
      scale: "พื้นที่สแกน 10 × 10 ไมโครเมตร · ความสูง 0–500 นาโนเมตร",
      intro: "กล้อง AFM ใช้สีบอกความสูงต่ำบนผิวกระดาษ สีสว่างคือส่วนที่สูงกว่า สีเข้มคือร่อง จึงเห็นได้ว่าผิวที่ดูเรียบยังขรุขระเล็กมาก",
      visual: "cellulose",
      features: [
        { id: "surface-high", label: "ส่วนที่สูงของผิว", icon: "▲", detail: "บริเวณสีชมพูและเหลืองสว่างคือส่วนที่สูงกว่า ไม่ใช่สีจริงของกระดาษ", x: 38, y: 30 },
        { id: "surface-groove", label: "ร่องต่ำบนผิว", icon: "▼", detail: "บริเวณสีแดงเข้มหรือดำคือร่องต่ำมากบนผิวกระดาษ ซึ่งวัดความลึกเป็นหน่วยนาโนเมตร", x: 25, y: 55 },
        { id: "surface-roughness", label: "ความขรุขระระดับนาโน", icon: "≋", detail: "ตัวอย่างกระดาษเคลือบนี้มีค่าความขรุขระเฉลี่ยประมาณ 100.3 นาโนเมตร แม้มือของเราจะรู้สึกว่าผิวเรียบ", x: 72, y: 50 },
      ],
    },
  },
  bubble_wrap: {
    micro: {
      eyebrow: "ภาพจริงจากกล้อง SEM",
      title: "ผิวของฟิล์ม LDPE",
      scale: "กำลังขยาย 20,000 เท่า",
      intro: "เมื่อซูมเข้าไปที่ผนังฟอง จะเห็นลายและรอยสูงต่ำที่เกิดตอนผลิตฟิล์ม ภาพนี้เป็นฟิล์ม LDPE จริงที่ยังไม่ผ่านการปรับผิว",
      visual: "bubble-film",
      features: [
        { id: "ldpe-surface", label: "ผิวฟิล์ม LDPE", icon: "▱", detail: "ผนังฟองทำจากฟิล์มพลาสติกบาง ภาพ SEM ทำให้เราเห็นผิวของฟิล์มได้ละเอียดกว่าตาเปล่า", x: 25, y: 32 },
        { id: "micro-texture", label: "ลายจากการผลิตฟิล์ม", icon: "≋", detail: "เส้นสีเทาอ่อนและเข้มคือลายและรอยสูงต่ำบนผิว แม้มือเราจะรู้สึกว่าฟิล์มเรียบ แต่ผิวจริงไม่เรียบสนิท", x: 72, y: 31 },
        { id: "micro-valley", label: "ร่องตื้นระหว่างลาย", icon: "⌄", detail: "ส่วนสีเข้มระหว่างลายคือร่องตื้นมากบนผิว ไม่ใช่รูทะลุ จึงยังช่วยกั้นน้ำและเก็บอากาศในฟองได้", x: 50, y: 57 },
      ],
    },
    nano: {
      eyebrow: "ภาพจริงจากกล้อง AFM",
      title: "แผนที่ความสูงต่ำของผิว LDPE",
      scale: "พื้นที่สแกน 1 × 1 ไมโครเมตร · ความขรุขระเฉลี่ย 2.5 นาโนเมตร",
      intro: "ภาพ AFM ใช้สีช่วยบอกความสูงต่ำของผิว สีสว่างคือส่วนที่สูงกว่า สีเข้มคือร่อง จึงเห็นลายระดับนาโนบนฟิล์มที่ดูเรียบด้วยตาเปล่า",
      visual: "polyethylene",
      features: [
        { id: "nano-high", label: "ส่วนสว่างที่สูงกว่า", icon: "▲", detail: "บริเวณสีขาวและเหลืองคือส่วนที่สูงกว่า สีในภาพช่วยบอกความสูง ไม่ใช่สีจริงของพลาสติก", x: 27, y: 31 },
        { id: "nano-valley", label: "ร่องสีเข้มที่ต่ำกว่า", icon: "▼", detail: "บริเวณสีน้ำตาลเข้มคือร่องเล็ก ๆ บนผิว ไม่ใช่รูทะลุ ผนังฟองจึงยังช่วยกั้นน้ำได้", x: 72, y: 36 },
        { id: "nano-roughness", label: "ขรุขระเฉลี่ย 2.5 นาโนเมตร", icon: "≋", detail: "บริเวณที่สีสว่างและเข้มสลับกันแสดงความขรุขระ ซึ่งเฉลี่ยเพียง 2.5 นาโนเมตร จึงดูเรียบเมื่อเราสัมผัส", x: 50, y: 58 },
      ],
    },
  },
  closed_cell_pe_foam: {
    micro: {
      eyebrow: "ภาพจริงจากกล้อง FE-SEM",
      title: "เซลล์อากาศปิดในโฟม EPE",
      scale: "แถบมาตราส่วน 100 ไมโครเมตร · เซลล์ประมาณ 200 ไมโครเมตร",
      intro: "ภาพจริงจากกล้องกำลังขยายสูงแสดงว่าโฟม EPE ไม่ได้ตัน ข้างในมีห้องอากาศเล็ก ๆ จำนวนมาก แต่ละห้องมีผนังพลาสติกบางล้อมไว้",
      visual: "foam",
      features: [
        { id: "closed-cells", label: "ห้องอากาศปิด", icon: "⬡", detail: "ส่วนมืดคือห้องอากาศเล็ก ๆ ที่แยกจากกัน น้ำจึงผ่านเข้าไปข้างในโฟมได้ยาก", x: 25, y: 32 },
        { id: "cell-wall", label: "ผนังพลาสติกบาง", icon: "⬢", detail: "เส้นสว่างที่กั้นแต่ละห้องคือผนัง PE บาง ๆ เมื่อถูกกด ผนังจะโค้งเพื่อช่วยรับแรง", x: 50, y: 44 },
        { id: "trapped-gas", label: "อากาศที่ถูกกักไว้", icon: "•", detail: "บริเวณมืดภายในห้องคืออากาศที่ถูกกักไว้ ช่วยให้โฟมเบา นุ่ม และค่อย ๆ คืนรูปหลังปล่อยแรงกด", x: 74, y: 58 },
      ],
    },
    nano: {
      eyebrow: "ภาพจริงจากกล้อง SEM",
      title: "แผ่นผลึกเล็กในเนื้อผนัง PE",
      scale: "แถบมาตราส่วน 2 ไมโครเมตร · แผ่นผลึกหนาประมาณ 8 นาโนเมตร",
      intro: "ภาพนี้ขยายเนื้อ LDPE ที่ใช้แทนเนื้อพลาสติกในผนังโฟม เส้นสว่างเล็ก ๆ คือแผ่นผลึกบางมาก ส่วนพื้นที่มืดคือ PE ที่เรียงตัวไม่เป็นระเบียบ",
      visual: "polyethylene",
      features: [
        { id: "crystal-lamellae", label: "แผ่นผลึกบาง", icon: "≋", detail: "เส้นสว่างโค้ง ๆ คือแผ่นผลึกของ PE แต่ละแผ่นบางประมาณ 8 นาโนเมตร เล็กกว่าที่ตาเรามองเห็นมาก", x: 25, y: 34 },
        { id: "amorphous-pe", label: "ส่วน PE ที่ไม่เรียงตัว", icon: "~", detail: "พื้นที่มืดระหว่างแผ่นผลึกคือส่วนของ PE ที่โซ่ไม่เรียงตัวเป็นระเบียบ จึงช่วยให้เนื้อพลาสติกยืดหยุ่น", x: 72, y: 37 },
        { id: "wall-matrix", label: "เนื้อผนังโฟม PE", icon: "▰", detail: "บริเวณที่มีแผ่นผลึกสว่างกระจายในพื้นมืดคือเนื้อผนังโฟม ทำให้ผนังทั้งแข็งแรงและยืดหยุ่นได้", x: 50, y: 58 },
      ],
    },
  },
  pe_sheet: {
    micro: {
      eyebrow: "ภาพจริงจากกล้อง SEM",
      title: "ผิวต่อเนื่องของแผ่น LDPE",
      scale: "ขยาย 20,000 เท่า · แถบมาตราส่วน 5 ไมโครเมตร",
      intro: "ภาพจริงจากกล้องกำลังขยายสูงแสดงผิวของแผ่น LDPE ที่ยังไม่ปรับผิว เนื้อพลาสติกต่อเนื่องและไม่มีช่องเปิดขนาดใหญ่ให้เห็น",
      visual: "pe-film",
      features: [
        { id: "continuous-surface", label: "ผิวเรียบต่อเนื่อง", icon: "▱", detail: "พื้นสีเทาที่ต่อเนื่องคือผิว LDPE จริง ผิวเรียบนี้ช่วยให้น้ำเกาะอยู่ด้านบนและซึมเข้าเนื้อได้ยาก", x: 28, y: 34 },
        { id: "shallow-texture", label: "รอยนูนตื้น ๆ", icon: "≋", detail: "ลายจาง ๆ เป็นรอยสูงต่ำเล็กมากบนผิวที่เกิดจากการผลิต ถึงมองด้วยตาเปล่าจะรู้สึกว่าผิวเรียบ", x: 67, y: 35 },
        { id: "no-large-openings", label: "ไม่มีช่องเปิดใหญ่", icon: "◯", detail: "ในภาพนี้ไม่พบรูเปิดขนาดใหญ่ทะลุผิว เนื้อพลาสติกที่ต่อกันจึงช่วยกั้นหยดน้ำได้ดี", x: 51, y: 58 },
      ],
    },
    nano: {
      eyebrow: "ภาพจริงจากกล้อง AFM",
      title: "แผนที่ความสูงต่ำของผิว LDPE",
      scale: "พื้นที่สแกน 5 × 5 ไมโครเมตร · ความขรุขระเฉลี่ย 3.4 นาโนเมตร",
      intro: "กล้อง AFM ใช้สีช่วยบอกความสูงต่ำบนผิวแผ่น LDPE สีสว่างคือส่วนที่สูงกว่าและสีเข้มคือร่องเล็ก ๆ ไม่ใช่สีจริงของพลาสติก",
      visual: "polyethylene",
      features: [
        { id: "afm-high", label: "ส่วนสูงสีสว่าง", icon: "▲", detail: "บริเวณสีขาวและสีทองคือยอดนูนที่สูงกว่า สีเป็นแผนที่ความสูง ไม่ใช่สีจริงของแผ่นพลาสติก", x: 30, y: 34 },
        { id: "afm-valley", label: "ร่องต่ำสีเข้ม", icon: "▼", detail: "บริเวณสีน้ำตาลเข้มคือร่องตื้นมากบนผิว ไม่ใช่รูทะลุ แผ่น PE จึงยังช่วยกั้นน้ำได้", x: 67, y: 38 },
        { id: "afm-roughness", label: "ขรุขระเฉลี่ย 3.4 นาโนเมตร", icon: "≋", detail: "ผิวตัวอย่างขรุขระเฉลี่ยเพียง 3.4 นาโนเมตร เล็กมากจนเมื่อใช้นิ้วสัมผัส เราจึงรู้สึกว่าแผ่นเรียบลื่น", x: 51, y: 58 },
      ],
    },
  },
};

function PaperMicroArt({ coated = false }: { coated?: boolean }) {
  const fibers = [
    "M20 95 C150 5 260 155 410 58 S650 50 790 120",
    "M0 205 C155 100 245 280 420 160 S635 125 810 210",
    "M5 335 C155 230 310 395 455 275 S650 260 800 350",
    "M70 450 C165 335 315 465 470 380 S670 350 770 430",
    "M70 10 C130 125 95 265 210 470",
    "M335 -10 C275 120 390 255 315 470",
    "M585 0 C520 130 650 285 555 470",
    "M750 20 C650 145 770 290 690 460",
  ];
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <defs>
      <linearGradient id="paperBg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9a765"/><stop offset="1" stopColor="#9c6838"/></linearGradient>
      <linearGradient id="coat" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fffef4"/><stop offset="1" stopColor="#dfe8e7"/></linearGradient>
    </defs>
    <rect width="800" height="480" fill={coated ? "#7b746a" : "url(#paperBg)"}/>
    {coated && <g className={styles.part} data-part="white-coating"><path d="M0 0h800v82C620 65 520 94 390 72 260 50 115 98 0 70Z" fill="url(#coat)"/><circle cx="110" cy="38" r="7" fill="#cddbdc"/><circle cx="260" cy="48" r="5" fill="#e4c990"/><circle cx="615" cy="36" r="8" fill="#cad8dc"/></g>}
    <g className={styles.part} data-part={coated ? "pressed-fibers" : "paper-fibers"} fill="none" strokeLinecap="round">
      {fibers.map((path, index) => <path key={path} d={path} stroke={coated ? ["#a6a29b", "#cbc2ad", "#8b8881"][index % 3] : ["#f1cf91", "#bb793e", "#e9bd75"][index % 3]} strokeWidth={index % 2 ? 25 : 32}/>) }
    </g>
    {!coated && <g className={styles.part} data-part="fiber-pores" fill="#704526" opacity=".72"><ellipse cx="245" cy="115" rx="31" ry="18"/><ellipse cx="520" cy="213" rx="36" ry="22"/><ellipse cx="690" cy="315" rx="27" ry="16"/></g>}
    {!coated && <g className={styles.part} data-part="starch-glue" fill="#f8dc55" stroke="#b58620" strokeWidth="5"><circle cx="356" cy="248" r="22"/><circle cx="382" cy="264" r="15"/><circle cx="405" cy="244" r="18"/></g>}
    {coated && <g className={styles.part} data-part="gray-recycled-fibers"><path d="M0 380C170 342 260 438 410 390s260 8 390-35v125H0Z" fill="#605f5d" opacity=".8"/><path d="M35 430c130-70 265 65 410-5s245 20 340-18" fill="none" stroke="#aaa59d" strokeWidth="25" strokeLinecap="round"/><circle cx="180" cy="411" r="9" fill="#cf9c63"/><circle cx="620" cy="425" r="12" fill="#343b45"/></g>}
  </svg>;
}

function BubbleFilmArt() {
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <defs><linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#eafaff" stopOpacity=".92"/><stop offset="1" stopColor="#74caee" stopOpacity=".55"/></linearGradient></defs>
    <rect width="800" height="480" fill="#183f61"/>
    <g className={styles.part} data-part="bubble-cap" fill="url(#bubble)" stroke="#b8efff" strokeWidth="8"><path d="M55 330C82 95 188 45 285 330Z"/><path d="M285 330C315 135 405 82 492 330Z"/><path d="M492 330C525 170 615 118 748 330Z"/></g>
    <g className={styles.part} data-part="air-pocket" fill="#bcecff" opacity=".28"><ellipse cx="177" cy="239" rx="91" ry="118"/><ellipse cx="390" cy="253" rx="75" ry="100"/><ellipse cx="618" cy="268" rx="93" ry="80"/></g>
    <g className={styles.part} data-part="flat-base-film"><rect x="28" y="330" width="744" height="42" rx="18" fill="#9de4fa" stroke="#d8f8ff" strokeWidth="7"/></g>
    <g fill="#fff" opacity=".75"><circle cx="135" cy="210" r="7"/><circle cx="190" cy="170" r="5"/><circle cx="390" cy="224" r="6"/><circle cx="630" cy="247" r="7"/></g>
  </svg>;
}

function FoamArt() {
  const cells = [
    [95,80,68],[245,72,78],[420,82,72],[610,72,88],[735,110,55],
    [60,230,70],[205,220,86],[385,230,74],[555,220,91],[720,250,75],
    [105,390,78],[275,380,88],[470,385,92],[660,390,82],
  ];
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <rect width="800" height="480" fill="#e8eee8"/>
    <g className={styles.part} data-part="cell-wall" fill="none" stroke="#94a99d" strokeWidth="18">
      {cells.map(([x,y,r]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r} ry={r * .78}/>) }
    </g>
    <g className={styles.part} data-part="closed-cells" fill="#fafffb" stroke="#d7e1da" strokeWidth="4">
      {cells.map(([x,y,r]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r - 12} ry={r * .78 - 12}/>) }
    </g>
    <g className={styles.part} data-part="trapped-gas" fill="#62c4ee" opacity=".55">
      {[cells[1], cells[7], cells[12]].map(([x,y]) => <g key={`${x}-${y}`}><circle cx={x-16} cy={y+4} r="8"/><circle cx={x+8} cy={y-13} r="6"/><circle cx={x+25} cy={y+12} r="5"/></g>)}
    </g>
  </svg>;
}

function PeFilmArt() {
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <defs><linearGradient id="film" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dff8ff"/><stop offset=".5" stopColor="#8ed7f1"/><stop offset="1" stopColor="#e9fbff"/></linearGradient></defs>
    <rect width="800" height="480" fill="#173d5b"/>
    <g className={styles.part} data-part="smooth-film"><path d="M25 66C210 22 382 92 540 55s190-2 235 18v336c-205 45-345-34-510 4S70 424 25 405Z" fill="url(#film)" opacity=".88" stroke="#d8f8ff" strokeWidth="7"/></g>
    <g className={styles.part} data-part="crystal-lamellae" fill="none" stroke="#247eae" strokeWidth="12" strokeLinecap="round" opacity=".78">
      {[0,1,2,3,4].map(i => <path key={i} d={`M430 ${125+i*32}h225`}/>) }
    </g>
    <g className={styles.part} data-part="amorphous-region" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".72"><path d="M105 170c70-92 104 97 176 5s109 67 59 137-157-60-222 36"/><path d="M330 320c65-80 118 67 184-10s98 32 139 54"/></g>
  </svg>;
}

function CelluloseArt({ coated }: { coated: boolean }) {
  const chains = [95, 225, 355];
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <rect width="800" height="480" fill={coated ? "#363b48" : "#143a52"}/>
    {coated && <g><path d="M0 0h800v92H0z" fill="#f8f6e9"/><path d="M0 92h800v22H0z" fill="#aeb9c0"/><g fill="#d9c8a1" stroke="#fff" strokeWidth="3"><circle cx="90" cy="44" r="18"/><circle cx="185" cy="58" r="13"/><circle cx="305" cy="35" r="20"/><circle cx="445" cy="62" r="16"/><circle cx="585" cy="38" r="22"/><circle cx="710" cy="60" r="14"/></g><text x="24" y="30" fill="#5e6673" fontSize="18">ชั้นแร่สีขาวบนผิวหน้า</text></g>}
    <g className={styles.part} data-part="cellulose-chain" fill={coated ? "#c6a46b" : "#e5a34e"} stroke={coated ? "#f5e6c5" : "#fff0b6"} strokeWidth="5" transform={coated ? "translate(0 72) scale(1 .84)" : undefined}>
      {chains.map((y, row) => <g key={y}>{[0,1,2,3,4].map(i => <g key={i} transform={`translate(${95+i*135 + (row%2)*30} ${y})`}><polygon points="-38,0 -19,-33 19,-33 38,0 19,33 -19,33"/><path d="M38 0h59" fill="none"/></g>)}</g>)}
    </g>
    <g className={styles.part} data-part="water-loving-oh" fill="#66cfff" fontSize="22" fontWeight="800" transform={coated ? "translate(0 65)" : undefined}>
      <text x="160" y="64">–OH</text><text x="570" y="194">–OH</text><text x="302" y="325">–OH</text><text x="690" y="445">–OH</text>
      <g transform="translate(650 90)"><circle r="24" fill="#ef6262"/><circle cx="-25" cy="-18" r="13" fill="#fff"/><circle cx="25" cy="-18" r="13" fill="#fff"/></g>
    </g>
    <g className={styles.part} data-part="hydrogen-bonds" stroke="#71e3ff" strokeWidth="6" strokeDasharray="10 12" opacity=".9" transform={coated ? "translate(0 55)" : undefined}><path d="M205 135v53M470 135v53M335 265v53M600 265v53"/></g>
  </svg>;
}

function FlatPolyethyleneArt() {
  const zigzag = (y: number, start = 60) => `M${start} ${y} ${start+55} ${y-32} ${start+110} ${y} ${start+165} ${y-32} ${start+220} ${y} ${start+275} ${y-32}`;
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <rect width="800" height="480" fill="#163a59"/>
    <g className={styles.part} data-part="pe-chain" fill="none" stroke="#ffcb56" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round"><path d={zigzag(105)}/><path d={zigzag(165,90)}/></g>
    <g className={styles.part} data-part="ordered-chains" fill="none" stroke="#7ad7ff" strokeWidth="10" strokeLinecap="round">
      {[245,285,325].map(y => <path key={y} d={zigzag(y,420)}/>) }
    </g>
    <g className={styles.part} data-part="tangled-chains" fill="none" stroke="#ef8ce9" strokeWidth="11" strokeLinecap="round"><path d="M55 270c65-105 125 95 193 0s144 40 78 112-178-62-257 45"/><path d="M245 400c46-82 100 40 143-25"/></g>
    <g fill="#fff" opacity=".88" fontSize="18" fontWeight="800"><text x="67" y="80">CH₂</text><text x="174" y="80">CH₂</text><text x="286" y="80">CH₂</text></g>
  </svg>;
}

function BubblePolyethyleneArt() {
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <rect width="800" height="480" fill="#0d3857"/>
    <path d="M45 392C92 88 244 24 400 24s308 64 355 368" fill="#6ec9ea22" stroke="#92e5ff" strokeWidth="56"/>
    <path d="M70 410h660" stroke="#92e5ff" strokeWidth="46" strokeLinecap="round"/>
    <text x="400" y="235" fill="#d8f7ff" opacity=".7" fontSize="46" textAnchor="middle">อากาศในฟอง</text>
    <g className={styles.part} data-part="pe-chain" fill="none" stroke="#ffcc55" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"><path d="M100 334l46-45 46 20 46-48 46 13 46-52 46 8"/><path d="M424 230l42-6 42 51 42-10 42 48 42-18 45 39"/></g>
    <g className={styles.part} data-part="ordered-chains" fill="none" stroke="#64d5ff" strokeWidth="9"><path d="M146 392h220M430 392h220"/><path d="M160 414h190M448 414h185"/></g>
    <g className={styles.part} data-part="tangled-chains" fill="none" stroke="#f08be7" strokeWidth="10" strokeLinecap="round"><path d="M170 150c55-63 94 48 145-13s103 27 60 80"/><path d="M470 118c48-48 95 34 132-7s76 21 64 66"/></g>
    <g fill="#fff" fontSize="17" fontWeight="800"><text x="110" y="320">CH₂</text><text x="236" y="250">CH₂</text><text x="535" y="300">CH₂</text></g>
  </svg>;
}

function FoamPolyethyleneArt() {
  const zigzags = [145, 205, 265, 325];
  return <svg viewBox="0 0 800 480" aria-hidden="true">
    <rect width="800" height="480" fill="#19394a"/>
    <ellipse cx="120" cy="240" rx="225" ry="205" fill="#dff7f2" opacity=".13" stroke="#a7e6d9" strokeWidth="20"/>
    <ellipse cx="680" cy="240" rx="225" ry="205" fill="#dff7f2" opacity=".13" stroke="#a7e6d9" strokeWidth="20"/>
    <path d="M332 0c64 80 45 140 85 225s28 165 61 255H322c-28-104-4-164-34-246S278 80 305 0Z" fill="#80d7c7" opacity=".5" stroke="#c8fff5" strokeWidth="7"/>
    <text x="105" y="250" fill="#d9fff7" opacity=".72" fontSize="32" textAnchor="middle">อากาศ</text><text x="695" y="250" fill="#d9fff7" opacity=".72" fontSize="32" textAnchor="middle">อากาศ</text>
    <g className={styles.part} data-part="pe-chain" fill="none" stroke="#ffcf5d" strokeWidth="9" strokeLinejoin="round">
      {zigzags.map((y,i) => <path key={y} d={`M315 ${y}l25-20 25 20 25-20 25 20 25-20 25 20`} transform={`rotate(${i%2 ? 8 : -7} 390 ${y})`}/>) }
    </g>
    <g className={styles.part} data-part="ordered-chains" stroke="#67d8ff" strokeWidth="8"><path d="M342 70l85 340M373 62l84 340"/></g>
    <g className={styles.part} data-part="tangled-chains" fill="none" stroke="#f38ce8" strokeWidth="10" strokeLinecap="round"><path d="M320 105c85-62 26 100 103 35s-2 116 43 155-28 92 3 142"/></g>
  </svg>;
}

function NanoArt({ materialId }: { materialId: MaterialMicroscopeId }) {
  if (materialId === "corrugated_cardboard") return <CelluloseArt coated={false} />;
  if (materialId === "cardboard") return <CelluloseArt coated />;
  if (materialId === "bubble_wrap") return <BubblePolyethyleneArt />;
  if (materialId === "closed_cell_pe_foam") return <FoamPolyethyleneArt />;
  return <FlatPolyethyleneArt />;
}

const MATERIAL_ZOOM_ORIGINS: Record<MaterialMicroscopeId, string> = {
  corrugated_cardboard: "58% 45%",
  cardboard: "52% 46%",
  bubble_wrap: "47% 42%",
  closed_cell_pe_foam: "54% 51%",
  pe_sheet: "50% 50%",
};

export function CorrugatedContinuousZoom({ depth, level, selectedId, onSelect }: { depth: number; level: MaterialScale; selectedId: string; onSelect: (featureId: string) => void }) {
  const animatedDepth = useAnimatedDepth(depth);
  const microProgress = eased((animatedDepth - 26) / 42);
  const nanoProgress = eased((animatedDepth - 62) / 38);
  const { micro: microOpacity, nano: nanoOpacity } = continuousMicroscopyOpacity(animatedDepth);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const readout = level === "micro"
    ? { eyebrow: "ภาพ SEM ของเยื่อกล่องลูกฟูกจริง", scale: "ระดับไมโคร · เห็นเส้นใย OCC ไขว้กัน" }
    : { eyebrow: "ภาพ AFM ของผิวเส้นใย OCC จริง", scale: "สแกน 1 × 1 ไมโครเมตร · ความสูงวัดเป็นนาโนเมตร" };
  const sourceLabel = level === "micro" ? "SEM ภาพ 2(a)" : "AFM ภาพ 3(a)";
  const features = level === "normal" ? [] : MATERIAL_MICROSCOPES.corrugated_cardboard[level].features;
  const pan = useImagePan(level);
  return <div className={styles.continuousZoom} data-selected={selectedId} data-level={level}>
    {level !== "normal" && <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.photoLayer} ${styles.microPhoto}`} style={{ opacity: microOpacity, transform: `scale(${1.35 + microProgress * .42})` }}>
        <img src={`${basePath}/assets/microscopy/corrugated-occ-sem.png`} alt="ภาพ SEM จริงของแผ่นกระดาษที่ทำจากเยื่อกล่องลูกฟูกเก่า เห็นเส้นใยกระดาษไขว้กัน" draggable={false} />
      </div>
      <div className={`${styles.photoLayer} ${styles.nanoPhoto}`} style={{ opacity: nanoOpacity, transform: `scale(${1.35 + nanoProgress * .34})` }}>
        <img src={`${basePath}/assets/microscopy/corrugated-occ-afm.png`} alt="ภาพ AFM จริงของผิวเส้นใยจากเยื่อกล่องลูกฟูกเก่า สีแสดงความสูงต่ำของผิว" draggable={false} />
      </div>
      {features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature.id)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>}
    {level !== "normal" && <div className={styles.readout}><span>{readout.eyebrow}</span><b>{readout.scale}</b></div>}
    {level !== "normal" && <PanControls onPan={pan.nudge} />}
    {level !== "normal" && <div className={styles.continuousPath} aria-hidden="true"><span>โมเดล 3D</span><i>›</i><span className={level === "micro" ? styles.pathActive : ""}>ภาพ SEM</span><i>›</i><span className={level === "nano" ? styles.pathActive : ""}>ภาพ AFM</span></div>}
    {level !== "normal" && <div className={styles.note}>ภาพจริงจาก <a href="https://doi.org/10.1155/2019/9490602" target="_blank" rel="noreferrer">Chen และคณะ (2019) · {sourceLabel}</a> · สี AFM ใช้แทนความสูง ไม่ใช่สีจริง</div>}
  </div>;
}

export function CardboardContinuousZoom({ depth, level, selectedId, onSelect }: { depth: number; level: MaterialScale; selectedId: string; onSelect: (featureId: string) => void }) {
  const animatedDepth = useAnimatedDepth(depth);
  const microProgress = eased((animatedDepth - 26) / 42);
  const nanoProgress = eased((animatedDepth - 62) / 38);
  const { micro: microOpacity, nano: nanoOpacity } = continuousMicroscopyOpacity(animatedDepth);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const readout = level === "micro"
    ? { eyebrow: "ภาพ FIB-SEM ของกระดาษเคลือบจริง", scale: "ระดับไมโคร · เห็นชั้นเคลือบและชั้นเส้นใย" }
    : { eyebrow: "ภาพ AFM ของผิวกระดาษเคลือบจริง", scale: "พื้นที่ 10 × 10 ไมโครเมตร · ความสูงวัดเป็นนาโนเมตร" };
  const features = level === "normal" ? [] : MATERIAL_MICROSCOPES.cardboard[level].features;
  const pan = useImagePan(`cardboard-${level}`);
  return <div className={styles.continuousZoom} data-selected={selectedId} data-level={level} data-material="cardboard">
    {level !== "normal" && <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.photoLayer} ${styles.cardboardMicroPhoto}`} style={{ opacity: microOpacity, transform: `scale(${1.04 + microProgress * .5})` }}>
        <img src={`${basePath}/assets/microscopy/cardboard-coated-paper-fib-sem.jpg`} alt="ภาพ FIB-SEM จริงของหน้าตัดกระดาษเคลือบ เห็นชั้นเคลือบและชั้นเส้นใยกระดาษ" draggable={false} />
      </div>
      <div className={`${styles.photoLayer} ${styles.cardboardNanoPhoto}`} style={{ opacity: nanoOpacity, transform: `scale(${1.08 + nanoProgress * .38})` }}>
        <img src={`${basePath}/assets/microscopy/cardboard-coated-paper-afm.png`} alt="ภาพ AFM จริงของผิวกระดาษเคลือบ สีแสดงความสูงตั้งแต่ 0 ถึง 500 นาโนเมตร" draggable={false} />
      </div>
      {features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature.id)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>}
    {level !== "normal" && <div className={styles.readout}><span>{readout.eyebrow}</span><b>{readout.scale}</b></div>}
    {level !== "normal" && <PanControls onPan={pan.nudge} />}
    {level !== "normal" && <div className={styles.continuousPath} aria-hidden="true"><span>โมเดล 3D</span><i>›</i><span className={level === "micro" ? styles.pathActive : ""}>ภาพ FIB-SEM</span><i>›</i><span className={level === "nano" ? styles.pathActive : ""}>ภาพ AFM</span></div>}
    {level === "micro" && <div className={styles.note}>ภาพจริงจาก <a href="https://doi.org/10.1007/s11242-018-1183-2" target="_blank" rel="noreferrer">Aslannejad และคณะ (2019) · ภาพที่ 4</a></div>}
    {level === "nano" && <div className={styles.note}>ภาพจริงจาก <a href="https://bioresources.cnr.ncsu.edu/resources/characterization-of-ink-pigment-penetration-and-distribution-related-to-surface-topography-of-paper-using-confocal-laser-scanning-microscopy/" target="_blank" rel="noreferrer">Li และ He (2011) · ภาพที่ 2(a)</a> · สีแทนความสูง ไม่ใช่สีจริง</div>}
  </div>;
}

export function BubbleWrapContinuousZoom({ depth, level, selectedId, onSelect }: { depth: number; level: MaterialScale; selectedId: string; onSelect: (featureId: string) => void }) {
  const animatedDepth = useAnimatedDepth(depth);
  const microProgress = eased((animatedDepth - 26) / 42);
  const nanoProgress = eased((animatedDepth - 62) / 38);
  const { micro: microOpacity, nano: nanoOpacity } = continuousMicroscopyOpacity(animatedDepth);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const readout = level === "micro"
    ? { eyebrow: "ภาพ SEM ของฟิล์ม LDPE จริง", scale: "ขยาย 20,000 เท่า" }
    : { eyebrow: "ภาพ AFM ของผิวฟิล์ม LDPE จริง", scale: "พื้นที่ 1 × 1 ไมโครเมตร · ความขรุขระ 2.5 นาโนเมตร" };
  const features = level === "normal" ? [] : MATERIAL_MICROSCOPES.bubble_wrap[level].features;
  const pan = useImagePan(`bubble-wrap-${level}`);
  return <div className={styles.continuousZoom} data-selected={selectedId} data-level={level} data-material="bubble-wrap">
    {level !== "normal" && <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.photoLayer} ${styles.bubbleMicroPhoto}`} style={{ opacity: microOpacity, transform: `scale(${1.06 + microProgress * .46})` }}>
        <img src={`${basePath}/assets/microscopy/bubble-wrap-ldpe-sem-hq.png`} alt="ภาพ SEM ความละเอียดสูงของผิวฟิล์ม LDPE ที่ยังไม่ปรับผิว กำลังขยาย 20,000 เท่า" draggable={false} />
      </div>
      <div className={`${styles.photoLayer} ${styles.bubbleNanoPhoto}`} style={{ opacity: nanoOpacity, transform: `scale(${1.08 + nanoProgress * .38})` }}>
        <img src={`${basePath}/assets/microscopy/bubble-wrap-ldpe-afm-hq.png`} alt="ภาพ AFM ความละเอียดสูงของผิวฟิล์ม LDPE ที่ยังไม่ปรับผิว พื้นที่สแกน 1 คูณ 1 ไมโครเมตร" draggable={false} />
      </div>
      {features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature.id)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>}
    {level !== "normal" && <div className={styles.readout}><span>{readout.eyebrow}</span><b>{readout.scale}</b></div>}
    {level !== "normal" && <PanControls onPan={pan.nudge} />}
    {level !== "normal" && <div className={styles.continuousPath} aria-hidden="true"><span>โมเดล 3D</span><i>›</i><span className={level === "micro" ? styles.pathActive : ""}>ภาพ SEM</span><i>›</i><span className={level === "nano" ? styles.pathActive : ""}>ภาพ AFM</span></div>}
    {level !== "normal" && <div className={styles.note}>ภาพตัวแทนผิวฟิล์ม LDPE ที่ยังไม่ปรับผิว จาก <a href="https://doi.org/10.3390/polym11101704" target="_blank" rel="noreferrer">Múčka และคณะ (2019) · ภาพที่ 8(A)</a> · {level === "nano" ? "สีแทนความสูง ไม่ใช่สีจริง" : "ไฟล์ต้นฉบับความละเอียดสูง"}</div>}
  </div>;
}

export function FoamContinuousZoom({ depth, level, selectedId, onSelect }: { depth: number; level: MaterialScale; selectedId: string; onSelect: (featureId: string) => void }) {
  const animatedDepth = useAnimatedDepth(depth);
  const microProgress = eased((animatedDepth - 26) / 42);
  const nanoProgress = eased((animatedDepth - 62) / 38);
  const { micro: microOpacity, nano: nanoOpacity } = continuousMicroscopyOpacity(animatedDepth);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const readout = level === "micro"
    ? { eyebrow: "ภาพ FE-SEM ของโฟม PE จริง", scale: "แถบมาตราส่วน 100 ไมโครเมตร · เซลล์ประมาณ 200 ไมโครเมตร" }
    : { eyebrow: "ภาพ SEM ของเนื้อ LDPE ในผนังโฟม", scale: "แถบมาตราส่วน 2 ไมโครเมตร · แผ่นผลึกหนาประมาณ 8 นาโนเมตร" };
  const features = level === "normal" ? [] : MATERIAL_MICROSCOPES.closed_cell_pe_foam[level].features;
  const pan = useImagePan(`epe-foam-${level}`);
  return <div className={styles.continuousZoom} data-selected={selectedId} data-level={level} data-material="closed-cell-pe-foam">
    {level !== "normal" && <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.photoLayer} ${styles.foamMicroPhoto}`} style={{ opacity: microOpacity, transform: `scale(${1.02 + microProgress * .48})` }}>
        <img src={`${basePath}/assets/microscopy/epe-closed-cell-sem.png`} alt="ภาพ FE-SEM จริงของโฟมพอลิเอทิลีน เห็นเซลล์อากาศปิดและผนังเซลล์บาง" draggable={false} />
      </div>
      <div className={`${styles.photoLayer} ${styles.foamNanoPhoto}`} style={{ opacity: nanoOpacity, transform: `scale(${1.04 + nanoProgress * .42})` }}>
        <img src={`${basePath}/assets/microscopy/epe-ldpe-lamellae-sem.png`} alt="ภาพ SEM จริงของเนื้อ LDPE ที่ผ่านการอัดรีด เห็นแผ่นผลึกบางในเนื้อพอลิเอทิลีน" draggable={false} />
      </div>
      {features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature.id)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>}
    {level !== "normal" && <div className={styles.readout}><span>{readout.eyebrow}</span><b>{readout.scale}</b></div>}
    {level !== "normal" && <PanControls onPan={pan.nudge} />}
    {level !== "normal" && <div className={styles.continuousPath} aria-hidden="true"><span>โมเดล 3D</span><i>›</i><span className={level === "micro" ? styles.pathActive : ""}>FE-SEM เซลล์โฟม</span><i>›</i><span className={level === "nano" ? styles.pathActive : ""}>SEM ผนัง PE</span></div>}
    {level === "micro" && <div className={styles.note}>ภาพโฟม PE จริงจาก <a href="https://doi.org/10.3390/ma14226877" target="_blank" rel="noreferrer">Bohinc และคณะ (2021) · ภาพที่ 2(a)</a></div>}
    {level === "nano" && <div className={styles.note}>ภาพตัวแทนเนื้อ LDPE ในผนังโฟมจาก <a href="https://doi.org/10.1039/C9RA09479B" target="_blank" rel="noreferrer">Karlsson และคณะ (2020) · ภาพที่ 2(d)</a> · ไม่ใช่ชิ้นเดียวกับภาพระดับไมโคร</div>}
  </div>;
}

export function PeSheetContinuousZoom({ depth, level, selectedId, onSelect }: { depth: number; level: MaterialScale; selectedId: string; onSelect: (featureId: string) => void }) {
  const animatedDepth = useAnimatedDepth(depth);
  const microProgress = eased((animatedDepth - 26) / 42);
  const nanoProgress = eased((animatedDepth - 62) / 38);
  const { micro: microOpacity, nano: nanoOpacity } = continuousMicroscopyOpacity(animatedDepth);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const readout = level === "micro"
    ? { eyebrow: "ภาพ SEM ของแผ่น LDPE จริง", scale: "ขยาย 20,000 เท่า · แถบมาตราส่วน 5 ไมโครเมตร" }
    : { eyebrow: "ภาพ AFM ของผิวแผ่น LDPE จริง", scale: "พื้นที่ 5 × 5 ไมโครเมตร · ขรุขระเฉลี่ย 3.4 นาโนเมตร" };
  const features = level === "normal" ? [] : MATERIAL_MICROSCOPES.pe_sheet[level].features;
  const pan = useImagePan(`pe-sheet-${level}`);
  return <div className={styles.continuousZoom} data-selected={selectedId} data-level={level} data-material="pe-sheet">
    {level !== "normal" && <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.photoLayer} ${styles.peSheetMicroPhoto}`} style={{ opacity: microOpacity, transform: `scale(${1.02 + microProgress * .48})` }}>
        <img src={`${basePath}/assets/microscopy/pe-sheet-ldpe-sem.png`} alt="ภาพ SEM จริงของผิวแผ่น LDPE ที่ยังไม่ผ่านการปรับผิว กำลังขยาย 20,000 เท่า" draggable={false} />
      </div>
      <div className={`${styles.photoLayer} ${styles.peSheetNanoPhoto}`} style={{ opacity: nanoOpacity, transform: `scale(${1.04 + nanoProgress * .42})` }}>
        <img src={`${basePath}/assets/microscopy/pe-sheet-ldpe-afm.png`} alt="ภาพ AFM จริงของผิวแผ่น LDPE ที่ยังไม่ผ่านการปรับผิว แสดงความสูงต่ำระดับนาโน" draggable={false} />
      </div>
      {features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature.id)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>}
    {level !== "normal" && <div className={styles.readout}><span>{readout.eyebrow}</span><b>{readout.scale}</b></div>}
    {level !== "normal" && <PanControls onPan={pan.nudge} />}
    {level !== "normal" && <div className={styles.continuousPath} aria-hidden="true"><span>โมเดล 3D</span><i>›</i><span className={level === "micro" ? styles.pathActive : ""}>SEM 20,000×</span><i>›</i><span className={level === "nano" ? styles.pathActive : ""}>AFM 5 × 5 µm</span></div>}
    {level === "micro" && <div className={styles.note}>ภาพผิว LDPE ที่ยังไม่ปรับผิวจาก <a href="https://doi.org/10.3390/polym13081309" target="_blank" rel="noreferrer">Al-Gunaid และคณะ (2021) · ภาพที่ 7(a)</a></div>}
    {level === "nano" && <div className={styles.note}>ภาพ AFM ของตัวอย่าง LDPE เดียวกันจาก <a href="https://doi.org/10.3390/polym13081309" target="_blank" rel="noreferrer">Al-Gunaid และคณะ (2021) · ภาพที่ 8(a)</a> · สีแทนความสูง ไม่ใช่สีจริง</div>}
  </div>;
}

export function MaterialMicroscope({ materialId, level, selectedId, zoomProgress, onSelect }: { materialId: MaterialMicroscopeId; level: "micro" | "nano"; selectedId: string; zoomProgress: number; onSelect: (feature: MicroscopeFeature) => void }) {
  const definition = MATERIAL_MICROSCOPES[materialId][level];
  const photo = level === "micro" ? MATERIAL_MICROSCOPE_PHOTOS[materialId] : null;
  const photoClass = photo?.fit === "contain" ? styles.contain : photo?.fit === "panel-a" ? styles.panelA : "";
  const imageSrc = photo ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/microscopy/${photo.file}` : "";
  const isCardboardDiagram = level === "micro" && materialId === "cardboard";
  const pan = useImagePan(`${materialId}-${level}`);
  return <div className={styles.microscope} data-selected={selectedId} data-material={materialId} data-level={level}>
    <div className={styles.readout}><span>{definition.eyebrow}</span><b>{definition.scale}</b></div>
    <div
      ref={pan.surfaceRef}
      className={`${styles.panLayer} ${pan.dragging ? styles.dragging : ""}`}
      style={{ transform: `translate3d(${pan.offset.x}px,${pan.offset.y}px,0)` }}
      onPointerDown={pan.begin}
      onPointerMove={pan.move}
      onPointerUp={pan.finish}
      onPointerCancel={pan.finish}
    >
      <div className={`${styles.art} ${photoClass}`} style={{ transform: `scale(${1.35 + Math.max(0, Math.min(1, zoomProgress)) * .24})`, transformOrigin: MATERIAL_ZOOM_ORIGINS[materialId] }}>
        {photo ? <img src={imageSrc} alt={photo.alt} draggable={false} /> : isCardboardDiagram ? <PaperMicroArt coated /> : <NanoArt materialId={materialId} />}
      </div>
      {definition.features.map((feature, index) => <button
        type="button"
        key={feature.id}
        className={`${styles.hotspot} ${selectedId === feature.id ? styles.active : ""}`}
        data-pointer={index}
        style={{ left: `${feature.x}%`, top: `${feature.y}%` }}
        aria-label={`ดู${feature.label}`}
        aria-pressed={selectedId === feature.id}
        onClick={() => onSelect(feature)}
      ><b>{index + 1}</b><span>{feature.label}</span></button>)}
    </div>
    <PanControls onPan={pan.nudge} />
    <div className={styles.note}>{photo ? <>ภาพจากวัสดุจริง <a href={photo.sourceUrl} target="_blank" rel="noreferrer">ที่มา: {photo.sourceLabel}</a></> : <>แผนภาพจำลองเฉพาะวัสดุ · สีและขนาดไม่ใช่ของจริง</>}</div>
  </div>;
}
