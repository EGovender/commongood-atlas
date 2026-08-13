# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Two things live here and must stay in sync:

- `ontology/source/*.json` (`concepts.json`, `relationships.json`, `properties.json`, `business-rules.json`, `example.json`, `meta.json`, `reference-data/*.json`) — the hand-maintained canonical ontology. Everything else under `ontology/` (`commongood-atlas.ttl`/`.rdf`/`.nt`/`.jsonld`, `.shapes.ttl`, `.property-shapes.ttl`, `.example.*`) is **generated** from it by `tools/generate_ontology.py` — never hand-edit those generated files.
- `site/` — an Astro + React app, deployed to GitHub Pages, that reads `ontology/source/*.json` directly at build time via `site/scripts/sync-ontology-data.mjs`. A concept/relationship/property change in `ontology/source/` needs no separate site-side edit to show up.

`docs/*.md` (numbered `00`–`10`) are the prose spec that `ontology/source/*.json` mirrors into machine-readable form — see `docs/05-data-model.md` before editing anything under `ontology/`, and `docs/04-roadmap.md` for what's done/next (see below).

## Commands

**After any `ontology/source/*.json` change**, regenerate and validate before committing — CI (`.github/workflows/ontology.yml`) fails if the committed generated files don't match what regeneration produces, or if SHACL validation fails:

```bash
.venv/bin/python tools/generate_ontology.py
.venv/bin/python tools/validate_ontology.py
```

(`python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt` once, if `.venv` doesn't exist yet.) Commit the regenerated `ontology/*` files in the same PR as the source change.

**Site development** (Node 22 — `site/.nvmrc`, `nvm use` first):

```bash
cd site
npm run dev      # or: astro dev --background (then astro dev stop/status/logs)
npm run build
npx astro check
```

`predev`/`prebuild` already run `sync-data` (copies `ontology/source/*.json` into `site/src/data/generated/`, gitignored) — don't sync manually, and don't assume a stale local copy if the site looks wrong after an ontology change; re-run `npm run dev`/`build`. More Astro-specific notes live in `site/CLAUDE.md`.

**After a brand/color change**, regenerate the social-preview image and commit the PNG:

```bash
.venv/bin/python tools/generate_og_image.py
```

## Deployment

Pushes to `main` touching `site/**` or `ontology/source/**` auto-deploy to GitHub Pages via `.github/workflows/deploy-site.yml`. After a deploy, follow `docs/09-deployment-checklist.md` — poll `gh run list --repo EGovender/commongood-atlas --limit 1 --json status,conclusion,workflowName,headSha` until both `ontology` and `deploy-site` are green for the commit, then spot-check the *live* site (not just the build), including that `og:image`/`favicon`/`apple-touch-icon` actually reflect current branding — these are static binaries under `site/public/` that don't get regenerated automatically and have gone stale after a rename before.

## Roadmap and governance

`docs/04-roadmap.md` tracks completed and open work across dependency-ordered phases/milestones. It has drifted from actual repo state before (items marked undone that were already shipped, and UI descriptions superseded by later follow-up work) — when a task depends on "is X already done," verify against the actual code/site rather than trusting the checkbox alone, and correct the roadmap entry once verified either way.

Ontology content changes (new/changed concepts, relationships, rules) go through the issue-label lifecycle in `CONTRIBUTING.md#contribution-lifecycle` (`status:proposed → under-review → accepted/declined → ready-for-pr → published`) before landing in `ontology/source/`; site-only bugs/features can go straight to a PR.

Two ontology-connectivity gaps are tracked as open GitHub issues rather than roadmap checkboxes, since each needs per-concept maintainer triage rather than a mechanical fix: [#1](https://github.com/EGovender/commongood-atlas/issues/1) (the six Phase 3.7 Milestone 2 Organization Role subtypes — Contractor, Vendor, Service Provider, Employer, Partner, Sponsoring Organization — have no relationships of their own) and [#2](https://github.com/EGovender/commongood-atlas/issues/2) (`Indirect Cost Rate` has zero relationships and no `subClassOf` parent). See `docs/04-roadmap.md` Phase 2.

The next planned major phase is **Logical & Physical Model Generation** (`docs/04-roadmap.md` Phase 3.12, not started) — extending the Program Profile pipeline (`site/src/data/program-model/`, see `docs/10-program-model-generation.md`) two more steps toward an actual database schema. Dependency direction stays one-way: a future `logical-model/` layer depends on `program-model/`, never the reverse, and physical/implementation-specific decisions (target database, key strategy, multi-tenancy, etc.) stay in a separate technical questionnaire, never bleeding back into the conceptual ontology's own meaning.

## Working conventions established in this repo

- One git branch per task, descriptive name, detailed commit messages.
- Verify before calling anything done: `npx astro check` + `npm run build` (site changes) or `generate_ontology.py` + `validate_ontology.py` (ontology changes), plus a live-browser check of the actual behavior for UI work — type-checking and builds verify correctness, not that the feature works as intended.
- Default to asking before merging a task branch into `main` (which triggers a live deploy) — proceed straight through commit → merge → push → deploy only when a task explicitly pre-authorizes the full pipeline.
