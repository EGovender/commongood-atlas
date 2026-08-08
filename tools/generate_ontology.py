#!/usr/bin/env python3
"""
Generates ontology/commongood-atlas.{ttl,rdf,nt,jsonld}, ontology/context.jsonld,
and ontology/commongood-atlas.property-shapes.ttl from the canonical,
hand-maintained JSON in ontology/source/, including the controlled-vocabulary
schemes under ontology/source/reference-data/ (see
docs/06-properties-and-rules.md), which are emitted as real, IRI-identified
skos:ConceptScheme/skos:Concept resources in the same main outputs -- not a
blank-node structure, so they don't disturb this file's determinism story below.

Do not hand-edit the generated files under ontology/ -- edit the JSON files in
ontology/source/ instead, then re-run this script. See docs/05-data-model.md
and docs/06-properties-and-rules.md for the full policy.

Output must be byte-reproducible across machines/CI so the drift check in
.github/workflows/ontology.yml is meaningful. rdflib's RDF/XML and JSON-LD
serializers iterate internal sets whose order isn't guaranteed stable across
Python/rdflib versions or processes, so commongood-atlas.rdf and
commongood-atlas.jsonld are built directly from the sorted source data instead
of via g.serialize(). The main Turtle and N-Triples outputs use rdflib's
serializer (verified stable across seeds/environments for a graph with no
blank nodes), but the property shapes file uses SHACL property shapes and RDF
list nodes for sh:in, both of which are blank-node-based -- rdflib's Turtle
serializer's blank node/list ordering is NOT guaranteed stable there, so that
file is hand-built as text from the sorted source data too, same as the
RDF/XML and JSON-LD outputs.
"""
import json
import xml.etree.ElementTree as ET
from datetime import date as date_cls
from decimal import Decimal
from pathlib import Path

from rdflib import Graph, Literal, Namespace, OWL, RDF, RDFS, URIRef, XSD
from rdflib.namespace import DCTERMS, SKOS

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "ontology" / "source"
REFDATA_DIR = SOURCE_DIR / "reference-data"
OUT_DIR = ROOT / "ontology"

BASE = "https://egovender.github.io/commongood-atlas/ontology/"
REL_BASE = BASE + "relations/"
PROP_BASE = BASE + "properties/"
RULE_BASE = BASE + "rules/"
EXAMPLE_BASE = BASE + "examples/"
REFDATA_BASE = BASE + "reference-data/"
NPO = Namespace(BASE)
NPOREL = Namespace(REL_BASE)
NPOPROP = Namespace(PROP_BASE)
NPORULE = Namespace(RULE_BASE)
NPOEX = Namespace(EXAMPLE_BASE)
NPOREF = Namespace(REFDATA_BASE)

RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#"
OWL_NS = "http://www.w3.org/2002/07/owl#"
SKOS_NS = "http://www.w3.org/2004/02/skos/core#"
XSD_NS = "http://www.w3.org/2001/XMLSchema#"
DCTERMS_NS = "http://purl.org/dc/terms/"

VALID_MAPPING_RELATIONS = {"exactMatch", "closeMatch", "broadMatch", "narrowMatch", "relatedMatch"}

ONTOLOGY_COMMENT = (
    "Generated from ontology/source/*.json. Do not hand-edit. "
    "See docs/05-data-model.md and docs/06-properties-and-rules.md."
)

DATATYPE_TO_XSD = {
    "string": XSD.string,
    "decimal": XSD.decimal,
    "date": XSD.date,
    "boolean": XSD.boolean,
    # Enum values are represented as plain strings; the allowed set is
    # enforced by SHACL sh:in, not by an OWL-level datatype restriction.
    "enum": XSD.string,
}

# "reference" is a distinct datatype, not in DATATYPE_TO_XSD: a reference-backed
# property's value is a skos:Concept resource (an owl:ObjectProperty), not an
# RDF literal, so it has no XSD type -- see load_reference_data() and every
# "datatype == 'reference'" branch below.
ALL_DATATYPES = set(DATATYPE_TO_XSD) | {"reference"}


def resolve_properties_by_concept(concepts, properties):
    """Maps each concept id to {property name: property def}, INCLUDING
    properties inherited from ancestor concepts via subClassOf (e.g. Funder
    inherits Organization Role's `status`) -- a concept's own directly
    declared property overrides an inherited one of the same name.

    This matters because SHACL's sh:targetClass resolves subclass instances
    per the SHACL spec regardless of the `inference` mode passed to
    validate() -- an individual typed `a npo:funder` is automatically a
    SHACL-instance of `npo:organization-role` too, once `funder` is
    subClassOf `organization-role`, and gets that shape's constraints
    applied. Only checking a concept's own directly-declared properties here
    would under-validate example individuals of a reparented concept -- see
    docs/08-organizations-roles-and-arrangements.md."""
    concepts_by_id = {c["id"]: c for c in concepts}
    direct: dict[str, dict[str, dict]] = {}
    for p in properties:
        direct.setdefault(p["concept"], {})[p["name"]] = p

    resolved: dict[str, dict[str, dict]] = {}

    def resolve(concept_id, chain):
        if concept_id in resolved:
            return resolved[concept_id]
        assert concept_id not in chain, f"subClassOf cycle detected at {concept_id}"
        parent = concepts_by_id[concept_id].get("subClassOf")
        merged: dict[str, dict] = {}
        if parent:
            merged.update(resolve(parent, chain | {concept_id}))
        merged.update(direct.get(concept_id, {}))
        resolved[concept_id] = merged
        return merged

    for cid in concepts_by_id:
        resolve(cid, frozenset())
    return resolved


def ancestor_ids(concept_id, concepts_by_id):
    """A concept's id plus every ancestor's id walking up subClassOf -- the
    set of types an instance of this concept structurally is. Mirrors
    resolve_properties_by_concept's chain-walking, but for concept identity
    rather than property merging: under RDFS semantics, an individual typed
    as a subclass is also an instance of every ancestor class, so it may
    legitimately be the subject/object of a relationship whose declared
    domain/range is an ancestor concept (e.g. a `fiscal-sponsorship-arrangement`
    individual using `administeredBy`, declared on `philanthropic-arrangement`)."""
    chain = set()
    current = concept_id
    while current and current not in chain:
        chain.add(current)
        current = concepts_by_id[current].get("subClassOf")
    return chain


def load_reference_data():
    """Loads and cross-validates every ontology/source/reference-data/*.json
    controlled-vocabulary scheme -- see docs/06-properties-and-rules.md for the
    SKOS-based governance model this backs. Returns schemes sorted by id, each
    with its `values` list sorted by id."""
    schemes = [json.loads(f.read_text()) for f in sorted(REFDATA_DIR.glob("*.json"))]
    schemes = sorted(schemes, key=lambda s: s["id"])

    scheme_ids = {s["id"] for s in schemes}
    assert len(scheme_ids) == len(schemes), "duplicate reference-data scheme id"

    value_ids: dict[str, str] = {}  # value id -> owning scheme id, for global uniqueness + lookups
    for s in schemes:
        s["values"] = sorted(s["values"], key=lambda v: v["id"])
        assert s["authorityType"] in {"internal", "external"}, (
            f"scheme '{s['id']}' has unknown authorityType '{s['authorityType']}'"
        )
        assert s["values"], f"scheme '{s['id']}' has no values"

        codes = [v["code"] for v in s["values"]]
        assert len(set(codes)) == len(codes), f"duplicate value code within scheme '{s['id']}'"

        for v in s["values"]:
            assert v["id"] not in value_ids, f"duplicate reference-data value id '{v['id']}'"
            value_ids[v["id"]] = s["id"]

    for s in schemes:
        for v in s["values"]:
            if v.get("broader"):
                assert value_ids.get(v["broader"]) == s["id"], (
                    f"value '{v['id']}' in scheme '{s['id']}' has broader '{v['broader']}', "
                    f"which is not a value of the same scheme"
                )
            if v.get("replacedBy"):
                assert value_ids.get(v["replacedBy"]) == s["id"], (
                    f"value '{v['id']}' in scheme '{s['id']}' has replacedBy '{v['replacedBy']}', "
                    f"which is not a value of the same scheme"
                )
                assert v.get("deprecated"), (
                    f"value '{v['id']}' has replacedBy set but is not itself deprecated"
                )
            for m in v.get("mappings", []):
                assert m["relation"] in VALID_MAPPING_RELATIONS, (
                    f"value '{v['id']}' has an unknown mapping relation '{m['relation']}'"
                )

    publication_status = next(s for s in schemes if s["id"] == "publication-status")
    publication_codes = {v["code"] for v in publication_status["values"]}
    for s in schemes:
        assert s["publicationStatus"] in publication_codes, (
            f"scheme '{s['id']}' has publicationStatus '{s['publicationStatus']}', "
            f"which is not a value of the publication-status scheme"
        )

    return schemes


def load_source():
    concepts = json.loads((SOURCE_DIR / "concepts.json").read_text())
    relationships = json.loads((SOURCE_DIR / "relationships.json").read_text())
    properties = json.loads((SOURCE_DIR / "properties.json").read_text())
    business_rules = json.loads((SOURCE_DIR / "business-rules.json").read_text())
    meta = json.loads((SOURCE_DIR / "meta.json").read_text())
    reference_data = load_reference_data()

    concepts = sorted(concepts, key=lambda c: c["id"])
    relationships = sorted(relationships, key=lambda r: r["id"])
    properties = sorted(properties, key=lambda p: p["id"])
    business_rules = sorted(business_rules, key=lambda r: r["id"])

    concept_ids = {c["id"] for c in concepts}
    assert len(concept_ids) == len(concepts), "duplicate concept id"
    rel_ids = [r["id"] for r in relationships]
    assert len(set(rel_ids)) == len(rel_ids), "duplicate relationship id"
    predicates = [r["predicate"] for r in relationships]
    assert len(set(predicates)) == len(predicates), "duplicate relationship predicate"
    rel_ids_set = set(rel_ids)
    for r in relationships:
        if r.get("replacedBy"):
            assert r["replacedBy"] in rel_ids_set, (
                f"relationship '{r['id']}' has replacedBy '{r['replacedBy']}', which is not a known relationship id"
            )
            assert r.get("deprecated"), (
                f"relationship '{r['id']}' has replacedBy set but is not itself deprecated"
            )

    reference_schemes_by_id = {s["id"]: s for s in reference_data}
    prop_ids = [p["id"] for p in properties]
    assert len(set(prop_ids)) == len(prop_ids), "duplicate property id"
    for p in properties:
        assert p["concept"] in concept_ids, f"unknown concept in property {p['id']}"
        assert p["datatype"] in ALL_DATATYPES, f"unknown datatype in property {p['id']}"
        if p["datatype"] == "enum":
            assert p["allowedValues"], f"enum property missing allowedValues: {p['id']}"
            assert p.get("referenceScheme") is None, f"enum property has referenceScheme: {p['id']}"
        elif p["datatype"] == "reference":
            assert p["allowedValues"] is None, f"reference property has allowedValues: {p['id']}"
            assert p.get("referenceScheme") in reference_schemes_by_id, (
                f"property {p['id']} has unknown referenceScheme '{p.get('referenceScheme')}'"
            )
        else:
            assert p["allowedValues"] is None, f"non-enum property has allowedValues: {p['id']}"
            assert p.get("referenceScheme") is None, f"non-reference property has referenceScheme: {p['id']}"
        if p.get("minValue") is not None or p.get("maxValue") is not None:
            assert p["datatype"] == "decimal", f"minValue/maxValue only valid on decimal properties: {p['id']}"

    rule_ids = [r["id"] for r in business_rules]
    assert len(set(rule_ids)) == len(rule_ids), "duplicate business rule id"
    for r in business_rules:
        for cid in r["concepts"]:
            assert cid in concept_ids, f"unknown concept in business rule {r['id']}"

    example = json.loads((SOURCE_DIR / "example.json").read_text())
    example["individuals"] = sorted(example["individuals"], key=lambda i: i["id"])
    example["relationships"] = sorted(example["relationships"], key=lambda r: (r["predicate"], r["subject"]))
    validate_example(example, concepts, properties, relationships, reference_schemes_by_id)

    return concepts, relationships, properties, business_rules, meta, example, reference_data


def validate_example(example, concepts, properties, relationships, reference_schemes_by_id):
    """Cross-checks ontology/source/example.json against the schema it claims to
    instantiate -- every individual's concept must exist, every property name
    must be defined for that concept OR one of its ancestors (with a valid
    enum or reference-scheme value if applicable), every required property
    (including inherited ones) must be present, and every relationship must
    use a real predicate between individuals of the types that predicate
    expects."""
    concept_ids = {c["id"] for c in concepts}
    concepts_by_id = {c["id"]: c for c in concepts}
    properties_by_concept = resolve_properties_by_concept(concepts, properties)

    individuals_by_id = {}
    for ind in example["individuals"]:
        assert ind["id"] not in individuals_by_id, f"duplicate example individual id {ind['id']}"
        individuals_by_id[ind["id"]] = ind
        assert ind["concept"] in concept_ids, f"unknown concept in example individual {ind['id']}"

        concept_props = properties_by_concept.get(ind["concept"], {})
        given = ind.get("properties", {})
        for name, value in given.items():
            assert name in concept_props, (
                f"example individual '{ind['id']}': unknown property '{name}' "
                f"for concept '{ind['concept']}'"
            )
            pdef = concept_props[name]
            if pdef["datatype"] == "enum":
                assert value in pdef["allowedValues"], (
                    f"example individual '{ind['id']}': invalid value '{value}' for "
                    f"enum property '{name}' (allowed: {pdef['allowedValues']})"
                )
            elif pdef["datatype"] == "reference":
                scheme = reference_schemes_by_id[pdef["referenceScheme"]]
                codes = [v["code"] for v in scheme["values"]]
                assert value in codes, (
                    f"example individual '{ind['id']}': invalid value '{value}' for "
                    f"reference property '{name}' (scheme '{scheme['id']}' allows: {codes})"
                )
        for name, pdef in concept_props.items():
            if pdef["required"]:
                assert name in given, (
                    f"example individual '{ind['id']}' ({ind['concept']}) is missing "
                    f"required property '{name}'"
                )

    relationships_by_predicate = {r["predicate"]: r for r in relationships}
    for rel in example["relationships"]:
        assert rel["predicate"] in relationships_by_predicate, (
            f"example relationship uses unknown predicate '{rel['predicate']}'"
        )
        rel_def = relationships_by_predicate[rel["predicate"]]
        for role in ("subject", "object"):
            assert rel[role] in individuals_by_id, (
                f"example relationship '{rel['predicate']}': unknown {role} individual '{rel[role]}'"
            )
        subj_concept = individuals_by_id[rel["subject"]]["concept"]
        obj_concept = individuals_by_id[rel["object"]]["concept"]
        assert rel_def["subject"] in ancestor_ids(subj_concept, concepts_by_id), (
            f"example relationship '{rel['predicate']}' expects a '{rel_def['subject']}' subject "
            f"(or a subtype of it), but individual '{rel['subject']}' is a '{subj_concept}'"
        )
        assert rel_def["object"] in ancestor_ids(obj_concept, concepts_by_id), (
            f"example relationship '{rel['predicate']}' expects a '{rel_def['object']}' object "
            f"(or a subtype of it), but individual '{rel['object']}' is a '{obj_concept}'"
        )


def doc_url(doc_ref: str) -> str:
    return "https://github.com/EGovender/commongood-atlas/blob/main/" + doc_ref


def concept_iri(concept_id: str) -> URIRef:
    return NPO[concept_id]


def relation_iri(predicate: str) -> URIRef:
    return NPOREL[predicate]


def property_iri(property_id: str) -> URIRef:
    return NPOPROP[property_id]


def rule_iri(rule_id: str) -> URIRef:
    return NPORULE[rule_id]


def example_iri(individual_id: str) -> URIRef:
    return NPOEX[individual_id]


def reference_scheme_iri(scheme_id: str) -> URIRef:
    return NPOREF[scheme_id]


def reference_value_id(scheme: dict, code: str) -> str:
    return next(v["id"] for v in scheme["values"] if v["code"] == code)


def reference_value_iri(scheme: dict, code: str) -> URIRef:
    return NPOREF[reference_value_id(scheme, code)]


def property_value_literal(prop_def: dict, raw_value) -> Literal:
    """Converts a JSON value from example.json into an RDF literal typed to
    match the property's declared datatype, so it actually satisfies the
    property's SHACL sh:datatype constraint (rather than defaulting to a
    plain untyped/string literal)."""
    datatype = prop_def["datatype"]
    if datatype == "decimal":
        return Literal(Decimal(raw_value))
    if datatype == "date":
        return Literal(date_cls.fromisoformat(raw_value))
    if datatype == "boolean":
        return Literal(bool(raw_value))
    return Literal(str(raw_value), datatype=XSD.string)


def add_reference_data(g: Graph, reference_data):
    """Emits every reference-data scheme and its values as real, IRI-identified
    skos:ConceptScheme/skos:Concept resources -- no blank nodes, so this is
    safe to add to the main graph alongside the deterministic-serialization
    invariant described in this module's docstring. See
    docs/06-properties-and-rules.md for the governance model."""
    schemes_by_id = {s["id"]: s for s in reference_data}
    publication_status_scheme = schemes_by_id["publication-status"]

    for s in reference_data:
        scheme_iri = reference_scheme_iri(s["id"])
        g.add((scheme_iri, RDF.type, SKOS.ConceptScheme))
        g.add((scheme_iri, SKOS.prefLabel, Literal(s["label"])))
        g.add((scheme_iri, SKOS.definition, Literal(s["description"])))
        g.add((scheme_iri, NPO.schemeDomain, Literal(s["domain"])))
        g.add((scheme_iri, NPO.authorityType, Literal(s["authorityType"])))
        g.add((scheme_iri, NPO.version, Literal(s["version"])))
        g.add((scheme_iri, NPO.publicationStatus,
               reference_value_iri(publication_status_scheme, s["publicationStatus"])))

        for v in s["values"]:
            v_iri = NPOREF[v["id"]]
            g.add((v_iri, RDF.type, SKOS.Concept))
            g.add((v_iri, SKOS.inScheme, scheme_iri))
            g.add((v_iri, SKOS.notation, Literal(v["code"])))
            g.add((v_iri, SKOS.prefLabel, Literal(v["label"])))
            g.add((v_iri, SKOS.definition, Literal(v["definition"])))
            if v.get("deprecated"):
                g.add((v_iri, OWL.deprecated, Literal(True)))
            if v.get("broader"):
                g.add((v_iri, SKOS.broader, NPOREF[v["broader"]]))
            if v.get("replacedBy"):
                g.add((v_iri, DCTERMS.isReplacedBy, NPOREF[v["replacedBy"]]))
            for m in v.get("mappings", []):
                g.add((v_iri, SKOS[m["relation"]], URIRef(m["uri"])))


def build_graph(concepts, relationships, properties, business_rules, meta, reference_data) -> Graph:
    """Used for the Turtle and N-Triples outputs (both verified deterministic)."""
    g = Graph()
    g.bind("npo", NPO)
    g.bind("nporel", NPOREL)
    g.bind("npoprop", NPOPROP)
    g.bind("nporule", NPORULE)
    g.bind("nporef", NPOREF)
    g.bind("owl", OWL)
    g.bind("rdfs", RDFS)
    g.bind("skos", SKOS)
    g.bind("dcterms", DCTERMS)

    ontology_iri = URIRef(BASE.rstrip("/"))
    g.add((ontology_iri, RDF.type, OWL.Ontology))
    g.add((ontology_iri, RDFS.label, Literal("CommonGood Atlas Grantmaking Ontology")))
    g.add((ontology_iri, RDFS.comment, Literal(ONTOLOGY_COMMENT)))
    g.add((ontology_iri, NPO.version, Literal(meta["version"])))

    # rdfs:Class, not owl:Class -- ConceptShape targets owl:Class for actual
    # domain concepts, and BusinessRule is a meta-class for rule instances,
    # not a concept itself (it has no definition/category/docRef of its own).
    g.add((NPO.BusinessRule, RDF.type, RDFS.Class))
    g.add((NPO.BusinessRule, RDFS.label, Literal("Business Rule")))

    for c in concepts:
        iri = concept_iri(c["id"])
        g.add((iri, RDF.type, OWL.Class))
        g.add((iri, RDFS.label, Literal(c["label"])))
        g.add((iri, SKOS.definition, Literal(c["definition"])))
        g.add((iri, NPO.category, Literal(c["category"])))
        g.add((iri, RDFS.isDefinedBy, URIRef(doc_url(c["docRef"]))))
        for alias in c.get("aliases", []):
            g.add((iri, SKOS.altLabel, Literal(alias)))
        if c.get("subClassOf"):
            g.add((iri, RDFS.subClassOf, concept_iri(c["subClassOf"])))
        if c.get("legalNote"):
            g.add((iri, NPO.legalNote, Literal(c["legalNote"])))
        if c.get("deprecated"):
            g.add((iri, OWL.deprecated, Literal(True)))

    relationships_by_id = {r["id"]: r for r in relationships}
    for r in relationships:
        iri = relation_iri(r["predicate"])
        g.add((iri, RDF.type, OWL.ObjectProperty))
        g.add((iri, RDFS.label, Literal(r["label"])))
        g.add((iri, RDFS.comment, Literal(r["description"])))
        g.add((iri, RDFS.domain, concept_iri(r["subject"])))
        g.add((iri, RDFS.range, concept_iri(r["object"])))
        g.add((iri, RDFS.isDefinedBy, URIRef(doc_url(r["docRef"]))))
        if r.get("deprecated"):
            g.add((iri, OWL.deprecated, Literal(True)))
        if r.get("replacedBy"):
            replacement_predicate = relationships_by_id[r["replacedBy"]]["predicate"]
            g.add((iri, DCTERMS.isReplacedBy, relation_iri(replacement_predicate)))

    for p in properties:
        iri = property_iri(p["id"])
        g.add((iri, RDFS.label, Literal(p["label"])))
        g.add((iri, RDFS.comment, Literal(p["description"])))
        g.add((iri, RDFS.domain, concept_iri(p["concept"])))
        g.add((iri, NPO.group, Literal(p["group"])))
        g.add((iri, NPO.required, Literal(p["required"])))
        g.add((iri, NPO.cardinality, Literal(p["cardinality"])))
        if p["datatype"] == "reference":
            g.add((iri, RDF.type, OWL.ObjectProperty))
            g.add((iri, RDFS.range, SKOS.Concept))
            g.add((iri, NPO.referenceScheme, reference_scheme_iri(p["referenceScheme"])))
        else:
            g.add((iri, RDF.type, OWL.DatatypeProperty))
            g.add((iri, RDFS.range, DATATYPE_TO_XSD[p["datatype"]]))
            for value in p.get("allowedValues") or []:
                g.add((iri, NPO.allowedValue, Literal(value)))

    for r in business_rules:
        iri = rule_iri(r["id"])
        g.add((iri, RDF.type, NPO.BusinessRule))
        g.add((iri, RDFS.label, Literal(r["label"])))
        g.add((iri, RDFS.comment, Literal(r["description"])))
        g.add((iri, RDFS.isDefinedBy, URIRef(doc_url(r["docRef"]))))
        for cid in r["concepts"]:
            g.add((iri, NPO.appliesTo, concept_iri(cid)))

    add_reference_data(g, reference_data)

    return g


def turtle_string(s: str) -> str:
    """Turtle triple-quoted string literal, safe for text containing quotes
    or apostrophes without needing per-character escaping. Explicitly typed
    ^^xsd:string rather than left as a plain literal -- rdflib's Literal
    equality treats a plain literal and an explicitly xsd:string-typed one as
    UNEQUAL (even though RDF 1.1 defines them as equivalent), which silently
    broke sh:in matching against explicitly-typed values elsewhere."""
    return '"""' + s.replace("\\", "\\\\") + '"""^^xsd:string'


def build_property_shapes_text(properties) -> str:
    """Per-concept SHACL PropertyShapes enforcing required-ness, datatype (or,
    for reference-backed properties, scheme membership), allowed values, and
    -- for decimal properties with an optional minValue/maxValue -- a numeric
    range, for each attribute in properties.json. Generated -- see
    docs/06-properties-and-rules.md. Kept separate from the hand-authored
    ontology/commongood-atlas.shapes.ttl, which validates the ontology's own
    structural completeness rather than per-concept business data.

    Built as text, not an rdflib Graph, because SHACL property shapes and the
    RDF list underlying sh:in are blank-node structures whose serialized
    order rdflib does not guarantee stable across environments. The nested
    blank nodes used for reference-backed properties' scheme-membership check
    are hand-written in a fixed order below, so they carry no such risk --
    unlike rdflib's serializer, this function's own output order never varies."""
    by_concept: dict[str, list] = {}
    for p in properties:
        by_concept.setdefault(p["concept"], []).append(p)

    lines = [
        "@prefix sh: <http://www.w3.org/ns/shacl#> .",
        f"@prefix npo: <{BASE}> .",
        f"@prefix npoprop: <{PROP_BASE}> .",
        f"@prefix nporef: <{REFDATA_BASE}> .",
        f"@prefix skos: <{SKOS_NS}> .",
        f"@prefix xsd: <{XSD_NS}> .",
        "",
    ]

    for concept_id in sorted(by_concept):
        prop_blocks = []
        for p in sorted(by_concept[concept_id], key=lambda p: p["id"]):
            parts = [f"sh:path npoprop:{p['id']}"]
            if p["datatype"] == "reference":
                parts.append("sh:class skos:Concept")
                parts.append(
                    "sh:node [ sh:property [ sh:path skos:inScheme ; "
                    f"sh:hasValue nporef:{p['referenceScheme']} ] ]"
                )
            else:
                xsd_local = DATATYPE_TO_XSD[p["datatype"]].rsplit("#", 1)[-1]
                parts.append(f"sh:datatype xsd:{xsd_local}")
            parts.append(f"sh:minCount {1 if p['required'] else 0}")
            if p["cardinality"] == "one":
                parts.append("sh:maxCount 1")
            if p["allowedValues"]:
                values = " ".join(turtle_string(v) for v in p["allowedValues"])
                parts.append(f"sh:in ( {values} )")
            if p.get("minValue") is not None:
                parts.append(f"sh:minInclusive {p['minValue']}")
            if p.get("maxValue") is not None:
                parts.append(f"sh:maxInclusive {p['maxValue']}")
            prop_blocks.append("[ " + " ; ".join(parts) + " ]")

        lines.append(f"npo:{concept_id}-property-shape")
        lines.append("    a sh:NodeShape ;")
        lines.append(f"    sh:targetClass npo:{concept_id} ;")
        lines.append("    sh:property " + " ,\n        ".join(prop_blocks) + " .")
        lines.append("")

    return "\n".join(lines).rstrip("\n") + "\n"


def write_turtle_and_ntriples(g: Graph):
    ttl = g.serialize(format="turtle")
    (OUT_DIR / "commongood-atlas.ttl").write_text(ttl.rstrip("\n") + "\n")

    nt_lines = sorted(g.serialize(format="nt").strip().splitlines())
    (OUT_DIR / "commongood-atlas.nt").write_text("\n".join(nt_lines) + "\n")


def write_property_shapes(properties):
    header = (
        "# Generated by tools/generate_ontology.py from ontology/source/properties.json.\n"
        "# Do not hand-edit -- see docs/06-properties-and-rules.md.\n\n"
    )
    (OUT_DIR / "commongood-atlas.property-shapes.ttl").write_text(
        header + build_property_shapes_text(properties)
    )


def build_example_graph(example, concepts, properties, reference_data) -> Graph:
    """The worked example (docs/07-worked-example.md) as real owl:NamedIndividual
    instances -- kept in its own graph/namespace (.../ontology/examples/) so
    schema (commongood-atlas.ttl) and illustrative instance data never mix in the file
    someone would import to get the ontology itself. No blank nodes here, so
    (like the main graph) rdflib's Turtle/N-Triples serialization is stable."""
    properties_by_concept = resolve_properties_by_concept(concepts, properties)
    schemes_by_id = {s["id"]: s for s in reference_data}

    g = Graph()
    g.bind("npo", NPO)
    g.bind("nporel", NPOREL)
    g.bind("npoprop", NPOPROP)
    g.bind("nporef", NPOREF)
    g.bind("ex", NPOEX)

    for ind in example["individuals"]:
        iri = example_iri(ind["id"])
        g.add((iri, RDF.type, OWL.NamedIndividual))
        g.add((iri, RDF.type, concept_iri(ind["concept"])))
        g.add((iri, RDFS.label, Literal(ind["label"])))
        concept_props = properties_by_concept.get(ind["concept"], {})
        for name, value in ind.get("properties", {}).items():
            pdef = concept_props[name]
            if pdef["datatype"] == "reference":
                scheme = schemes_by_id[pdef["referenceScheme"]]
                g.add((iri, property_iri(pdef["id"]), reference_value_iri(scheme, value)))
            else:
                g.add((iri, property_iri(pdef["id"]), property_value_literal(pdef, value)))

    for rel in example["relationships"]:
        g.add((example_iri(rel["subject"]), relation_iri(rel["predicate"]), example_iri(rel["object"])))

    return g


def write_example_ttl_and_nt(g: Graph):
    header = (
        "# The worked example from ontology/source/example.json, as RDF individuals.\n"
        "# Generated -- do not hand-edit. See docs/07-worked-example.md.\n\n"
    )
    ttl = g.serialize(format="turtle")
    (OUT_DIR / "commongood-atlas.example.ttl").write_text(header + ttl.lstrip("\n").rstrip("\n") + "\n")

    nt_lines = sorted(g.serialize(format="nt").strip().splitlines())
    (OUT_DIR / "commongood-atlas.example.nt").write_text("\n".join(nt_lines) + "\n")


def write_example_jsonld(example, concepts, properties, reference_data):
    properties_by_concept = resolve_properties_by_concept(concepts, properties)
    schemes_by_id = {s["id"]: s for s in reference_data}

    context = {
        "@version": 1.1,
        "npo": BASE,
        "nporel": REL_BASE,
        "npoprop": PROP_BASE,
        "nporef": REFDATA_BASE,
        "ex": EXAMPLE_BASE,
        "owl": "http://www.w3.org/2002/07/owl#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
        "xsd": XSD_NS,
        "label": "rdfs:label",
        "type": "@type",
        "id": "@id",
    }

    graph_nodes = []
    for ind in example["individuals"]:
        node: dict = {
            "id": "ex:" + ind["id"],
            "type": ["owl:NamedIndividual", "npo:" + ind["concept"]],
            "label": ind["label"],
        }
        concept_props = properties_by_concept.get(ind["concept"], {})
        for name, value in ind.get("properties", {}).items():
            pdef = concept_props[name]
            key = "npoprop:" + pdef["id"]
            if pdef["datatype"] == "reference":
                scheme = schemes_by_id[pdef["referenceScheme"]]
                node[key] = {"@id": "nporef:" + reference_value_id(scheme, value)}
            elif pdef["datatype"] == "decimal":
                node[key] = {"@value": str(Decimal(value)), "@type": "xsd:decimal"}
            elif pdef["datatype"] == "date":
                node[key] = {"@value": value, "@type": "xsd:date"}
            elif pdef["datatype"] == "boolean":
                node[key] = {"@value": bool(value), "@type": "xsd:boolean"}
            else:
                node[key] = {"@value": str(value), "@type": "xsd:string"}
        graph_nodes.append(node)

    for rel in example["relationships"]:
        subject_node = next(n for n in graph_nodes if n["id"] == "ex:" + rel["subject"])
        subject_node["nporel:" + rel["predicate"]] = {"@id": "ex:" + rel["object"]}

    document = {"@context": context, "@graph": graph_nodes}
    (OUT_DIR / "commongood-atlas.example.jsonld").write_text(json.dumps(document, indent=2) + "\n")


def write_rdf_xml(concepts, relationships, properties, business_rules, meta, reference_data):
    for prefix, uri in (("rdf", RDF_NS), ("rdfs", RDFS_NS), ("owl", OWL_NS),
                        ("skos", SKOS_NS), ("dcterms", DCTERMS_NS), ("npo", BASE),
                        ("nporel", REL_BASE), ("npoprop", PROP_BASE), ("nporule", RULE_BASE),
                        ("nporef", REFDATA_BASE)):
        ET.register_namespace(prefix, uri)

    def qname(ns, local):
        return f"{{{ns}}}{local}"

    root = ET.Element(qname(RDF_NS, "RDF"))

    ontology_el = ET.SubElement(root, qname(RDF_NS, "Description"),
                                 {qname(RDF_NS, "about"): BASE.rstrip("/")})
    ET.SubElement(ontology_el, qname(RDF_NS, "type"),
                  {qname(RDF_NS, "resource"): OWL_NS + "Ontology"})
    ET.SubElement(ontology_el, qname(RDFS_NS, "label")).text = "CommonGood Atlas Grantmaking Ontology"
    ET.SubElement(ontology_el, qname(RDFS_NS, "comment")).text = ONTOLOGY_COMMENT
    ET.SubElement(ontology_el, qname(BASE, "version")).text = meta["version"]

    for c in concepts:
        desc = ET.SubElement(root, qname(RDF_NS, "Description"),
                              {qname(RDF_NS, "about"): str(concept_iri(c["id"]))})
        ET.SubElement(desc, qname(RDF_NS, "type"),
                      {qname(RDF_NS, "resource"): OWL_NS + "Class"})
        ET.SubElement(desc, qname(RDFS_NS, "label")).text = c["label"]
        ET.SubElement(desc, qname(SKOS_NS, "definition")).text = c["definition"]
        ET.SubElement(desc, qname(BASE, "category")).text = c["category"]
        ET.SubElement(desc, qname(RDFS_NS, "isDefinedBy"),
                      {qname(RDF_NS, "resource"): doc_url(c["docRef"])})
        for alias in sorted(c.get("aliases", [])):
            ET.SubElement(desc, qname(SKOS_NS, "altLabel")).text = alias
        if c.get("subClassOf"):
            ET.SubElement(desc, qname(RDFS_NS, "subClassOf"),
                          {qname(RDF_NS, "resource"): str(concept_iri(c["subClassOf"]))})
        if c.get("legalNote"):
            ET.SubElement(desc, qname(BASE, "legalNote")).text = c["legalNote"]
        if c.get("deprecated"):
            ET.SubElement(desc, qname(OWL_NS, "deprecated")).text = "true"

    relationships_by_id = {rel["id"]: rel for rel in relationships}
    for r in relationships:
        desc = ET.SubElement(root, qname(RDF_NS, "Description"),
                              {qname(RDF_NS, "about"): str(relation_iri(r["predicate"]))})
        ET.SubElement(desc, qname(RDF_NS, "type"),
                      {qname(RDF_NS, "resource"): OWL_NS + "ObjectProperty"})
        ET.SubElement(desc, qname(RDFS_NS, "label")).text = r["label"]
        ET.SubElement(desc, qname(RDFS_NS, "comment")).text = r["description"]
        ET.SubElement(desc, qname(RDFS_NS, "domain"),
                      {qname(RDF_NS, "resource"): str(concept_iri(r["subject"]))})
        ET.SubElement(desc, qname(RDFS_NS, "range"),
                      {qname(RDF_NS, "resource"): str(concept_iri(r["object"]))})
        ET.SubElement(desc, qname(RDFS_NS, "isDefinedBy"),
                      {qname(RDF_NS, "resource"): doc_url(r["docRef"])})
        if r.get("deprecated"):
            ET.SubElement(desc, qname(OWL_NS, "deprecated")).text = "true"
        if r.get("replacedBy"):
            replacement_predicate = relationships_by_id[r["replacedBy"]]["predicate"]
            ET.SubElement(desc, qname(DCTERMS_NS, "isReplacedBy"),
                          {qname(RDF_NS, "resource"): str(relation_iri(replacement_predicate))})

    for p in properties:
        desc = ET.SubElement(root, qname(RDF_NS, "Description"),
                              {qname(RDF_NS, "about"): str(property_iri(p["id"]))})
        ET.SubElement(desc, qname(RDFS_NS, "label")).text = p["label"]
        ET.SubElement(desc, qname(RDFS_NS, "comment")).text = p["description"]
        ET.SubElement(desc, qname(RDFS_NS, "domain"),
                      {qname(RDF_NS, "resource"): str(concept_iri(p["concept"]))})
        ET.SubElement(desc, qname(BASE, "group")).text = p["group"]
        ET.SubElement(desc, qname(BASE, "required")).text = str(p["required"]).lower()
        ET.SubElement(desc, qname(BASE, "cardinality")).text = p["cardinality"]
        if p["datatype"] == "reference":
            ET.SubElement(desc, qname(RDF_NS, "type"),
                          {qname(RDF_NS, "resource"): OWL_NS + "ObjectProperty"})
            ET.SubElement(desc, qname(RDFS_NS, "range"),
                          {qname(RDF_NS, "resource"): SKOS_NS + "Concept"})
            ET.SubElement(desc, qname(BASE, "referenceScheme"),
                          {qname(RDF_NS, "resource"): str(reference_scheme_iri(p["referenceScheme"]))})
        else:
            ET.SubElement(desc, qname(RDF_NS, "type"),
                          {qname(RDF_NS, "resource"): OWL_NS + "DatatypeProperty"})
            ET.SubElement(desc, qname(RDFS_NS, "range"),
                          {qname(RDF_NS, "resource"): str(DATATYPE_TO_XSD[p["datatype"]])})
            for value in p.get("allowedValues") or []:
                ET.SubElement(desc, qname(BASE, "allowedValue")).text = value

    for r in business_rules:
        desc = ET.SubElement(root, qname(RDF_NS, "Description"),
                              {qname(RDF_NS, "about"): str(rule_iri(r["id"]))})
        ET.SubElement(desc, qname(RDF_NS, "type"),
                      {qname(RDF_NS, "resource"): BASE + "BusinessRule"})
        ET.SubElement(desc, qname(RDFS_NS, "label")).text = r["label"]
        ET.SubElement(desc, qname(RDFS_NS, "comment")).text = r["description"]
        ET.SubElement(desc, qname(RDFS_NS, "isDefinedBy"),
                      {qname(RDF_NS, "resource"): doc_url(r["docRef"])})
        for cid in r["concepts"]:
            ET.SubElement(desc, qname(BASE, "appliesTo"),
                          {qname(RDF_NS, "resource"): str(concept_iri(cid))})

    schemes_by_id = {s["id"]: s for s in reference_data}
    publication_status_scheme = schemes_by_id["publication-status"]
    for s in reference_data:
        scheme_el = ET.SubElement(root, qname(RDF_NS, "Description"),
                                   {qname(RDF_NS, "about"): str(reference_scheme_iri(s["id"]))})
        ET.SubElement(scheme_el, qname(RDF_NS, "type"),
                      {qname(RDF_NS, "resource"): SKOS_NS + "ConceptScheme"})
        ET.SubElement(scheme_el, qname(SKOS_NS, "prefLabel")).text = s["label"]
        ET.SubElement(scheme_el, qname(SKOS_NS, "definition")).text = s["description"]
        ET.SubElement(scheme_el, qname(BASE, "schemeDomain")).text = s["domain"]
        ET.SubElement(scheme_el, qname(BASE, "authorityType")).text = s["authorityType"]
        ET.SubElement(scheme_el, qname(BASE, "version")).text = s["version"]
        ET.SubElement(scheme_el, qname(BASE, "publicationStatus"),
                      {qname(RDF_NS, "resource"): str(
                          reference_value_iri(publication_status_scheme, s["publicationStatus"]))})

        for v in s["values"]:
            v_el = ET.SubElement(root, qname(RDF_NS, "Description"),
                                  {qname(RDF_NS, "about"): str(NPOREF[v["id"]])})
            ET.SubElement(v_el, qname(RDF_NS, "type"),
                          {qname(RDF_NS, "resource"): SKOS_NS + "Concept"})
            ET.SubElement(v_el, qname(SKOS_NS, "inScheme"),
                          {qname(RDF_NS, "resource"): str(reference_scheme_iri(s["id"]))})
            ET.SubElement(v_el, qname(SKOS_NS, "notation")).text = v["code"]
            ET.SubElement(v_el, qname(SKOS_NS, "prefLabel")).text = v["label"]
            ET.SubElement(v_el, qname(SKOS_NS, "definition")).text = v["definition"]
            if v.get("deprecated"):
                ET.SubElement(v_el, qname(OWL_NS, "deprecated")).text = "true"
            if v.get("broader"):
                ET.SubElement(v_el, qname(SKOS_NS, "broader"),
                              {qname(RDF_NS, "resource"): str(NPOREF[v["broader"]])})
            if v.get("replacedBy"):
                ET.SubElement(v_el, qname(DCTERMS_NS, "isReplacedBy"),
                              {qname(RDF_NS, "resource"): str(NPOREF[v["replacedBy"]])})
            for m in v.get("mappings", []):
                ET.SubElement(v_el, qname(SKOS_NS, m["relation"]),
                              {qname(RDF_NS, "resource"): m["uri"]})

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    (OUT_DIR / "commongood-atlas.rdf").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n' + body + "\n"
    )


def jsonld_context() -> dict:
    context = {
        "@version": 1.1,
        "npo": BASE,
        "nporel": REL_BASE,
        "npoprop": PROP_BASE,
        "nporule": RULE_BASE,
        "nporef": REFDATA_BASE,
        "owl": "http://www.w3.org/2002/07/owl#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
        "skos": "http://www.w3.org/2004/02/skos/core#",
        "dcterms": DCTERMS_NS,
        "xsd": XSD_NS,
        "label": "rdfs:label",
        "definition": "skos:definition",
        "altLabel": "skos:altLabel",
        "prefLabel": "skos:prefLabel",
        "notation": "skos:notation",
        "category": "npo:category",
        "legalNote": "npo:legalNote",
        "comment": "rdfs:comment",
        "version": "npo:version",
        "group": "npo:group",
        "required": {"@id": "npo:required", "@type": "xsd:boolean"},
        "cardinality": "npo:cardinality",
        "allowedValues": "npo:allowedValue",
        "referenceScheme": {"@id": "npo:referenceScheme", "@type": "@id"},
        "schemeDomain": "npo:schemeDomain",
        "authorityType": "npo:authorityType",
        "publicationStatus": {"@id": "npo:publicationStatus", "@type": "@id"},
        "subClassOf": {"@id": "rdfs:subClassOf", "@type": "@id"},
        "domain": {"@id": "rdfs:domain", "@type": "@id"},
        "range": {"@id": "rdfs:range", "@type": "@id"},
        "isDefinedBy": {"@id": "rdfs:isDefinedBy", "@type": "@id"},
        "appliesTo": {"@id": "npo:appliesTo", "@type": "@id", "@container": "@set"},
        "inScheme": {"@id": "skos:inScheme", "@type": "@id"},
        "broader": {"@id": "skos:broader", "@type": "@id"},
        "deprecated": {"@id": "owl:deprecated", "@type": "xsd:boolean"},
        "isReplacedBy": {"@id": "dcterms:isReplacedBy", "@type": "@id"},
        "type": "@type",
        "id": "@id",
    }
    for relation in sorted(VALID_MAPPING_RELATIONS):
        context[relation] = {"@id": f"skos:{relation}", "@type": "@id", "@container": "@set"}
    return context


def write_jsonld(concepts, relationships, properties, business_rules, meta, reference_data):
    context = jsonld_context()
    (OUT_DIR / "context.jsonld").write_text(
        json.dumps({"@context": context}, indent=2, sort_keys=True) + "\n"
    )

    graph_nodes = [
        {
            "id": BASE.rstrip("/"),
            "type": "owl:Ontology",
            "label": "CommonGood Atlas Grantmaking Ontology",
            "comment": ONTOLOGY_COMMENT,
            "version": meta["version"],
        }
    ]

    for c in concepts:
        node = {
            "id": "npo:" + c["id"],
            "type": "owl:Class",
            "label": c["label"],
            "definition": c["definition"],
            "category": c["category"],
            "isDefinedBy": doc_url(c["docRef"]),
        }
        if c.get("aliases"):
            node["altLabel"] = sorted(c["aliases"])
        if c.get("subClassOf"):
            node["subClassOf"] = "npo:" + c["subClassOf"]
        if c.get("legalNote"):
            node["legalNote"] = c["legalNote"]
        if c.get("deprecated"):
            node["deprecated"] = True
        graph_nodes.append(node)

    relationships_by_id = {rel["id"]: rel for rel in relationships}
    for r in relationships:
        node = {
            "id": "nporel:" + r["predicate"],
            "type": "owl:ObjectProperty",
            "label": r["label"],
            "comment": r["description"],
            "domain": "npo:" + r["subject"],
            "range": "npo:" + r["object"],
            "isDefinedBy": doc_url(r["docRef"]),
        }
        if r.get("deprecated"):
            node["deprecated"] = True
        if r.get("replacedBy"):
            replacement_predicate = relationships_by_id[r["replacedBy"]]["predicate"]
            node["isReplacedBy"] = "nporel:" + replacement_predicate
        graph_nodes.append(node)

    for p in properties:
        node = {
            "id": "npoprop:" + p["id"],
            "label": p["label"],
            "comment": p["description"],
            "domain": "npo:" + p["concept"],
            "group": p["group"],
            "required": p["required"],
            "cardinality": p["cardinality"],
        }
        if p["datatype"] == "reference":
            node["type"] = "owl:ObjectProperty"
            node["range"] = "skos:Concept"
            node["referenceScheme"] = "nporef:" + p["referenceScheme"]
        else:
            node["type"] = "owl:DatatypeProperty"
            node["range"] = "xsd:" + DATATYPE_TO_XSD[p["datatype"]].rsplit("#", 1)[-1]
            if p.get("allowedValues"):
                node["allowedValues"] = p["allowedValues"]
        graph_nodes.append(node)

    for r in business_rules:
        graph_nodes.append({
            "id": "nporule:" + r["id"],
            "type": "npo:BusinessRule",
            "label": r["label"],
            "comment": r["description"],
            "isDefinedBy": doc_url(r["docRef"]),
            "appliesTo": ["npo:" + cid for cid in r["concepts"]],
        })

    schemes_by_id = {s["id"]: s for s in reference_data}
    publication_status_scheme = schemes_by_id["publication-status"]
    for s in reference_data:
        graph_nodes.append({
            "id": "nporef:" + s["id"],
            "type": "skos:ConceptScheme",
            "prefLabel": s["label"],
            "definition": s["description"],
            "schemeDomain": s["domain"],
            "authorityType": s["authorityType"],
            "version": s["version"],
            "publicationStatus": "nporef:" + reference_value_id(publication_status_scheme, s["publicationStatus"]),
        })
        for v in s["values"]:
            node = {
                "id": "nporef:" + v["id"],
                "type": "skos:Concept",
                "inScheme": "nporef:" + s["id"],
                "notation": v["code"],
                "prefLabel": v["label"],
                "definition": v["definition"],
            }
            if v.get("deprecated"):
                node["deprecated"] = True
            if v.get("broader"):
                node["broader"] = "nporef:" + v["broader"]
            if v.get("replacedBy"):
                node["isReplacedBy"] = "nporef:" + v["replacedBy"]
            by_relation: dict[str, list[str]] = {}
            for m in v.get("mappings", []):
                by_relation.setdefault(m["relation"], []).append(m["uri"])
            for relation, uris in by_relation.items():
                node[relation] = uris
            graph_nodes.append(node)

    document = {"@context": context, "@graph": graph_nodes}
    (OUT_DIR / "commongood-atlas.jsonld").write_text(
        json.dumps(document, indent=2) + "\n"
    )


def main():
    concepts, relationships, properties, business_rules, meta, example, reference_data = load_source()

    g = build_graph(concepts, relationships, properties, business_rules, meta, reference_data)
    write_turtle_and_ntriples(g)
    write_rdf_xml(concepts, relationships, properties, business_rules, meta, reference_data)
    write_jsonld(concepts, relationships, properties, business_rules, meta, reference_data)

    write_property_shapes(properties)

    example_graph = build_example_graph(example, concepts, properties, reference_data)
    write_example_ttl_and_nt(example_graph)
    write_example_jsonld(example, concepts, properties, reference_data)

    value_count = sum(len(s["values"]) for s in reference_data)
    print(f"Generated ontology from {len(concepts)} concepts, "
          f"{len(relationships)} relationships, {len(properties)} properties, "
          f"{len(business_rules)} business rules, {len(reference_data)} reference-data "
          f"schemes ({value_count} values), and a {len(example['individuals'])}-step worked example.")
    for name in ("commongood-atlas.ttl", "commongood-atlas.rdf", "commongood-atlas.nt", "context.jsonld",
                 "commongood-atlas.jsonld", "commongood-atlas.property-shapes.ttl",
                 "commongood-atlas.example.ttl", "commongood-atlas.example.nt", "commongood-atlas.example.jsonld"):
        print(f"  ontology/{name}")


if __name__ == "__main__":
    main()
