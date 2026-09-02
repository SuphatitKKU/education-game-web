# Room 2: impact observation lab

The reference layout is implemented with a release rig, an animated model egg,
before/after views, five material choices, observation choices and a record book.
The model egg drops onto the material; the metal release holder stays fixed. This
avoids confusing the activity with compression or striking an egg with a weight.

## Interpretation of results

`impact.ts` contains deliberately authored, deterministic teaching scenarios,
tagged `illustrative-v1`. They are not measured material performance, validated
physical predictions, or a ranking suitable for real packaging design. The UI
and record book say this explicitly. There are no invented real-world masses,
heights or impact-force measurements.

All runs use the same simulated egg, drop height and specimen footprint. The
displayed damage and the student's selected observation are stored separately;
the activity never auto-grades or replaces the student's response.

## Compatibility

- New stage: `impact`; new map/index: `impactResults` and `impactIndex`.
- Original `elasticityResults` and historical event labels remain intact.
- An active old `elasticity` checkpoint opens the new activity, but its legacy
  results never count toward impact completion.
- `save_state` JSONB carries the additional fields through the existing
  checkpoint/revision/outbox mechanism. The schema's stage column is text, so no
  database migration is needed.
- Free preview remains separate from team saves. Its data lasts for the current
  preview only; it never writes experiment answers to a real team.
