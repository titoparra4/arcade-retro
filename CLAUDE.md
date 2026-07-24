# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**Arcade Retro** — a platform for playing retro games online and competing for the highest score. Development follows spec-driven design: specs live in `specs/NN-slug.md`, are written/refined with `/spec`, and implemented with `/spec-impl`. Specs that add a **new playable game with leaderboard integration** (porting from `references/started-games/` or building from scratch) are implemented with `/add-game` instead of `/spec-impl`.

Games shipped so far: **rocas** (Asteroids), **caida** (Tetris), **bloque-buster** (Arkanoid), **serpentina** (Snake). Games not yet ported render a decorative placeholder in the player.

There is no test setup yet.

## Skills & workflow

All three custom skills live in `.agents/skills/` (installed originally from `Klerith/fernando-skills` via `npx skills@latest add`; see `skills-lock.json`):

- **`/spec`** (`.agents/skills/spec/`) — create or refine a spec section by section; saves to `specs/NN-slug.md` as `Borrador` (never auto-approves). Uses `template.md`.
- **`/spec-impl`** (`.agents/skills/spec-impl/`) — implement an already-**Aprobado** spec on its own git branch (`spec-NN-slug`), pausing after each step for review.
- **`/add-game`** (`.agents/skills/add-game/`) — specialized `/spec-impl` for "add a new playable game" specs. Can also **create** the spec first (following `/spec`) if it doesn't exist. Implements via a fixed recipe: game metadata → canvas component → `GAME_REGISTRY` entry → Supabase `games` insert → build + playtest → close. Read `.agents/skills/add-game/SKILL.md` and its `template.md` before adding a game.

Subagents live in `.claude/agents/`:

- **`game-planner`** (`.claude/agents/game-planner.md`) — plans and decides **which retro game to add next**. It reads the current catalog (`references/implemented-games.md`, `GAME_REGISTRY`, the Supabase `games` table) and its own memory, then returns a prioritized recommendation with concrete metadata ready to hand off to `/add-game`. It only recommends — it never writes game code, specs, or registry entries. Its persistent memory of past suggestions is `references/game-suggestions.md` (the only file it writes; git-tracked so suggestions are reviewable). Invoke it when choosing the next game to port.
- **`game-jam`** (`.claude/agents/game-jam.md`) — given a **theme**, picks one retro game that fits and generates **at least two complete specs for that same game** — a base playable spec plus one or more extension specs that depend on it — saved as `Borrador` directly in `specs/game-jam/` (naming `<game-id>-NN-<slug>.md`), styled exactly like specs 07–09. It reads the catalog to choose a non-duplicate game and fix concrete metadata, but **only writes to `specs/game-jam/`** — never game code, `GAME_REGISTRY`, or the Supabase `games` table, and never auto-approves. Invoke it to kick off a themed game jam; then review/approve the specs and hand the base to `/add-game` and extensions to `/spec-impl`.
- **`skin-designer`** (`.claude/agents/skin-designer.md`) — ensures every playable game offers **at least 3 skins — `neon`, `retro`, and `clasico` (default)** — all looking good on the dark background (`--bg #0a0a0f`; the app is dark-only). Unlike the other two agents it **implements**: it audits per-game skin compliance, designs the concrete palettes, and builds a **shared skin system** — a `SkinId` type + `SKINS` constant and a `skin` prop in `registry.ts`, per-game `SKIN_PALETTES`, a single selector in `game-player.tsx`, and preference persistence in `user-context.tsx` — editing game components and `app/globals.css` as needed. It never touches Supabase, specs, or the data model, and Tito commits each step himself. Invoke it to review and complete the games' skins.

Workflow conventions:

- **Tito commits each step himself** — do not commit on his behalf, and check for secrets before every pause.
- Use `/frontend-design` whenever designing or reshaping UI (see CLAUDE rule below).
- Playwright screenshots go in `.playwright-screenshots/`.

## Next.js 16 — differs from training data

This project uses **Next.js 16.2.10** with breaking changes vs. older versions. The authoritative docs are bundled at `node_modules/next/dist/docs/` (App Router docs in `01-app/`; full changelog in `01-app/02-guides/upgrading/version-16.md`). Consult them before writing framework-facing code. Key changes:

- **Async request APIs**: `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are Promises and must be `await`ed — synchronous access is fully removed. Icon/OG image functions receive `params`/`id` as promises too.
- **`middleware.ts` is now `proxy.ts`** (exported function named `proxy`), same functionality. This repo's `proxy.ts` delegates to `updateSession` in `lib/supabase/proxy.ts` to refresh Supabase auth sessions.
- **Caching**: new `revalidateTag`/`updateTag`/`refresh` semantics; PPR is opted into via the `cacheComponents` config (the `experimental_ppr` flag is removed).
- **Turbopack is the default** for dev and build; its config lives at the top level of `next.config.ts`.
- **Removed**: `next lint` command, AMP support, runtime configuration, `unstable_rootParams`.
- Parallel routes require a `default.js`.

## Frontend design

Usa siempre /frontend-design para diseñar la interfaz de usuario.

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

Cross-cutting UI lives in `app/components/` (`nav.tsx`, `game-card.tsx`, `user-context.tsx`, etc.).

- **Tailwind CSS v4** via `@tailwindcss/postcss` — configured in CSS (`app/globals.css`), no `tailwind.config` file.
- **TypeScript strict mode**; path alias `@/*` maps to the repo root.
- **Fonts**: Press Start 2P (pixel), JetBrains Mono + Courier Prime (mono) loaded in `app/layout.tsx` via `next/font/google`, exposed as CSS variables (`--pixel`, `--mono`).
- **Design system**: retro-neon theme in `app/globals.css` — CSS custom-property palette (`--cyan`, `--magenta`, `--yellow`, `--green`, `--bg*`, `--ink*`), perspective-grid/scanline background, and per-game cover classes (`cover-rocas`, `cover-snake`, `cover-bricks`, `cover-tetro`, …). Reuse an existing `cover-*` class for a new game unless the spec requires a new one.

### Backend & data (Supabase)

Games and scores live in **Supabase**, not in local files. Two tables: `games` (id/title/short/long/cat/cover/color) and `scores` (game_id/player_name/score/created_at).

- **Data access**: `lib/supabase/games.ts` exposes server helpers — `getGames`, `getGame`, `getTopScores`, `getAllTopScores`. `best`/`plays` are derived from `scores` (MAX / COUNT). `app/data.ts` holds only shared UI types (`Category`, `GameColor`, `CATS`).
- **Clients**: `lib/supabase/server.ts` (Server Components, cookie-based), `lib/supabase/client.ts` (browser — used by the player to `insert` into `scores`), `lib/supabase/proxy.ts` (session refresh via `proxy.ts`).
- **Env vars** (`.env.local`, template in `.env.template`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RESEND_API_KEY`.
- **Auth is simulated**: `user-context.tsx` keeps a `{ name }` user in `localStorage` (`av_user`), used as the default leaderboard name — not real Supabase auth.
- **Contact email**: `app/about/actions.ts` is a Server Action sending mail via **Resend** (currently in sandbox mode → only delivers to the account owner).

### Game architecture

Real games are canvas React components in `app/components/games/<id>-game.tsx`, registered in `GAME_REGISTRY` (`app/components/games/registry.ts`). The registry decouples the player from each game:

- **`GameComponentProps`** — parent controls `paused`; game reports up via `onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver(finalScore, won?)`, `onExtraStatChange` (optional HUD stat, e.g. power-up seconds; `0` = inactive).
- **`GameComponentHandle`** (imperative ref) — `reset()` ("JUGAR DE NUEVO") and `forceGameOver()` ("FIN").
- **`GameRegistryEntry`** — the `Component` plus optional `extraStatLabel` for the HUD.

`game-player.tsx` renders the HUD, controls (PAUSA/FIN/SALIR), the game-over modal, and the save-score flow (browser Supabase `insert`). If a game id isn't in `GAME_REGISTRY`, it falls back to a decorative animated placeholder with a simulated score.

To add a game, prefer `/add-game` over hand-editing — but the moving parts are: the component, the `GAME_REGISTRY` entry, and a row in the Supabase `games` table. Porting sources live in `references/started-games/`; shared asset sources in `references/source-assets/`.
