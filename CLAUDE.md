# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**Arcade Vault** — a platform for playing games online and competing for the highest score. Development follows spec-driven design using the `/spec` and `/spec-impl` skills (from `Klerith/fernando-skills`, installed via `npx skills@latest add Klerith/fernando-skills`).



There is no test setup yet.

## Next.js 16 — differs from training data

This project uses **Next.js 16.2.10** with breaking changes vs. older versions. The authoritative docs are bundled at `node_modules/next/dist/docs/` (App Router docs in `01-app/`; full changelog in `01-app/02-guides/upgrading/version-16.md`). Consult them before writing framework-facing code. Key changes:

- **Async request APIs**: `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are Promises and must be `await`ed — synchronous access is fully removed. Icon/OG image functions receive `params`/`id` as promises too.
- **`middleware.ts` is now `proxy.ts`** (exported function named `proxy`), same functionality.
- **Caching**: new `revalidateTag`/`updateTag`/`refresh` semantics; PPR is opted into via the `cacheComponents` config (the `experimental_ppr` flag is removed).
- **Turbopack is the default** for dev and build; its config lives at the top level of `next.config.ts`.
- **Removed**: `next lint` command, AMP support, runtime configuration, `unstable_rootParams`.
- Parallel routes require a `default.js`.

##

Usa siempre /frontend-design para diseñar la interfaz de usuario.

## Architecture

- **App Router only** — routes live in `app/` (currently just the root `layout.tsx` + `page.tsx` from create-next-app).
- **Tailwind CSS v4** via `@tailwindcss/postcss` — configured in CSS (`app/globals.css`), no `tailwind.config` file.
- **TypeScript strict mode**; path alias `@/*` maps to the repo root.
- Fonts: Geist Sans/Mono loaded in `app/layout.tsx` via `next/font/google`, exposed as CSS variables.
