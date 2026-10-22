# Forma Studio

Desktop tool for designing game UI with AI assistance and exporting it to Unity (uGUI first).
The first vertical slice targets a game inventory (tabs, drag & drop, stacks, context menus).
See `odd/tasks/forma-studio-inventory-slice.md` for scope and decisions.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/desktop` | `@forma/desktop` | Electron + Vite + React 19 + Tailwind v4 editor |
| `packages/design-core` | `@forma/design-core` | Versioned Zod document schema and operations |
| `packages/ai` | `@forma/ai` | AI provider abstraction (Gemini), validated structured generation, prompts |
| `packages/exporters` | `@forma/exporters` | Exporter interfaces and implementations |
| `services/local` | `@forma/local-service` | Local Fastify service (`127.0.0.1:4318`, `FORMA_PORT`) |
| `unity/com.forma.studio` | `com.forma.studio` | Unity 6 UPM package (runtime, editor, tests) |

## Scripts

Requires Node >= 22.13 and npm.

| Command | Description |
| --- | --- |
| `npm install` | Install all workspaces |
| `npm run dev` | Electron app (electron-vite dev) |
| `npm run dev:web` | Renderer only in a browser (`http://localhost:5173`) |
| `npm run dev:service` | Local service with `tsx watch` |
| `npm run build` | Production build of the desktop app |
| `npm test` | Vitest across workspaces |
| `npm run typecheck` | `tsc` in every workspace |
| `npm run lint` | ESLint (flat config) |
| `npm run ai:smoke -w @forma/local-service` | Live Gemini smoke test (needs an API key) |

## OneDrive

This repo lives under OneDrive. Exclude `node_modules` and `*.sqlite` files from sync (or keep the
service data directory outside the synced folder) to avoid sync churn and database corruption.

## AI (Gemini)

AI features live in the local service and are off until a key is configured. Copy `.env.example` to
`.env` and set `GOOGLE_GENERATIVE_AI_API_KEY`; without it the AI routes answer
`503 { error: { code: "aiUnavailable" } }` and everything else works.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | – | Enables AI (get one at <https://aistudio.google.com/apikey>) |
| `FORMA_AI_MODEL` | `gemini-3.8-flash` | Model for text and structured output |
| `FORMA_AI_VISION_MODEL` | `FORMA_AI_MODEL` | Model used when a request includes images |

Routes (all under `/projects/:id`):

| Route | Purpose |
| --- | --- |
| `POST /ai/requirements` `{ sourceIds? }` | Extract requirements with source traceability and persist them |
| `POST /ai/proposals` `{ screenId?, count = 3, brief? }` | Generate structurally distinct proposals (stored as `candidate`) |
| `POST /ai/edit` `{ instruction, screenId, selectedNodeIds, proposalIds? }` | Preview a natural-language edit as an operation batch; apply it with `POST /document/batches` |
| `GET /ai/impact?since=` | Requirements, proposals and screens affected by source changes (no model) |

What leaves the machine: only the sources named in the request (or, by default, project-scoped
sources), text up to 200 000 characters and images up to 5 MiB each (at most 8). PDFs without
text are skipped. Document content is never logged. Model output is always validated again with
the design-core and library schemas before anything is stored.

Tests use scripted AI SDK mock models (`@forma/ai/testing`); no key or network is needed.
