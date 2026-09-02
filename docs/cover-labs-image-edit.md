# Cover image edit — 2026-08-27

- Tool: built-in imagegen (not CLI).
- Input: `public/assets/menu/cover.png` (preserved).
- Saved asset: `public/assets/menu/cover-labs.png`.
- Visual QA: removed the extra hand at the tablet's right edge; retained the tablet-holding hand at its left edge and the raised pointing hand.

## Final prompt

Use case: precise-object-edit. Asset type: existing children's educational game cover, landscape 16:9. Image 1 is the edit target. Remove ONLY the extra third hand on the far-right boy who wears round turquoise glasses and a purple shirt. Specifically remove the small orange/brown hand and fingers at the RIGHT edge of the purple tablet, approximately x=1390..1432 y=622..676 in the 1672x941 reference (83%-86% across, 66%-72% down). Fill that small area naturally with the purple tablet edge and purple shirt behind it. KEEP his hand gripping the LEFT edge of the tablet and KEEP his raised pointing hand at the far right; he should have exactly two hands. Preserve everything else unchanged: same three children's faces, expressions, poses, colors, friendly cartoon style, smiling parcel character and its black hands, classroom background, objects, composition and wide aspect ratio. No added UI, no added text, no watermark. Minimal local edit only.
