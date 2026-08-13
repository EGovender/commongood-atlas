# Program Profile & Conceptual Model Generation

**Model Your Program** (`/design/`) used to answer one question: *based on how your grantmaking program operates, which CommonGood Atlas concepts are relevant?* This describes what it became: a deterministic, explainable pipeline that answers a bigger one — *what does your conceptual information model look like, and why is every part of it there?*

## Architecture

```
design-questions.ts
       │
       ▼
normalized answers          (program-model/answers.ts)
       │
       ▼
buildProgramProfile()       (program-model/build-program-profile.ts)
       │
       ├── concepts (with full provenance)
       ├── relationships
       ├── properties (inheritance-resolved)
       ├── reference schemes
       └── business rules (in-scope / related)
       │
       ▼
  ProgramProfile
       │
       ▼
buildConceptualModel()      (program-model/build-conceptual-model.ts)
       │
       ▼
  ConceptualModel  ──▶  ProgramModelWorkbench (/design/model/)
       │                   ├── ProgramModelSummary  (overview panel)
       │                   ├── ProgramModelSearch    (model-scoped search)
       │                   ├── ConceptualModelDiagram / ConceptualModelList  (toggle)
       │                   └── ConceptualModelInspector  (selected concept)
       ▼
   exports.ts  ──▶  Program Profile JSON / Conceptual Model JSON,
                     Markdown, Mermaid
```

The **Program Profile is the canonical intermediate representation**. Everything downstream — the questionnaire's own sidebar, the Conceptual Model workspace, every export format — is derived from it, never computed independently. This is deliberate: two independent interpretations of the same answers could disagree; one shared pipeline can't. `DesignWizard.tsx` and `ProgramModelWorkbench.tsx` both call `buildProgramProfile(answers)` directly rather than each maintaining their own recommendation logic.

`site/src/data/program-model/` holds the whole pipeline:

| file | role |
|---|---|
| `types.ts` | `ProgramProfile` and its full shape; `ConceptualModel` and its projection types |
| `answers.ts` | Pure: visibility, normalization (structural validity + hidden-answer dropping), URL read/write, answer labeling |
| `effects.ts` | `ProgramModelEffect` — normalizes a question's legacy `yes`/`no`/`concepts` shape into `{ concepts, properties?, referenceSchemes? }` |
| `dependencies.ts` | Explicit concept-dependency rules (currently empty — see below) |
| `build-program-profile.ts` | The closure engine |
| `build-conceptual-model.ts` | The profile → conceptual-model projection |
| `exports.ts` | JSON/Markdown/Mermaid export builders |

Everything here is pure — no `window`, `document`, or React dependency in the engine itself, only in the components that call it. `buildProgramProfile(answers)` works identically in a vitest test, in the browser, or (unbuilt today, but architecturally unblocked) a future CLI or server.

## Terminology

- **Seed concept** — foundation, or directly selected by a questionnaire answer.
- **Supporting concept** — pulled in by closure (an ancestor via `subClassOf`, or an explicit dependency rule) because the model would otherwise be structurally incomplete.
- **Direct** (`ProgramProfileConcept.direct`) — foundation or answer-selected, i.e. a seed concept. `false` means supporting.
- **Program Profile** — the full resolved, deterministic representation: concepts (with provenance), relationships, properties, reference schemes, business rules, stats, warnings.
- **Conceptual Model** — a pure visual/business-level projection of a Program Profile: nodes plus relationship and specialization edges. No database, table, column, or key concepts — those belong to a future logical/physical layer (see below), not this one.

## The closure algorithm

1. Normalize raw answers (structural validity, then drop any answer whose own question is no longer visible given the others — see `normalizeAnswers`).
2. Seed the concept set with the foundation (`CORE_CONCEPTS`).
3. Apply each visible, answered question's effect, accumulating an `'answer'` reason per concept — **every** reason is kept, not just the first (a concept two independent answers both select keeps both explanations).
4. Snapshot that set as `direct`.
5. Fixed-point closure: repeatedly walk every concept's `subClassOf` ancestors (via `ontology.ts`'s `getAncestorChain`) and apply any `dependencies.ts` rule, until nothing new is added. A defensive iteration cap emits a `closure-cycle` warning rather than looping forever if the ontology or a dependency rule were ever malformed.
6. Resolve relationships whose subject *and* object both survived closure (checking literal membership is correct at this point precisely because ancestor closure already pulled in every relevant ancestor as a supporting concept in step 5).
7. Resolve properties per concept (reusing `ontology.ts`'s existing inheritance-aware `getPropertiesForConcept` — not a second interpretation of inheritance), merging one row per property across every concept it applies to.
8. Resolve the reference-data scheme behind every reference-typed property actually in scope.
9. Classify every business rule that touches the profile as `in-scope` (every named concept present) or `related` (some, but not all) — never silently pulling in a rule's missing concepts, which would cause uncontrolled expansion.
10. Compute stats and warnings, return the profile.

### Why ancestor closure isn't cosmetic

Before this existed, `DesignWizard`'s recommendation list was a flat `Set` with no closure at all. That was a real, reproducible bug, not a hypothetical: answering "yes" to the donor-advised-fund question added `donor-advised-fund` without its ontology parent `fund` unless the separate `uses-funds` question was *also* answered yes; similarly `matching-requirement` without its parent `grant-condition`, and `approval-requirement` without its parent `grant-term`. The closure engine's own test suite (`build-program-profile.test.ts`) uses these exact three cases as regression tests, not synthetic ones.

### Why `dependencies.ts` is empty

`ProgramModelDependency` exists as a mechanism (a small, explicit, human-reasoned rule: "when concept X is selected, also include Y, because Z"), deliberately **not** a general graph-neighbor expansion — that would collapse every personalized model back into most of the ontology. Simulating closure over the current question set found zero cases ancestor closure alone doesn't already resolve, so the list starts empty. Add a rule here only when it's justified by real ontology structure or business-rule semantics that closure genuinely can't derive — never because a diagram happens to look disconnected (the diagram reflects the model; the model doesn't get reshaped to please the diagram).

## Provenance

Every `ProgramProfileConcept` carries a `reasons: ConceptInclusionReason[]` array — `kind` (`foundation` | `answer` | `ancestor` | `dependency`) plus enough context (source question, source concept, dependency rule id) to render a human sentence without guessing. The UI groups this into three user-facing categories: **Foundation**, **Added from your answers**, **Supporting structure** — never presenting a supporting concept as though the questionnaire specifically recommended it.

## Known limitation: reference-data scheme-membership validation gap doesn't apply here

Unlike the Grant Terms/Classification enhancement's `classificationConceptCode` gap (see `docs/05-data-model.md`), the Program Profile has no equivalent issue — reference schemes are resolved directly from each property's own single, fixed `referenceScheme` id, which is exactly what that mechanism supports.

## Determinism

Given the same answers, ontology version, and closure rules, `buildProgramProfile` always returns a deep-equal `ProgramProfile` — verified directly (`deepEqual` across two identical calls, in tests). Time-sensitive metadata (`generatedAt`) deliberately lives only in `ProgramProfileExportEnvelope`, never in the core profile, so the profile itself stays comparable and the export wrapper is the only place a timestamp appears.

## The `/design/model/` workspace

A dedicated route (`site/src/pages/design/model.astro`), not squeezed into the questionnaire's sidebar — the generated model gets its own wide workspace (`ProgramModelWorkbench.tsx`), matching the same URL-driven regeneration discipline as the questionnaire itself: the model route takes the *same answer query-string* DesignWizard writes (e.g. `/design/model/?review=yes&installments=yes`), not a list of resulting concept ids, and regenerates the whole profile from it. A shared URL stays meaningful even if the ontology evolves after it was created (the profile always names the `ontologyVersion` it was generated against) — sharing a link doesn't imply it permanently recreates an old ontology snapshot.

`site/src/components/program-model/`:

| component | role |
|---|---|
| `ProgramModelWorkbench.tsx` | Owns URL→answers→profile→model state, header stats, the no-answers/incomplete-questionnaire banners, view toggle, selection state |
| `ProgramModelSummary.tsx` | Left overview panel: total/foundation/answers/supporting counts, category breakdown, warnings |
| `ProgramModelSearch.tsx` | Model-scoped search (below) |
| `ConceptualModelDiagram.tsx` | SVG/D3 diagram |
| `ConceptualModelList.tsx` | Accessible, non-SVG alternative view |
| `ConceptualModelInspector.tsx` | Selected concept's detail panel (third grid column, shown only when something is selected) |

Two views over the same `ConceptualModel`, toggled without losing selection:

- **Diagram** (`ConceptualModelDiagram.tsx`) — an SVG/D3 canvas built from the same reusable primitives the Graph Explorer already uses (`graph-utils.ts`, `graph-shapes.ts`, `graph-kinds.ts`, `categories.ts`, `svg-export.ts`), *not* a fork or embedding of `GraphExplorer.tsx` itself — that component's filter/search/pathfinder state is tightly coupled to its own 1389-line rendering effect and isn't safe to extend for a much simpler, provenance-first use case. Solid edges for relationships, dashed for specialization; clicking (or focusing with Tab and pressing Enter/Space — every node is `tabindex=0`/`role="button"`/`aria-label`) selects a node, highlighting it and its neighbors and fading the rest. Respects `prefers-reduced-motion` by skipping the animated force-settle and zoom-transition durations, without touching functional pan/zoom/drag.
- **List** (`ConceptualModelList.tsx`) — a fully accessible, non-SVG alternative that works completely on its own (not merely a fallback): every concept, grouped by category, with its inclusion badge and every relationship/specialization edge spelled out as text, plus a "Details" button that opens the same Inspector.

Selecting a concept (either view, or a search result) opens `ConceptualModelInspector.tsx`: definition, every inclusion reason grouped by kind, every relationship it participates in with real labels, a property count with a collapsed detail list, in-scope/related business rules, and a link to the concept's own page. The panel is `aria-live="polite"`, so a keyboard-driven selection (Tab, then Enter/Space) gets announced to a screen reader without a separate duplicate status string.

The Conceptual Model deliberately answers a different question than the Graph Explorer: Explorer asks *"what exists in the ontology, and how is it all connected?"*; the Program Model asks *"what matters for my program, and why is it here?"* — so it prioritizes provenance and model summary over advanced graph filtering, search, or path-finding. `ProgramModelSearch.tsx` reuses `search.ts`'s `conceptSearchScore` (the same relevance scoring the site-wide `SearchBox` uses) but scoped to only the current model's concepts, and picking a result selects it rather than navigating to the global `/concepts` page.

## Exports

- `commongood-atlas-program-profile.json` — the `ProgramProfile`, wrapped in a timestamped envelope. The intended machine interface for a future logical/physical-model generator (see below) — kept explicit and versioned (`profileSchemaVersion`, separate from `ontologyVersion`) for exactly that reason.
- `commongood-atlas-conceptual-model.json` / `.md` / `.mmd` (Mermaid, plain text — no Mermaid library dependency) — the `ConceptualModel` in machine and human-readable form.
- DesignWizard's own pre-existing JSON/JSON-LD/Markdown/"Download summary" exports are unchanged; Program Profile JSON is additive, sitting alongside them under Developer exports.

## Logical Model

`site/src/data/logical-model/` (Phase 3.12 Milestone 1) is a pure, `program-model/`-dependent projection of a `ProgramProfile` into a database-independent `LogicalModel`: each `ProgramProfileConcept` becomes a `LogicalEntity`, each `ProgramProfileProperty` becomes a typed `LogicalAttribute`, and each `ProgramProfileRelationship`/`subClassOf` pair becomes a `LogicalAssociation`. Still no tables, columns, SQL types, or key-storage concepts — those are a future Implementation Profile / Physical Model layer (see Phase 3.12's remaining milestones in `docs/04-roadmap.md`), which this layer is designed to make possible without needing to be rebuilt, the same way `program-model/` was designed to make this layer possible.

`buildLogicalModel()` (`build-logical-model.ts`) mirrors `build-conceptual-model.ts`'s style exactly: pure, no `window`/`document`/React. Three things it produces are **inferred modeling decisions, not ontology fact** — flagged here explicitly, and surfaced to the reader as `LogicalModelWarning`s, because the ontology genuinely has no data to source them from:

- **`entityType` (`entity` / `abstract-entity` / `reference-entity`)** — nothing in `concepts.json` marks any concept as non-instantiable. A concept is classified `abstract-entity` only when it has zero properties declared on itself *and* at least one subtype also present in the profile (e.g. `organization-role`, which has no properties of its own but real subtypes like `funder`/`grantee` do) — i.e. it exists purely as a property-carrying grouping, not to hold its own instance data. A concept with both subtypes *and* its own properties (e.g. `organization`) stays a plain `entity`, since having subtypes alone isn't evidence a concept is never itself instantiated. `kind === 'reference-scheme' | 'reference-value'` concepts are always `reference-entity`.
- **Synthesized `Identifier` attributes** — no property anywhere in `properties.json` is marked as a natural key. Every entity gets one synthesized `id: Identifier` attribute (`sourcePropertyId: null`), ISA-hierarchy style (the entity conceptually owns identity; subtypes share it). Physical primary-key/foreign-key strategy is explicitly a future Implementation Profile decision, not this layer's.
- **`'unspecified'` association cardinality** — no relationship in `relationships.json` carries a cardinality field (1:1/1:N/N:M) anywhere, and `docs/05-data-model.md` documents no convention for one either. Every business `LogicalAssociation` is marked `cardinality: 'unspecified'` rather than guessed, with a `LogicalModelWarning` surfacing the count. A future ontology proposal adding a real field would flow through this layer automatically once it exists.

One more resolution `build-logical-model.ts` has to do itself, not sourced from the profile directly: `ProgramProfile.relationships` is **not** ancestor-inheritance-resolved the way `ProgramProfile.properties` is (a zero-literal-relationship concept like `use-restriction` has no relationship rows of its own in the profile, even though its `grant-term` ancestor does) — the exact same gap `GraphExplorer.tsx`'s inherited-edge rendering fix addressed for the graph view (see that fix's own commit history for the edge-count analysis behind the scoping rule). `build-logical-model.ts` applies the identical rule: for any entity with zero literal relationships of its own, its effective associations are resolved via `ontology.ts`'s ancestor-chain-aware `getOutgoingRelationships`/`getIncomingRelationships`, substituted onto the concrete entity rather than left on the ancestor.

`site/src/pages/design/logical-model.astro` + `site/src/components/logical-model/` (`LogicalModelWorkbench.tsx`/`LogicalModelSummary.tsx`/`LogicalModelList.tsx`/`LogicalModelInspector.tsx`) mirror the Conceptual Model workspace's own component split, reached via an in-flow "Logical model" link from `/design/model/`'s header (not a persistent top-level nav entry, matching `/design/model/` itself). v1 ships **list-only** — no custom SVG/D3 ER-diagram renderer: `GraphExplorer`/`ConceptualModelDiagram`'s node-shape rendering is concept-bubble-specific and doesn't carry over to boxy ER entities with internal attribute rows, so that's deferred. Instead, `buildLogicalModelMermaid()` emits a real Mermaid `erDiagram` block, viewable as an actual ER diagram in any Mermaid-aware renderer without this site needing to build one.

## What this deliberately doesn't build

Per the source implementation brief this phase came from: **physical model generation, SQL generation, and database-specific mappings are still explicitly out of scope** (only the logical-model milestone above has landed). The Program Profile and Logical Model are designed to make the rest possible later without rewriting either — but no Implementation Profile, no `PhysicalModel<PostgreSQL>` (or any other target), and no table/column/key-as-storage concept exists yet. When that phase happens, the dependency direction stays one-way: a future `physical-model/` layer would depend on `logical-model/`, never the reverse, and database-specific decisions (target database, key strategy, multi-tenancy, etc.) stay in a separate technical questionnaire, never bleeding back into either the conceptual ontology's own meaning or the logical model's database-independence.

## Testing

The closure engine is pure, deterministic logic, which made vitest (this site's first test runner, added specifically for this feature) worth the small new dependency. Tests favor real ontology data and real regression cases (the three orphan-parent bugs above; actual business rules; an actual reference-backed property) over synthetic fixtures, and avoid full-ontology snapshots in favor of targeted assertions — see `site/src/data/program-model/__tests__/` and, for the Logical Model layer, `site/src/data/logical-model/__tests__/`.
