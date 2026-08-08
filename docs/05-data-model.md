# Data Model & Machine-Readable Formats

This describes how the plain-language ontology in [Core Concepts](02-core-concepts.md) and [Relationships](03-relationships.md) becomes machine-readable, and how the two are kept from drifting apart.

## Source of truth stays in prose

Per [Guiding Principle #1](01-guiding-principles.md), the prose docs are what gets reviewed and debated. Nothing here changes that. What follows is a structured *mirror* of that prose, not a replacement for it.

```
docs/02-core-concepts.md   ─┐
docs/03-relationships.md   ─┴─▶  ontology/source/*.json   ─▶  tools/generate_ontology.py  ─▶  ontology/*.ttl, *.rdf, *.nt, *.jsonld
                                  (canonical, hand-maintained)   (generated, never hand-edited)
```

- **`ontology/source/concepts.json`** and **`ontology/source/relationships.json`** are a structured transcription of the two docs above: one JSON object per concept/relationship, with a stable `id`, matching the prose definitions. They are hand-maintained, not generated.
- **Everything under `ontology/*.ttl`, `*.rdf`, `*.nt`, `*.jsonld`** is generated from the JSON source by `tools/generate_ontology.py` and must never be hand-edited — regenerate instead.
- **`ontology/commongood-atlas.shapes.ttl`** (SHACL) is hand-authored separately: it encodes structural completeness rules (e.g., every class needs a label and a definition) that the generator's output must satisfy, checked by `tools/validate_ontology.py`.

## Sync policy

Any PR that adds, renames, or redefines a concept or relationship in `docs/02-core-concepts.md` or `docs/03-relationships.md` **must** update the corresponding entry in `ontology/source/*.json` in the same PR, then run:

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/generate_ontology.py
.venv/bin/python tools/validate_ontology.py
```

and commit the regenerated files under `ontology/`. CI (`.github/workflows/ontology.yml`) re-runs the generator and fails the build if the committed output doesn't match what generation produces, so drift between the JSON source and the generated formats can't merge silently. CI does not check the JSON source against the prose docs — that agreement is enforced by review, not tooling, for now.

## Canonical JSON schema

### `ontology/source/concepts.json`

Each concept is:

| field | meaning |
|---|---|
| `id` | Stable kebab-case identifier, used to build the concept's IRI and to reference it from `relationships.json`. Never reused for a different concept once published. |
| `label` | Display name, matching the heading used in `02-core-concepts.md`. |
| `aliases` | Other names practitioners use for the same concept (e.g., `"NOFO"` for Funding Opportunity). |
| `category` | Which section of `02-core-concepts.md` the concept belongs to. |
| `kind` | A coarser structural classification (e.g. `organization`, `person-role`, `process`, `entity`) used by the explorer site to pick a node shape/legend grouping. Not emitted into the generated ontology formats — site-only metadata. |
| `definition` | The one-to-three sentence definition, copied from the docs. |
| `subClassOf` | Optional parent concept `id`, only set where the docs explicitly describe one concept as a specialization of another. |
| `docRef` | Relative path/anchor into the docs for traceability. |
| `legalNote` | Optional. A caveat that the concept's real-world legal treatment varies (e.g., by fiscal-sponsorship model) and shouldn't be inferred from the ontology alone — shown as a callout on the concept's site page. |
| `deprecated` | Optional boolean. Marks a concept as superseded (e.g., by a newer reference-data-backed property) without deleting it or its relationships — see `restricted-funding`/`unrestricted-funding` for the first use. Emitted as `owl:deprecated`. |

### `ontology/source/relationships.json`

Each relationship is:

| field | meaning |
|---|---|
| `id` | Stable identifier for the relationship. |
| `subject` | Concept `id` the relationship starts from. Exactly one concept — the generator has no support for a union of subject concepts (see [Organizations, Roles & Arrangements](08-organizations-roles-and-arrangements.md) for why this is a deliberately deferred, not missing, capability). Where two entity types both need the same predicate, model a shared abstract superclass instead (see `Result` and `Agent`) if one fits, or mint a distinctly-named predicate per pair otherwise (see `playsRole`/`personPlaysRole`). |
| `predicate` | camelCase property name (becomes an `owl:ObjectProperty` local name). Must be globally unique across every relationship. |
| `object` | Concept `id` the relationship points to. Same one-concept constraint as `subject`. |
| `label` | Short human-readable phrase (e.g., "is formalized by"). |
| `description` | Fuller explanation, copied from the docs. |
| `docRef` | Relative path/anchor into the docs for traceability. |
| `deprecated` | Optional boolean. Marks a predicate as superseded without deleting it or migrating existing data off it — see `playsRole`/`personPlaysRole`, superseded by `agentPlaysRole`, for the first use. Emitted as `owl:deprecated`. |
| `replacedBy` | Optional. The `id` of the relationship that supersedes this one. Required alongside `deprecated: true`; the generator asserts both hold together. Emitted as `dcterms:isReplacedBy`. |

## Numeric range constraints

As of the Structured Grant Terms and Candid PCS Classification enhancement, a `datatype: "decimal"` property in `ontology/source/properties.json` may additionally carry optional `minValue`/`maxValue` fields (e.g. `classification-assignment-allocation-percentage` sets `"minValue": 0, "maxValue": 100`). The generator asserts these are only ever set alongside `datatype: "decimal"`, and translates them into `sh:minInclusive`/`sh:maxInclusive` constraints in `commongood-atlas.property-shapes.ttl` — real, checked validation, the same division of labor as `allowedValues` → `sh:in` above.

## Known limitation: a reference-typed property's scheme is fixed, not per-instance

Every `datatype: "reference"` property (see [Properties & Rules](06-properties-and-rules.md#phase-37-milestone-3-reference-backed-properties-and-controlled-vocabularies)) names exactly one `referenceScheme`, declared once on the property, not per-instance — `role.status` is always validated against `role-status`, never against a scheme chosen at write time. `classification-assignment` needs to vary *which* scheme applies per instance (Candid PCS Subjects for one assignment, Candid PCS Populations for another), which this mechanism can't express directly.

The workaround, used nowhere else in the ontology: `classification-assignment` splits the concern into two properties. `classificationScheme` is a real `reference`-typed property (scheme: `classification-scheme-registry`) — *which* scheme is in play is SHACL-validated. `classificationConceptCode` is a plain `string` — the code within that scheme, checked for presence (it's `required: true`) but **not** validated against the specific scheme's actual values, since no mechanism here can point a property's validation at a scheme chosen dynamically by a sibling property on the same instance. A `classification-scheme-registry` value naming a scheme that doesn't exist, or a `classificationConceptCode` that isn't a real code in the named scheme, will not be caught by `tools/validate_ontology.py` today. This is a documented, accepted gap, not an oversight — closing it would require either a generator feature with no other current use case, or an application-layer check outside the ontology itself.

## Namespace

Concepts and relationships are minted under:

```
https://egovender.github.io/commongood-atlas/ontology/
```

This is a placeholder aligned with where the Phase 2 explorer is expected to be hosted (GitHub Pages, per the [roadmap](04-roadmap.md)). If CommonGood Atlas ever gets a dedicated domain, the namespace can change — every IRI is generated from `ontology/source/*.json`, so it's a one-line change in `tools/generate_ontology.py`, not a rewrite.

- Concepts: `.../ontology/{concept-id}` — `owl:Class`
- Relationships: `.../ontology/relations/{predicate}` — `owl:ObjectProperty`

## Generated artifacts

Running `tools/generate_ontology.py` produces, all from the same in-memory graph:

- `ontology/commongood-atlas.ttl` — the OWL ontology in Turtle syntax (classes, subclass axioms, object properties with domain/range, labels, definitions). This is the primary, most human-reviewable format.
- `ontology/commongood-atlas.rdf` — the same graph as RDF/XML, for tools that expect it.
- `ontology/commongood-atlas.nt` — the same graph as sorted N-Triples, for diff-friendly RDF interchange.
- `ontology/context.jsonld` — a JSON-LD `@context` mapping the field names above to real terms (`rdfs:label`, `skos:definition`, `skos:altLabel`, etc).
- `ontology/commongood-atlas.jsonld` — the full graph as JSON-LD, using that context.

## What's intentionally not covered yet

Business rules (the "Key relationship rules" list in `03-relationships.md`) are not yet encoded as SHACL constraints — most of them describe temporal/state conditions (e.g., "closeout requires all payments made") that don't map cleanly onto SHACL's shape-validation model without also modeling instance data and events, which is out of scope until the [event model](04-roadmap.md) work happens. The SHACL shapes in `ontology/commongood-atlas.shapes.ttl` mostly validate the *structure* of the ontology itself (every class has a label and definition; every object property has a domain and range), with one deliberate, narrow exception: `Target`/`Measurement`/`Evidence Claim` each have a small relationship-cardinality shape (e.g., "every Target must have exactly one Indicator") — hand-authored rather than generated, and not generalized into a rule that every relationship in the ontology must be mandatory, since no other relationship is SHACL-enforced as required today.
