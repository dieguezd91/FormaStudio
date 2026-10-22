# Forma Studio — inventory vertical slice

Source: `Forma_Studio_Documento_Diseno_Producto.pdf` (v1.0, 2026-10-20).

## Goal

First usable deliverable that validates the full value proposition (scenario 13.1):
project + docs/references → AI requirements & distinct proposals → library →
visual + natural-language editing → Test mode with mock data → Unity 6 uGUI Prefab export.
Case: game inventory with tabs, drag & drop, stacks, context menus.

## Decisions

- Repo: `C:\Users\Dani\OneDrive\Documentos\GitHub\FormaStudio`, branch `feat/inventory-slice`.
- Stack: React + TS + Vite, Tailwind + shadcn/ui, Zustand, React Moveable; Design Core in TS + Zod
  with versioned JSON; local services Node + Fastify + SQLite; Electron desktop; Vitest, Playwright,
  Unity Test Framework.
- AI: AI SDK behind a provider abstraction; first provider **Gemini** (`@ai-sdk/google`, vision-capable),
  model configurable via env. Editor and AI mutate documents through the same structured operations.
- Export: uGUI implemented first; UI Toolkit and Web exporter interfaces defined, not implemented.
- Unity target: 6000.x (installed: 6000.0.73f1, 6000.5.1f1).

## Non-goals (this slice)

UI Toolkit/Web exporters, collaboration, World Space/XR, bidirectional sync of arbitrary Unity edits.

## Tasks

- [x] 1. Monorepo scaffold (npm workspaces): `apps/desktop`, `packages/design-core`, `services/local`,
      `packages/exporters`, `unity/com.forma.studio`; lint/test tooling.
- [x] 2. Design Core: versioned Zod document schema (nodes, styles, behaviors, bindings, mock data)
      and structured operations with undo/redo.
- [x] 3. Local service: Fastify + SQLite for projects, documents, references, proposals, versions.
- [x] 4. Library: inventory family (grid, tabs, equipment) with tabs, drag & drop, stacks,
      context menu, split behaviors.
- [x] 5. Editor: canvas, hierarchy, contextual inspector, undo/redo.
- [x] 6. Test mode: behavior runtime with mock data, simulated vs connected clearly marked.
- [ ] 7. AI (Gemini): requirement extraction with traceability, 3 structurally distinct proposals,
      NL edits as operations with diff preview before applying.
- [x] 8. uGUI exporter + Unity package: JSON → native Prefab, behavior MonoBehaviours, binding
      interfaces (`IInventorySource`, intent events), compatibility report.
- [x] 9. End-to-end scenario 13.1 verified in Unity 6000.x.
- [ ] 10. Optional AI hardening: AI status/kill switch (FORMA_AI_ENABLED), UI gating, clear 429/503 messages without wasteful retries, Gemini-compatible output schemas + offline compatibility test.

## Evidence

(commit ids and check results per task)

- Task 1: commit 5486b55; native review approved (lineage review-4f68b20278584e5c); advisory follow-ups: port 0 accepted in services/local/src/main.ts, silent Electron load failure in apps/desktop/src/main/index.ts, tautological exporter test.
- Task 2: commit e33e709; 118 tests passing, typecheck + lint clean; native review approved (lineage review-96bee942d789af14); advisory follow-ups: token lookup can hit Object prototype in validate.ts:250, migrate throws on non-record input (migrate.ts:77), vacuous assert in history.test.ts:117.
- Task 3: commit b75ffa2; 215 tests passing repo-wide (98 in local-service), typecheck + lint clean; real smoke run confirmed project + blob persist across restart, foreign Origin rejected 403, invalid FORMA_PORT exits 1; native review approved (lineage review-bb6334665d984f14). Follow-ups: PATCH proposal accepts status 'adopted' bypassing the adopt route (schemas.ts:136) — restrict to candidate/discarded in task 7; delete-cascade test weak (projects.test.ts:123); hand-rolled CORS instead of @fastify/cors.
- Task 4: commit 4abbb0a; `@forma/library` with 11 entries (6 basic, 5 inventory variants), insertEntry -> library batch validated for every entry, Spanish search; 353 tests passing, typecheck + lint clean; native review declined by user for this candidate. Notes: binding path convention `items[category=X][i].field` (packages/library/src/bindings.ts) must be honored by runtime (task 6) and exporter (task 8); tab panels overlap until runtime hides inactive tabs; behaviors live on each slot node.
- Task 5: editor (start screen, canvas with react-moveable, Capas, contextual inspector with tokens, Biblioteca search/insert, Referencias upload, Versiones, optimistic dispatch with 409/422 handling, undo/redo synced); 449 Vitest tests + Playwright e2e (create -> search 'inventario con pestañas' -> insert -> edit fill -> undo -> reload persists) passing; typecheck, lint, build clean; native review declined by user. Gaps: Probar/Exportar placeholders (tasks 6/8), AI disabled (task 7), 1.7 MB renderer chunk.
- Task 6: commits a703c21 (`@forma/runtime`: pure behavior runtime, per-view slot placement, simulated intent handler with custom-handler seam, describeSimulation) and the Probar UI commit below; 524 Vitest tests + 2 Playwright specs (editor, play: tab switch, mouse drag -> moveItem 'Simulado/aplicado', context menu Usar decrements) passing; typecheck, lint, build clean. RDD review: user chose to disable review for this clone from task 6 on. Follow-ups: active tab only outlined (static gold style on first tab), gamepad/touch long-press untested in browser, no pan/scroll in Probar. Exporter (task 8) must mirror runtime intent payloads and move/merge/swap/split/equip rules (see packages/runtime/src/simulation.ts).
- Task 7 (implemented, NOT checked): 36c4a00 (`@forma/ai` Gemini provider, default `gemini-3.8-flash` via FORMA_AI_MODEL; AI routes requirements/proposals/edit-preview/impact; PATCH proposal limited to candidate/discarded) and the AI UI commit below (Requisitos, Propuestas with compare/adopt/probar, Pedir a la IA preview+apply, Crear con IA guide, impact notice); 625 Vitest tests + 6 Playwright tests passing with stubbed AI routes. Pending to check the box: live run with GOOGLE_GENERATIVE_AI_API_KEY (`npm run ai:smoke -w @forma/local-service`, then the UI flow) to validate Gemini accepts the JSON schemas and output quality. Gaps: edit-preview change lines are English (describeBatch), AI availability unknown until first 503.
- Task 8: commits e3cfb72 (packages/exporters: forma.ugui-bundle/v1 contract, rect conversion, compatibility report, diffBundles, docs/export), 8680d4d (service export routes with Unity project validation, atomic writes, manifest install with backup; Exportar mode), 3b382d9 (Unity runtime components, IFormaDataSource/IFormaIntentHandler, FormaInventorySimulation port), 0ecff83 (Editor importer bundle -> prefab with managed-only safe updates, backups, import report). 753 JS tests, 7 Playwright tests, 112 Unity EditMode tests (FormaSandbox, Unity 6000.0.73f1) passing. Not verified: menu items, Input System module, TMP visual appearance.
- Task 9: caa785c (ExistingInventory sample: game-owned PlayerInventory + single PlayerInventoryFormaAdapter; sandbox fixtures Forma13_1_FirstImport/Reimport) and the orchestration commit below (`npm run e2e:unity`): HTTP-only project -> library batches (tabs + equipment) -> style -> analyze (8 supported/7 adapted/2 approximate/0 unavailable) -> install-package -> export -> Unity import + game wiring (4/4) -> design change -> re-export diff (1 added, 85 changed, 1 renamed) -> Unity re-import preserving adapter, DevBadge and developer field (4/4). Not automated: AI generation (no Gemini key), real pointer input, TMP visual appearance. Known flaky pre-existing test: Postprocessor_ImportsAnImportedBundleOnceTheImportHasFinished.
- Gemini live check (2026-10-22): key valid; requirements/proposals schemas -> 400 INVALID_ARGUMENT, edit schema -> 400 recursive ref loop (z.json in updateNode props); key is on API free tier (20 req/day/model, exhausted). Google AI Pro subscription does not apply to API billing.
