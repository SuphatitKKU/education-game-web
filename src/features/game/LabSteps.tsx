import base from "./CompressionLab.module.css";

type LabStep = 1 | 2 | 3;

export function LabSteps({ active, completed = 0 }: { active: LabStep; completed?: number }) {
  const labels = ["เลือกวัสดุ", "ทดลอง", "บันทึกผล"];
  return <nav className={base.steps} aria-label="ขั้นตอนการทดลอง">
    {labels.map((label, index) => {
      const number = index + 1;
      const state = completed >= number || number < active ? "done" : number === active ? "active" : "upcoming";
      return <span key={label} data-state={state}><b>{number}</b><small>{label}</small></span>;
    })}
  </nav>;
}
