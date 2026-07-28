# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**Arcade Retro** — a platform for playing retro games online and competing for the highest score. Development follows spec-driven design: specs live in `specs/NN-slug.md`, are written/refined with `/spec`, and implemented with `/spec-impl`. Specs that add a **new playable game with leaderboard integration** (porting from `references/started-games/` or building from scratch) are implemented with `/add-game` instead of `/spec-impl`.

Themed game-jam specs live in `specs/game-jam/` — layout is mixed today: some sit flat (`gloton-01-comecocos.md`), some in a per-game subfolder (`tuberias/tuberias-01-clasico.md`, `frogger/01-frogger-core.md`).

Games shipped so far: **rocas** (Asteroids), **caida** (Tetris), **bloque-buster** (Arkanoid), **serpentina** (Snake), **ranaria** (Frogger). Games not yet ported render a decorative placeholder in the player.

Scripts are only `dev`, `build`, `start`, `lint` (`lint` runs `eslint` directly). **There is no test setup yet** — no test runner, no test script, no test files.

## Skills & workflow

The four custom skills live in `.agents/skills/` and are exposed to Claude Code as symlinks in `.claude/skills/`. `spec` and `spec-impl` were installed from `Klerith/fernando-skills` via `npx skills@latest add` (tracked in `skills-lock.json`); `add-game` and `spec-impl-game` are local and are **not** in the lockfile.

- **`/spec`** (`.agents/skills/spec/`) — create or refine a spec section by section; saves to `specs/NN-slug.md` as `Borrador` (never auto-approves). Uses `template.md`.
- **`/spec-impl`** (`.agents/skills/spec-impl/`) — implement an already-**Aprobado** spec on its own git branch (`spec-NN-slug`), pausing after each step for review.
- **`/add-game`** (`.agents/skills/add-game/`) — specialized `/spec-impl` for "add a new playable game" specs. Can also **create** the spec first (following `/spec`) if it doesn't exist. Implements via a fixed recipe: game metadata → canvas component → `GAME_REGISTRY` entry → Supabase `games` insert → build + playtest → close. Read `.agents/skills/add-game/SKILL.md` and its `template.md` before adding a game.
- **`/spec-impl-game`** (`.agents/skills/spec-impl-game/`) — `/spec-impl` plus the post-implementation. It doesn't duplicate the procedure: it **reads** `.agents/skills/spec-impl/SKILL.md` and runs its Phases 1–4 verbatim (only deviation: it also searches `specs/game-jam/**`), then adds a Phase 5 that chains **`skin-designer` first and `mobile-porter` second** — sequentially, never in parallel, asking before each so Tito can review and commit in between. Use it for specs that end in a playable game needing skins and touch controls; plain `/spec-impl` otherwise.

`specs/.spec-config.yml` sets `AutoCreateBranch: true` — `/spec-impl` creates and switches to `spec-NN-slug` without asking.

### Subagents

Subagents live in `.claude/agents/`. The summaries below are just for picking one — **read the agent's own file for its full contract** (scope, guardrails, procedure) before invoking it.

- **`game-planner`** (`.claude/agents/game-planner.md`) — recommends which retro game to port next, balancing categories and avoiding duplicates. Reads the catalog plus its own memory at `references/game-suggestions.md` (the only file it writes). Recommends only — never writes game code, specs, or registry entries.
- **`game-jam`** (`.claude/agents/game-jam.md`) — given a **theme**, picks one fitting game and generates at least two linked `Borrador` specs for it (a base playable spec + extensions) into `specs/game-jam/`. Specs only — never code, `GAME_REGISTRY`, or Supabase, and never auto-approves.
- **`skin-designer`** (`.claude/agents/skin-designer.md`) — audits and implements the shared 3-skin system (`clasico`, `neon`, `retro`) so every game looks good on the dark background. Edits game components, `registry.ts`, `game-player.tsx`, `user-context.tsx` and `globals.css`; never touches Supabase, specs, or the data model.
- **`mobile-porter`** (`.claude/agents/mobile-porter.md`) — gives a **newly added** game its touch gamepad by adding `touchControls` to its `GAME_REGISTRY` entry, extending SPEC 10 (`specs/10-movil-tactil.md`) to games that arrived later. Touch works by synthesizing `KeyboardEvent`s, so it never edits game components. Run it right after `/add-game`, which has no touch step.
- **`game-performance-booster`** (`.claude/agents/game-performance-booster.md`) — measure-first performance audit and fix for **one** game, given its `id`. Edits only `app/components/games/<id>-game.tsx`; never changes gameplay or palettes. Its contract is SPEC 12 (`specs/12-rendimiento-ranaria.md`) and `ranaria-game.tsx` is the reference implementation (`makeSprite`/`stamp`, `RenderCache`, `FpsMeter`).
- **`security-auditor`** (`.claude/agents/security-auditor.md`) — audits security on both fronts: the database (RLS, policies, `anon`/`authenticated` grants, `SECURITY DEFINER` functions, Supabase advisors) and the app (HTTP headers, Server Actions as public endpoints, secrets, rate limiting, client/server boundary, auth Route Handlers). Its contract is SPEC 15 (`specs/15-endurecimiento-seguridad.md`) plus `references/security/security-checklist.md`, and it keeps a baseline of accepted risks so it doesn't re-litigate them. **Audits and reports by default** — it only remediates when explicitly asked, and never applies a migration without approval. Reports go to `references/security/audits/`. Distinct from the global `/security-review` skill, which reviews the pending branch diff rather than the running system.

### Automatic formatting hook

`.claude/settings.json` registers a `PostToolUse` hook on `Write|Edit` that runs `.claude/hooks/format-and-lint.sh`: Prettier `--write` on `.ts/.tsx/.js/.jsx/.mjs/.cjs/.json/.md/.mdx/.css`, then ESLint `--fix` on the JS/TS ones.

**If ESLint still fails after `--fix`, the hook returns `decision: "block"` and the edit is rejected.** When that happens, fix the reported lint error — don't retry the same edit unchanged.

### Workflow conventions

- **Tito commits each step himself** — do not commit on his behalf, and check for secrets before every pause.
- Use `/frontend-design` whenever designing or reshaping UI. It is one of Tito's **global** skills (`~/.claude/skills/frontend-design`), not a project skill — you won't find it in `.agents/skills/`.
- Playwright screenshots go in `.playwright-screenshots/`. Playwright is available only as an MCP server, not as a test runner.

## Next.js 16 — differs from training data

This project uses **Next.js 16.2.10** (React 19.2.4) with breaking changes vs. older versions. The authoritative docs are bundled at `node_modules/next/dist/docs/` (App Router docs in `01-app/`; full changelog in `01-app/02-guides/upgrading/version-16.md`). Consult them before writing framework-facing code. Key changes:

- **Async request APIs**: `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are Promises and must be `await`ed — synchronous access is fully removed. Icon/OG image functions receive `params`/`id` as promises too.
- **`middleware.ts` is now `proxy.ts`** (exported function named `proxy`), same functionality. This repo's `proxy.ts` delegates to `updateSession` in `lib/supabase/proxy.ts` to refresh Supabase auth sessions.
- **Caching**: new `revalidateTag`/`updateTag`/`refresh` semantics; PPR is opted into via the `cacheComponents` config (the `experimental_ppr` flag is removed).
- **Turbopack is the default** for dev and build; its config lives at the top level of `next.config.ts`.
- **Removed**: `next lint` command, AMP support, runtime configuration, `unstable_rootParams`. Linting is `npm run lint` → plain `eslint` (flat config in `eslint.config.mjs`).
- Parallel routes require a `default.js`.
- `next.config.ts` sets `allowedDevOrigins: ['192.168.1.13:3000']` so the dev server accepts the LAN origin when testing from a phone. Note: on iOS the dev server does not hydrate over LAN — use a production build (`npm run build && npm start`) to test on a physical phone.

## Frontend design

Usa siempre `/frontend-design` para diseñar la interfaz de usuario (skill global del usuario, ver "Workflow conventions").

## Architecture

**App Router only** — routes in `app/`:

- `/` — home landing (`app/page.tsx` → `home-landing.tsx`).
- `/games` — games library / arcade grid (`games-library.tsx`).
- `/games/[id]` — game detail + top scores (async `params`).
- `/games/[id]/jugar` — the player (`game-player.tsx`) that mounts the real game.
- `/salon` — Hall of Fame (`hall-of-fame.tsx`), leaderboards across games.
- `/about` — about + contact form (Server Action email).
- `/auth` — sign-in screen for the simulated user.
- `/debug/supabase` — Supabase connection debug page.

There are no `route.ts` API handlers — server work happens in Server Components and Server Actions.

Cross-cutting UI lives in `app/components/` (`nav.tsx`, `game-card.tsx`, `user-context.tsx`, etc.).

- **Tailwind CSS v4** via `@tailwindcss/postcss` — configured in CSS (`app/globals.css`), no `tailwind.config` file.
- **TypeScript strict mode**; path alias `@/*` maps to the repo root.
- **Fonts**: Press Start 2P (pixel), JetBrains Mono + Courier Prime (mono) loaded in `app/layout.tsx` via `next/font/google`, exposed as CSS variables (`--pixel`, `--mono`).
- **Design system**: retro-neon theme in `app/globals.css` — CSS custom-property palette (`--cyan`, `--magenta`, `--yellow`, `--green`, `--bg*`, `--ink*`), perspective-grid/scanline background, and pure-CSS per-game cover art. The app is **dark-only** (`--bg: #0a0a0f`).
- **Cover classes** — 8 exist: `cover-bricks`, `cover-tetro`, `cover-snake`, `cover-glot`, `cover-invaders`, `cover-rocas`, `cover-rana`, `cover-duelo`. Used as `className={"cover-bg " + game.cover}`, where `cover` is a column of the `games` table. Reuse an existing one for a new game unless the spec requires a new one.

### Backend & data (Supabase)

Games and scores live in **Supabase**, not in local files. Two tables: `games` (id/title/short/long/cat/cover/color) and `scores` (game_id/player_name/score/created_at).

- **Data access**: `lib/supabase/games.ts` exposes server helpers — `getGames`, `getGame`, `getTopScores`, `getAllTopScores`. `best`/`plays` are derived from `scores` (MAX / COUNT). `app/data.ts` holds only shared UI types (`Category`, `GameColor`, `CATS`).
- **Clients**: `lib/supabase/server.ts` (Server Components, cookie-based), `lib/supabase/client.ts` (browser — used by the player to `insert` into `scores`), `lib/supabase/proxy.ts` (session refresh via `proxy.ts`).
- **Env vars** (`.env.local`, template in `.env.template`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RESEND_API_KEY`.
- **Auth is simulated**: `user-context.tsx` keeps a `{ name }` user in `localStorage` under `av_user`, used as the default leaderboard name — not real Supabase auth. It also owns the global skin preference under `av_skin`.
- **Contact email**: `app/about/actions.ts` is a Server Action sending mail via **Resend** (currently in sandbox mode → only delivers to the account owner).

### Game architecture

Real games are canvas React components in `app/components/games/<id>-game.tsx`, registered in `GAME_REGISTRY` (`app/components/games/registry.ts`). The registry decouples the player from each game:

- **`GameComponentProps`** — parent controls `paused` and `skin`; game reports up via `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver(finalScore, won?)`, `onExtraStatChange` (optional HUD stat, e.g. power-up seconds; `0` = inactive).
- **`GameComponentHandle`** (imperative ref) — `reset()` ("JUGAR DE NUEVO") and `forceGameOver()` ("FIN").
- **`GameRegistryEntry`** — `Component`, plus optional `extraStatLabel` (HUD), `supportsSkins`, and `touchControls`.

Registered games and what each opts into:

| id              | Component          | `extraStatLabel` | skins | touch |
| --------------- | ------------------ | ---------------- | ----- | ----- |
| `rocas`         | `AsteroidsGame`    | Triple disparo   | ✔     | ✔     |
| `caida`         | `CaidaGame`        | —                | —     | ✔     |
| `bloque-buster` | `BloqueBusterGame` | —                | ✔     | ✔     |
| `ranaria`       | `RanariaGame`      | Tiempo           | ✔     | ✔     |
| `serpentina`    | `SerpentinaGame`   | —                | ✔     | ✔     |

**Skins** — `SkinId = "clasico" | "neon" | "retro"` and the `SKINS` list live in `registry.ts`. The preference is **global, not per game**: `user-context.tsx` persists it in `localStorage["av_skin"]` (default `clasico`) and `game-player.tsx` renders the selector — in the desktop HUD and in the mobile console — only when the entry sets `supportsSkins`. Each game keeps its own `SKIN_PALETTES` and reads the `skin` prop.

**Touch controls** — `touch-controls.tsx` renders the on-screen gamepad from the entry's `touchControls: TouchButton[]`. Each button has a `code` (synthetic `e.code`), `label`, `group` (`"pad" | "action"`) and `mode`: `hold` (keydown on press, keyup on release — for games polling `keys[code]` per frame), `tap` (keydown + immediate keyup, one action per touch), or `repeat` (tap plus auto-repeat while held). Buttons work by **synthesizing `KeyboardEvent`s**, so adding touch support to a game normally means editing only `registry.ts`.

`game-player.tsx` renders the HUD, controls (PAUSA/FIN/SALIR), the skin selector, the touch gamepad, the game-over modal, and the save-score flow (browser Supabase `insert`). If a game id isn't in `GAME_REGISTRY`, it falls back to a decorative animated placeholder with a simulated score.

To add a game, prefer `/add-game` over hand-editing — but the moving parts are: the component, the `GAME_REGISTRY` entry, and a row in the Supabase `games` table. Porting sources live in `references/started-games/`; shared asset sources in `references/source-assets/`; the original design mockups in `references/templates/`.
