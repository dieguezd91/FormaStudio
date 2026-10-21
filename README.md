# Forma Studio

Desktop tool for designing game UI with AI assistance and exporting it to Unity (uGUI first).
The first vertical slice targets a game inventory (tabs, drag & drop, stacks, context menus).
See `odd/tasks/forma-studio-inventory-slice.md` for scope and decisions.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/desktop` | `@forma/desktop` | Electron + Vite + React 19 + Tailwind v4 editor |
| `packages/design-core` | `@forma/design-core` | Versioned Zod document schema and operations |
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

## OneDrive

This repo lives under OneDrive. Exclude `node_modules` and `*.sqlite` files from sync (or keep the
service data directory outside the synced folder) to avoid sync churn and database corruption.
