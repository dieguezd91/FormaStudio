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

- [ ] 1. Monorepo scaffold (npm workspaces): `apps/desktop`, `packages/design-core`, `services/local`,
      `packages/exporters`, `unity/com.forma.studio`; lint/test tooling.
- [ ] 2. Design Core: versioned Zod document schema (nodes, styles, behaviors, bindings, mock data)
      and structured operations with undo/redo.
- [ ] 3. Local service: Fastify + SQLite for projects, documents, references, proposals, versions.
- [ ] 4. Library: inventory family (grid, tabs, equipment) with tabs, drag & drop, stacks,
      context menu, split behaviors.
- [ ] 5. Editor: canvas, hierarchy, contextual inspector, undo/redo.
- [ ] 6. Test mode: behavior runtime with mock data, simulated vs connected clearly marked.
- [ ] 7. AI (Gemini): requirement extraction with traceability, 3 structurally distinct proposals,
      NL edits as operations with diff preview before applying.
- [ ] 8. uGUI exporter + Unity package: JSON → native Prefab, behavior MonoBehaviours, binding
      interfaces (`IInventorySource`, intent events), compatibility report.
- [ ] 9. End-to-end scenario 13.1 verified in Unity 6000.x.

## Evidence

(commit ids and check results per task)

- Task 1: commit 5486b55; native review approved (lineage review-4f68b20278584e5c); advisory follow-ups: port 0 accepted in services/local/src/main.ts, silent Electron load failure in apps/desktop/src/main/index.ts, tautological exporter test.
