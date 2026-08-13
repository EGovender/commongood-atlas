import { drag as d3drag } from 'd3-drag';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { select, type Selection } from 'd3-selection';
import 'd3-transition'; // augments Selection with .transition() (used for smooth pan/zoom)
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CATEGORIES, getCategory } from '../data/categories';
import { EXPLORER_VIEWS, resolveLifecycleView } from '../data/explorer-views';
import { findShortestPath, seededGridPositions, type PathStep } from '../data/graph-utils';
import { conceptKind, KIND_LEGEND, kindSwatchColor } from '../data/graph-kinds';
import { nodeShapePath } from '../data/graph-shapes';
import { RELATIONSHIP_KIND_LABELS, relationshipKind, type RelationshipKind } from '../data/relationship-kinds';
import { conceptSearchScore } from '../data/search';
import { exportSvgAsPng } from '../data/svg-export';
import {
  concepts as allConcepts,
  relationships as allRelationships,
  getBusinessRulesForConcept,
  getConcept,
  getIncomingRelationships,
  getOutgoingRelationships,
  getPropertyGroups,
  getSubtypes,
  type ConceptKind,
} from '../data/ontology';
import PropertyInspector from './PropertyInspector';

const NODE_SIZE = 18;
const FOCUS_SIZE = 26;
const ARROW_GAP = 6;
const LINK_DISTANCE = 125;
const CHARGE_STRENGTH = -170;

// A sparse neighborhood (often just the focus concept + one or two others)
// has a tiny point-bounds box, so the general 2.5x fit cap used elsewhere
// zooms in far past what the fixed node/label sizes can afford -- labels
// and even whole neighbor nodes end up rendered outside the fitted frame.
// A much lower cap plus extra padding keeps the mini widget's zoom modest
// regardless of how few neighbors a concept has.
const MINI_FIT_PADDING = 50;
const MINI_FIT_MAX_SCALE = 1.3;

// Every kind starts visible (opt-out, not opt-in) -- a filter that silently
// hides ~40% of the ontology with no visible indicator is worse than a
// denser first view. All filtering is one click away via the Kind chips in
// the always-open-by-default Filters panel, and the "N of M concepts shown"
// indicator below makes it obvious when something IS hidden.
const DEFAULT_HIDDEN_KINDS: ConceptKind[] = [];

// Grant Lifecycle, not Full Ontology, is the beginner-friendly landing view --
// the homepage now routes first-time visitors straight into /explore, and
// the full 71-concept graph is the wrong first thing to show them.
const DEFAULT_VIEW_ID = 'lifecycle';

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  category: string;
  kind: ConceptKind;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string;
  label: string;
  relKind: RelationshipKind;
  isSubclass: boolean;
}

function endpoint(n: string | number | SimNode): SimNode {
  return n as SimNode;
}

interface GraphHandle {
  simulation: Simulation<SimNode, SimLink>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  nodeSel: Selection<SVGGElement, SimNode, SVGGElement, unknown>;
  edgeSel: Selection<SVGLineElement, SimLink, SVGGElement, unknown>;
  edgeLabelSel: Selection<SVGTextElement, SimLink, SVGGElement, unknown>;
  nodesById: Map<string, SimNode>;
  links: SimLink[];
}

interface Props {
  base: string;
  /** 'full' (default): sidebar + canvas + property inspector, used on /explore.
   *  'mini' canvas only, scoped to one concept's neighborhood, used embedded
   *  on a concept's own page -- clicking a neighbor navigates to its page. */
  mode?: 'full' | 'mini';
  /** Required in mini mode: which concept to center the neighborhood on. */
  focusConceptId?: string;
}

/** Reads ?view=&concept=&q=&concepts= once on mount; full-mode only. */
function readInitialURLState() {
  if (typeof window === 'undefined') {
    return { view: null as string | null, concept: null as string | null, q: '', customConcepts: null as string[] | null };
  }
  const params = new URLSearchParams(window.location.search);
  const customConcepts = params.get('concepts');
  return {
    // null (no ?view= param), not a default view id, so callers can tell
    // "not specified" apart from an explicit "?view=<the default view>".
    view: params.get('view'),
    concept: params.get('concept'),
    q: params.get('q') ?? '',
    // An ad-hoc concept allowlist (e.g. from the Design tool's "open in
    // graph"), distinct from the named views in explorer-views.ts -- takes
    // priority over `view` when present.
    customConcepts: customConcepts ? customConcepts.split(',').filter(Boolean) : null,
  };
}

/**
 * Computes visible-node bounding box (optionally filtered by `predicate`)
 * and animates the zoom transform to fit it, centered, in the SVG's current
 * viewport size. Standalone (not a GraphHandle method) since it's called
 * from several places -- the fit control button, path-find, search-result
 * click, resize-on-show, and fullscreen toggle.
 */
function fitToBounds(
  handle: GraphHandle,
  svgEl: SVGSVGElement,
  predicate?: (d: SimNode) => boolean,
  padding = 30,
  maxScale = 2.5
) {
  const nodes = Array.from(handle.nodesById.values()).filter((n) => !predicate || predicate(n));
  if (nodes.length === 0) return;
  const xs = nodes.map((n) => n.x ?? 0);
  const ys = nodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const rect = svgEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    // A small (e.g. mini-mode) graph can settle and fire the simulation's
    // one-shot 'end' event before its embedding container has completed its
    // first real layout pass, momentarily reporting a zero-size rect --
    // retry on the next frame rather than silently giving up the only fit
    // this graph will ever get.
    requestAnimationFrame(() => fitToBounds(handle, svgEl, predicate, padding, maxScale));
    return;
  }
  const scale = Math.min((rect.width - padding * 2) / bw, (rect.height - padding * 2) / bh, maxScale);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const transform = zoomIdentity
    .translate(rect.width / 2, rect.height / 2)
    .scale(Math.max(scale, 0.05))
    .translate(-cx, -cy);
  select(svgEl).transition().duration(200).call(handle.zoomBehavior.transform, transform);
}

/**
 * Mini-mode-only variant of fitToBounds: centers on the focus concept
 * (pinned at the origin via fx/fy) instead of the neighbors' bounding-box
 * midpoint. A neighborhood's neighbors rarely spread evenly in every
 * direction, so centering on their bbox -- as fitToBounds does -- tends to
 * push the focus node itself toward one edge, sometimes right behind the
 * zoom-control overlay. Centering on the origin keeps the focus node
 * (what this widget exists to show) dead-center every time.
 */
function fitMiniToFocus(handle: GraphHandle, svgEl: SVGSVGElement, padding: number, maxScale: number) {
  const nodes = Array.from(handle.nodesById.values());
  if (nodes.length === 0) return;
  const halfW = Math.max(...nodes.map((n) => Math.abs(n.x ?? 0)), 1);
  const halfH = Math.max(...nodes.map((n) => Math.abs(n.y ?? 0)), 1);
  const rect = svgEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => fitMiniToFocus(handle, svgEl, padding, maxScale));
    return;
  }
  const scale = Math.min((rect.width - padding * 2) / (halfW * 2), (rect.height - padding * 2) / (halfH * 2), maxScale);
  const transform = zoomIdentity.translate(rect.width / 2, rect.height / 2).scale(Math.max(scale, 0.05));
  select(svgEl).transition().duration(200).call(handle.zoomBehavior.transform, transform);
}

export default function GraphExplorer({ base, mode = 'full', focusConceptId }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphHandle | null>(null);
  const isMini = mode === 'mini';

  // All of these start at their SSR-safe defaults, matching the
  // server-rendered HTML, rather than reading the URL eagerly in the
  // initializer -- doing that would make the client's first render disagree
  // with the SSR-ed markup (view/concept/search/custom-selection would
  // already reflect the URL on the client but not on the server) and
  // trigger a React hydration-mismatch, discarding and re-rendering the
  // whole tree. Restored after mount instead, in the effect below.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<ConceptKind>>(
    () => new Set(isMini ? [] : DEFAULT_HIDDEN_KINDS)
  );
  const [hiddenRelationshipKinds, setHiddenRelationshipKinds] = useState<Set<RelationshipKind>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(isMini);
  const [viewId, setViewId] = useState<string>(DEFAULT_VIEW_ID);
  const [customConceptIds, setCustomConceptIds] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pathFromId, setPathFromId] = useState('');
  const [pathToId, setPathToId] = useState('');
  const [pathResult, setPathResult] = useState<PathStep[] | null | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (isMini) return;
    const url = readInitialURLState();
    if (url.customConcepts) setCustomConceptIds(new Set(url.customConcepts));
    if (url.view) setViewId(url.view);
    if (url.concept) setSelectedId(url.concept);
    if (url.q) setSearchQuery(url.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini]);

  // Switching views starts every kind visible again, same as the initial
  // load -- a filter carried over from a different dataset would be exactly
  // the kind of silent hiding this component now deliberately avoids.
  useEffect(() => {
    if (isMini) return;
    setHiddenKinds(new Set(DEFAULT_HIDDEN_KINDS));
  }, [isMini, viewId]);

  const conceptsById = useMemo(() => new Map(allConcepts.map((c) => [c.id, c])), []);

  // The active view's concept allowlist, or null for "no filter" (Full Ontology).
  // A custom ad-hoc list (from the Design tool) always wins over the named views.
  const viewConceptIds = useMemo(() => {
    if (isMini) return null;
    if (customConceptIds) return customConceptIds;
    if (viewId === 'lifecycle') {
      return new Set(resolveLifecycleView(allConcepts.map((c) => c.id)));
    }
    const view = EXPLORER_VIEWS.find((v) => v.id === viewId);
    return view?.conceptIds ? new Set(view.conceptIds) : null;
  }, [isMini, viewId, customConceptIds]);

  const { concepts, relationships } = useMemo(() => {
    if (isMini && focusConceptId) {
      const neighborIds = new Set<string>([focusConceptId]);
      for (const r of allRelationships) {
        if (r.subject === focusConceptId) neighborIds.add(r.object);
        if (r.object === focusConceptId) neighborIds.add(r.subject);
      }
      const focus = conceptsById.get(focusConceptId);
      if (focus?.subClassOf) neighborIds.add(focus.subClassOf);
      for (const c of allConcepts) {
        if (c.subClassOf === focusConceptId) neighborIds.add(c.id);
      }
      return {
        concepts: allConcepts.filter((c) => neighborIds.has(c.id)),
        relationships: allRelationships.filter(
          (r) => neighborIds.has(r.subject) && neighborIds.has(r.object)
        ),
      };
    }
    if (!viewConceptIds) return { concepts: allConcepts, relationships: allRelationships };
    return {
      concepts: allConcepts.filter((c) => viewConceptIds.has(c.id)),
      relationships: allRelationships.filter(
        (r) => viewConceptIds.has(r.subject) && viewConceptIds.has(r.object)
      ),
    };
  }, [isMini, focusConceptId, conceptsById, viewConceptIds]);

  // Keep the URL in sync with view/concept/search so the current state is
  // shareable and survives a reload -- full mode only, replacing (not
  // pushing) history so filtering doesn't spam the back button. Kind and
  // relationship-type filters are session-only, matching how the category
  // filter already isn't URL-persisted either.
  useEffect(() => {
    if (isMini || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (customConceptIds) {
      params.set('concepts', Array.from(customConceptIds).join(','));
    } else if (viewId !== DEFAULT_VIEW_ID) {
      params.set('view', viewId);
    }
    if (selectedId) params.set('concept', selectedId);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [isMini, viewId, customConceptIds, selectedId, searchQuery]);

  // The two kinds of edges GraphExplorer synthesizes itself rather than
  // reading literally from relationships.json: subClassOf "is a" edges, and
  // -- for concepts with NO literal relationship of their own -- their
  // ancestor-inherited relationships (the same ones a concept's own
  // Connections tab already shows via getOutgoingRelationships/
  // getIncomingRelationships, which are ancestor-aware; this canvas
  // previously wasn't, which is why e.g. Vendor/Partner/Sponsoring
  // Organization looked disconnected here despite having real connections).
  // Scoped to zero-literal-relationship concepts deliberately: drawing
  // inherited edges for every concept would nearly double total edge count
  // and badly clutter already-well-connected hub concepts like Organization.
  // Hoisted into its own memo (rather than computed inline in the D3 effect
  // below) so the relationship-kind filter-chip counts further down can
  // count these same synthesized edges too, instead of only literal rows --
  // which is also why the existing "Structural (is a)" filter chip has
  // never appeared until now, despite subclass edges rendering since this
  // component shipped.
  const synthesizedLinks = useMemo(() => {
    const conceptIds = new Set(concepts.map((c) => c.id));
    const ownRelationshipConceptIds = new Set<string>();
    for (const r of relationships) {
      ownRelationshipConceptIds.add(r.subject);
      ownRelationshipConceptIds.add(r.object);
    }

    const structural: SimLink[] = concepts
      .filter((c) => c.subClassOf && neighborHas(concepts, c.subClassOf))
      .map((c) => ({
        id: `${c.id}-subclass-of`,
        source: c.id,
        target: c.subClassOf as string,
        label: 'is a',
        relKind: 'structural' as RelationshipKind,
        isSubclass: true,
      }));

    const inherited: SimLink[] = concepts
      .filter((c) => !ownRelationshipConceptIds.has(c.id))
      .flatMap((c) => {
        const outgoing = getOutgoingRelationships(c.id)
          .filter(({ relationship: r }) => r.subject !== c.id && conceptIds.has(r.object))
          .map(({ relationship: r }) => ({
            id: `${c.id}-inherited-out-${r.id}`,
            source: c.id,
            target: r.object,
            label: r.label,
            relKind: 'inherited' as RelationshipKind,
            isSubclass: false,
          }));
        const incoming = getIncomingRelationships(c.id)
          .filter(({ relationship: r }) => r.object !== c.id && conceptIds.has(r.subject))
          .map(({ relationship: r }) => ({
            id: `${c.id}-inherited-in-${r.id}`,
            source: r.subject,
            target: c.id,
            label: r.label,
            relKind: 'inherited' as RelationshipKind,
            isSubclass: false,
          }));
        return [...outgoing, ...incoming];
      });

    return [...structural, ...inherited];
  }, [concepts, relationships]);

  // Build the graph once (or whenever the underlying element set changes).
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const nodes: SimNode[] = concepts.map((c) => ({
      id: c.id,
      label: c.label,
      category: c.category,
      kind: conceptKind(c),
    }));
    const seeded = seededGridPositions(nodes.map((n) => n.id));
    for (const n of nodes) {
      const pos = seeded.get(n.id)!;
      n.x = pos.x;
      n.y = pos.y;
    }
    if (isMini && focusConceptId) {
      const focus = nodes.find((n) => n.id === focusConceptId);
      if (focus) {
        focus.fx = 0;
        focus.fy = 0;
        focus.x = 0;
        focus.y = 0;
      }
    }

    const links: SimLink[] = [
      ...relationships.map((r) => ({
        id: r.id,
        source: r.subject,
        target: r.object,
        label: r.label,
        relKind: relationshipKind(r.predicate),
        isSubclass: false,
      })),
      ...synthesizedLinks,
    ];

    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'graph-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('class', 'graph-arrowhead');

    const viewport = svg.append('g').attr('class', 'graph-viewport');
    const edgeLayer = viewport.append('g').attr('class', 'graph-edges');
    const edgeLabelLayer = viewport.append('g').attr('class', 'graph-edge-labels');
    const nodeLayer = viewport.append('g').attr('class', 'graph-nodes');

    const simulation = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
      )
      // distanceMax caps how far apart two nodes still repel each other --
      // without it, a sparsely-linked node (common here: many concepts have
      // just one relationship) gets pushed outward by the cumulative pull
      // of all 55 *other* nodes with nothing strong enough to reel it back
      // in, and the whole layout drifts apart indefinitely instead of
      // settling.
      .force('charge', forceManyBody().strength(CHARGE_STRENGTH).distanceMax(440))
      .force('collide', forceCollide(NODE_SIZE / 2 + 18));

    if (isMini) {
      simulation.force(
        'radial',
        forceRadial(90, 0, 0).strength((d) => (d as SimNode).id === focusConceptId ? 0 : 0.9)
      );
    } else {
      // forceCenter alone only recenters the *average* position each tick --
      // it doesn't pull individual nodes back, so it can't stop the drift
      // above on its own. A weak per-node pull toward the origin is a real
      // restoring force and keeps the settled layout compact.
      simulation.force('x', forceX(0).strength(0.05));
      simulation.force('y', forceY(0).strength(0.05));
    }

    const edgeSel = edgeLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links, (d) => d.id)
      .join('line')
      .attr(
        'class',
        (d) => `graph-edge${d.isSubclass ? ' subclass-edge' : ''}${d.relKind === 'inherited' ? ' inherited-edge' : ''}`
      )
      .attr('data-rel-kind', (d) => d.relKind)
      .attr('marker-end', 'url(#graph-arrow)');

    const edgeLabelSel = edgeLabelLayer
      .selectAll<SVGTextElement, SimLink>('text')
      .data(links, (d) => d.id)
      .join('text')
      .attr('class', 'graph-edge-label')
      .attr('text-anchor', 'middle')
      .text((d) => d.label);

    // A relationship's label only earns its keep when you're actually
    // looking at that relationship -- showing every label at once (the old
    // "Show all relationship labels" behavior) buries the graph in
    // overlapping text. Hovering an edge reveals just its own label; the
    // toolbar toggle (showEdgeLabels) is still available for an "all at
    // once" view when that's genuinely what's wanted.
    edgeSel
      .on('mouseenter', function (_event, d) {
        edgeLabelSel.filter((l) => l.id === d.id).classed('hover-visible', true);
      })
      .on('mouseleave', function (_event, d) {
        edgeLabelSel.filter((l) => l.id === d.id).classed('hover-visible', false);
      });

    const dragBehavior = d3drag<SVGGElement, SimNode>()
      .clickDistance(6)
      .on('start', (event) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event) => {
        if (!event.active) simulation.alphaTarget(0);
        // fx/fy stay set -- the node stays exactly where it was dropped.
      });

    const nodeSel = nodeLayer
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', (d) => `graph-node${isMini && d.id === focusConceptId ? ' focus' : ''}`)
      .attr('data-kind', (d) => d.kind)
      .attr('data-category', (d) => d.category)
      .call(dragBehavior);

    nodeSel
      .append('path')
      .attr('class', 'graph-node-shape')
      .attr('d', (d) => nodeShapePath(d.kind, isMini && d.id === focusConceptId ? FOCUS_SIZE : NODE_SIZE))
      .style('fill', (d) => {
        const cat = getCategory(d.category);
        return `light-dark(${cat.colorLight}, ${cat.colorDark})`;
      });

    nodeSel
      .append('text')
      .attr('class', 'graph-node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (isMini && d.id === focusConceptId ? FOCUS_SIZE : NODE_SIZE) / 2 + 12)
      .text((d) => d.label);

    if (isMini && focusConceptId) {
      nodeSel.on('click', (_event, d) => {
        if (d.id !== focusConceptId) window.location.href = `${base}concepts/${d.id}`;
      });
    } else {
      nodeSel.on('click', (_event, d) => {
        setPathResult(undefined);
        setSearchQuery('');
        setSelectedId(d.id);
      });
      svg.on('click', (event: MouseEvent) => {
        if (event.target === svgEl) setSelectedId(null);
      });
    }

    function ticked() {
      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      edgeSel.each(function (d) {
        const s = endpoint(d.source);
        const t = endpoint(d.target);
        const sx = s.x ?? 0;
        const sy = s.y ?? 0;
        const tx = t.x ?? 0;
        const ty = t.y ?? 0;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const sr = (isMini && s.id === focusConceptId ? FOCUS_SIZE : NODE_SIZE) / 2;
        const tr = (isMini && t.id === focusConceptId ? FOCUS_SIZE : NODE_SIZE) / 2 + ARROW_GAP;
        select(this)
          .attr('x1', sx + ux * sr)
          .attr('y1', sy + uy * sr)
          .attr('x2', tx - ux * tr)
          .attr('y2', ty - uy * tr);
      });
      edgeLabelSel
        .attr('x', (d) => ((endpoint(d.source).x ?? 0) + (endpoint(d.target).x ?? 0)) / 2)
        .attr('y', (d) => ((endpoint(d.source).y ?? 0) + (endpoint(d.target).y ?? 0)) / 2);
    }
    simulation.on('tick', ticked);

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 2.5])
      // Without this, a mousedown that starts on a node bubbles up and
      // zoom's own pan-drag claims it before the node's d3.drag ever gets
      // a chance -- the whole graph pans instead of the node moving. Wheel
      // events are exempt so scrolling to zoom still works with the cursor
      // over a node.
      .filter((event) => event.type === 'wheel' || !(event.target as Element).closest('.graph-node'))
      .on('zoom', (event) => viewport.attr('transform', event.transform.toString()));
    svg.call(zoomBehavior);

    graphRef.current = {
      simulation,
      zoomBehavior,
      nodeSel,
      edgeSel,
      edgeLabelSel,
      nodesById: new Map(nodes.map((n) => [n.id, n])),
      links,
    };

    // Fit immediately using the seeded starting positions, before the
    // simulation has run a single tick -- guarantees the graph is framed
    // reasonably from the very first paint instead of depending on the
    // simulation's one-shot 'end' event, which fires on its own schedule
    // (and, for a small/fast-converging graph, can fire before the
    // embedding container has even completed its first layout pass).
    if (isMini) {
      fitMiniToFocus(graphRef.current, svgEl, MINI_FIT_PADDING, MINI_FIT_MAX_SCALE);
    } else {
      fitToBounds(graphRef.current, svgEl);
    }

    // Once the layout has actually settled, fit again to the *real* result
    // -- the seeded grid start positions above are not laid out to fill the
    // viewport, so the immediate fit above is only ever a rough placeholder.
    // Only once, though: dragging a node briefly reheats the simulation
    // (see the drag handlers below), and re-fitting every time that reheat
    // cools back down would yank the view out from under the user right
    // after they let go of a node.
    let hasAutoFitted = false;
    function fitToSettledLayout() {
      if (hasAutoFitted) return;
      hasAutoFitted = true;
      if (isMini) {
        fitMiniToFocus(graphRef.current!, svgEl!, MINI_FIT_PADDING, MINI_FIT_MAX_SCALE);
      } else {
        fitToBounds(graphRef.current!, svgEl!);
      }
    }
    simulation.on('end', fitToSettledLayout);
    // Backstop: a throttled tab (e.g. backgrounded during load) can delay
    // requestAnimationFrame enough that 'end' takes far longer than usual to
    // fire. Don't leave the graph on the rough placeholder fit indefinitely
    // waiting for it -- fit to wherever things are after a bounded wait
    // either way.
    const initialFitTimeout = setTimeout(fitToSettledLayout, 2500);

    // Apply whatever filter/selection/search/path state is already active
    // (e.g. restored from the URL after mount, or simply left over from
    // before a rebuild triggered by switching views) now that the graph
    // exists to apply it to -- a freshly built graph has no classes on it
    // yet regardless of what React state already says, and without this the
    // filters/highlight visibly reset every time the concept/relationship
    // set changes.
    applyFilters();
    applyHighlight();

    return () => {
      clearTimeout(initialFitTimeout);
      simulation.stop();
      svg.on('.zoom', null);
      svg.selectAll('*').remove();
      graphRef.current = null;
    };
    // Rebuild only when the underlying data changes; filters/highlighting
    // are handled by their own effects below (and reapplied synchronously
    // above right after every rebuild).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, relationships, synthesizedLinks, isMini, focusConceptId]);

  // Applies the category, kind, and relationship-type filters -- hides
  // nodes whose category or kind is unchecked, and hides edges whose
  // relationship-type bucket is unchecked OR whose subject/object is
  // itself hidden (avoiding dangling edge stubs pointing at invisible
  // nodes).
  function applyFilters() {
    const handle = graphRef.current;
    if (!handle) return;
    const hiddenNodeIds = new Set<string>();
    for (const n of handle.nodesById.values()) {
      if (hiddenCategories.has(n.category) || hiddenKinds.has(n.kind)) hiddenNodeIds.add(n.id);
    }
    handle.nodeSel.classed('node-hidden', (d) => hiddenNodeIds.has(d.id));
    const edgeHidden = (d: SimLink) => {
      const s = endpoint(d.source).id;
      const t = endpoint(d.target).id;
      return hiddenNodeIds.has(s) || hiddenNodeIds.has(t) || hiddenRelationshipKinds.has(d.relKind);
    };
    handle.edgeSel.classed('edge-hidden', edgeHidden);
    handle.edgeLabelSel.classed('edge-hidden', edgeHidden);
  }

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenCategories, hiddenKinds, hiddenRelationshipKinds]);

  // Applies whichever of path-find / search / plain selection is active, in
  // that priority order, to the current graph. This is the ONLY place that
  // touches the selected/connected/faded/path-edge classes -- see the
  // matching comment in the Cytoscape-era version of this component for why
  // that consolidation matters (a same-commit race between several
  // independent effects each deciding the outcome from their own stale
  // closures). Also decides edge-label visibility, since that's driven by
  // the exact same connected/path/selection state.
  function applyHighlight() {
    const handle = graphRef.current;
    if (!handle) return;
    // Mini mode has no path-find/search/selection state to reconcile (a
    // click there navigates away instead of selecting) -- it only needs
    // the plain labels toggle applied, which the full-mode logic below
    // would otherwise never reach since it always returns before getting
    // there.
    if (isMini) {
      handle.edgeLabelSel.classed('visible', showEdgeLabels);
      return;
    }
    const { nodeSel, edgeSel, edgeLabelSel } = handle;
    nodeSel.classed('selected', false).classed('connected', false).classed('faded', false);
    edgeSel.classed('connected', false).classed('faded', false).classed('path-edge', false);
    edgeLabelSel.classed('visible', false).classed('path-edge', false);

    const path = pathResult;
    if (path && path.length > 0) {
      const nodeIds = new Set<string>([path[0].fromId, ...path.map((s) => s.toId)]);
      const pathEdgeIds = new Set(
        handle.links
          .filter((l) =>
            path.some(
              (step) =>
                (endpoint(l.source).id === step.fromId && endpoint(l.target).id === step.toId) ||
                (endpoint(l.source).id === step.toId && endpoint(l.target).id === step.fromId)
            )
          )
          .map((l) => l.id)
      );
      nodeSel.classed('connected', (d) => nodeIds.has(d.id));
      nodeSel.classed('faded', (d) => !nodeIds.has(d.id));
      edgeSel.classed('path-edge connected', (d) => pathEdgeIds.has(d.id));
      edgeSel.classed('faded', (d) => !pathEdgeIds.has(d.id));
      edgeLabelSel.classed('visible path-edge', (d) => pathEdgeIds.has(d.id));
      fitToBounds(handle, svgRef.current!, (n) => nodeIds.has(n.id), 40);
    } else {
      const query = searchQuery.trim();
      if (query) {
        const matchIds = new Set(
          concepts.filter((c) => conceptSearchScore(c, query) > 0).map((c) => c.id)
        );
        if (matchIds.size === 0) {
          nodeSel.classed('faded', true);
          edgeSel.classed('faded', true);
        } else {
          nodeSel.classed('connected', (d) => matchIds.has(d.id));
          nodeSel.classed('faded', (d) => !matchIds.has(d.id));
          // Matches the Cytoscape-era behavior: search dims every edge
          // uniformly (only matching nodes are highlighted), it doesn't
          // trace connections between matches.
          edgeSel.classed('faded', true);
        }
      } else if (selectedId && handle.nodesById.has(selectedId)) {
        const neighborIds = new Set<string>([selectedId]);
        const incidentEdgeIds = new Set<string>();
        for (const l of handle.links) {
          const s = endpoint(l.source).id;
          const t = endpoint(l.target).id;
          if (s === selectedId || t === selectedId) {
            incidentEdgeIds.add(l.id);
            neighborIds.add(s);
            neighborIds.add(t);
          }
        }
        nodeSel.classed('selected', (d) => d.id === selectedId);
        nodeSel.classed('connected', (d) => neighborIds.has(d.id));
        nodeSel.classed('faded', (d) => !neighborIds.has(d.id));
        edgeSel.classed('connected', (d) => incidentEdgeIds.has(d.id));
        edgeSel.classed('faded', (d) => !incidentEdgeIds.has(d.id));
        edgeLabelSel.classed('visible', (d) => incidentEdgeIds.has(d.id));
      }
    }

    if (showEdgeLabels) edgeLabelSel.classed('visible', true);
  }

  useEffect(() => {
    applyHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, searchQuery, pathResult, isMini, showEdgeLabels]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || isMini) return [];
    return concepts
      .map((c) => ({ concept: c, score: conceptSearchScore(c, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.concept);
  }, [concepts, searchQuery, isMini]);

  // The canvas and the list-view alternative both stay mounted permanently
  // (toggled with the `hidden` attribute, not conditional rendering) so the
  // simulation is never destroyed/orphaned by switching views -- but a
  // canvas that was hidden (display:none) reports zero size, so it needs an
  // explicit re-fit once it becomes visible again. Skips the very first run
  // (mount): the build effect's own simulation 'end' handler already does
  // the initial fit once the layout has actually settled, and firing this
  // one too on mount would re-fit to the raw, not-yet-simulated seeded grid
  // positions instead.
  const skippedInitialResizeFit = useRef(false);
  useEffect(() => {
    if (isMini || showList) return;
    if (!skippedInitialResizeFit.current) {
      skippedInitialResizeFit.current = true;
      return;
    }
    const id = setTimeout(() => fitToView(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini, showList]);

  // Fullscreen: track native fullscreen state and re-fit once the
  // container's dimensions actually change.
  useEffect(() => {
    if (isMini) return;
    const handler = () => {
      const active = document.fullscreenElement === wrapRef.current;
      setIsFullscreen(active);
      setTimeout(() => fitToView(), 50);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini]);

  // No resize handling existed before the sidebar/inspector workspace
  // layout -- the graph only ever re-fit on explicit user actions (the fit
  // button, a search-result click, path-find, initial load). Now that the
  // canvas's own container can change size without the window resizing at
  // all (the sidebar <details> collapsing, or the inspector opening/
  // closing), re-fit automatically whenever that happens.
  useEffect(() => {
    if (isMini || showList || typeof ResizeObserver === 'undefined') return;
    const el = wrapRef.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitToView());
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini, showList]);

  function toggleCategory(id: string) {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleKind(kind: ConceptKind) {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function toggleRelationshipKind(kind: RelationshipKind) {
    setHiddenRelationshipKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  /** Clears every filter that can make a node silently disappear (view,
   * category/kind/relationship-type hides, search, path-find) so a
   * confused "where did my node go" moment always has a one-click way out,
   * without touching an ad-hoc Design-tool selection (customConceptIds),
   * which isn't a filter someone is trying to back out of. */
  function resetFilters() {
    setHiddenCategories(new Set());
    setHiddenKinds(new Set(DEFAULT_HIDDEN_KINDS));
    setHiddenRelationshipKinds(new Set());
    setSearchQuery('');
    setPathFromId('');
    setPathToId('');
    setPathResult(undefined);
    if (!customConceptIds) setViewId(DEFAULT_VIEW_ID);
  }

  function zoomBy(factor: number) {
    const handle = graphRef.current;
    const svgEl = svgRef.current;
    if (!handle || !svgEl) return;
    select(svgEl).transition().duration(150).call(handle.zoomBehavior.scaleBy, factor);
  }

  function fitToView() {
    const handle = graphRef.current;
    const svgEl = svgRef.current;
    if (!handle || !svgEl) return;
    if (isMini) {
      fitMiniToFocus(handle, svgEl, MINI_FIT_PADDING, MINI_FIT_MAX_SCALE);
    } else {
      fitToBounds(handle, svgEl);
    }
  }

  function fitToNeighborhood(conceptId: string) {
    const handle = graphRef.current;
    const svgEl = svgRef.current;
    if (!handle || !svgEl) return;
    const neighborIds = new Set<string>([conceptId]);
    for (const l of handle.links) {
      const s = endpoint(l.source).id;
      const t = endpoint(l.target).id;
      if (s === conceptId) neighborIds.add(t);
      if (t === conceptId) neighborIds.add(s);
    }
    fitToBounds(handle, svgEl, (n) => neighborIds.has(n.id), 60);
  }

  async function exportImage() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const background = getComputedStyle(svgEl).backgroundColor || '#ffffff';
    const dataUrl = await exportSvgAsPng(svgEl, { background, scale: 2 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `commongood-atlas-${viewId}-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  }

  function toggleFullscreen() {
    if (!wrapRef.current) return;
    // Browsers (and embedding contexts that deny the fullscreen Permissions
    // Policy) can reject this; there's nothing more useful to do than leave
    // the button in its normal state; the fullscreenchange listener above
    // only fires on success, so failure is a silent no-op rather than a
    // broken UI state.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapRef.current.requestFullscreen().catch(() => {});
    }
  }

  function runPathFind() {
    if (!pathFromId || !pathToId) return;
    setPathResult(findShortestPath(pathFromId, pathToId, concepts, relationships));
  }

  function clearPathFind() {
    // The consolidated highlight effect (keyed on pathResult) reapplies
    // whatever's next in priority -- search, then plain selection, then
    // nothing -- once this clears.
    setPathResult(undefined);
  }

  // Kept as its own element (not just another button inside .graph-controls)
  // so it can be placed outside the floating zoom/fit overlay that sits on
  // top of the canvas -- full mode puts it in the visible center toolbar,
  // mini mode puts it in a small toolbar strip below the canvas.
  const labelsToggleButton = (
    <button
      type="button"
      className={`graph-labels-toggle${showEdgeLabels ? ' active' : ''}`}
      aria-pressed={showEdgeLabels}
      aria-label={showEdgeLabels ? 'Hide relationship labels' : 'Show relationship labels'}
      title={showEdgeLabels ? 'Hide relationship labels' : 'Show relationship labels (or hover an edge for just its own)'}
      onClick={() => setShowEdgeLabels((v) => !v)}
    >
      {showEdgeLabels ? 'Hide labels' : 'Show labels'}
    </button>
  );

  const controls = (
    <div className="graph-controls">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.3)}>
        +
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
        &minus;
      </button>
      <button type="button" aria-label="Fit to view" title="Fit to view" onClick={fitToView}>
        &#x2922;
      </button>
      {!isMini && (
        <>
          <button type="button" aria-label="Export graph as PNG image" title="Export as image" onClick={exportImage}>
            &#x2913;
          </button>
          <button
            type="button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            &#x26F6;
          </button>
        </>
      )}
    </div>
  );

  if (isMini) {
    return (
      <div className="graph-mini">
        <div className="graph-canvas-wrap graph-canvas-mini">
          <svg className="graph-canvas" ref={svgRef} role="img" aria-label={`Neighborhood graph for ${focusConceptId}`} />
          {controls}
        </div>
        <div className="graph-mini-toolbar">{labelsToggleButton}</div>
      </div>
    );
  }

  const selectedConcept = selectedId ? conceptsById.get(selectedId) : undefined;
  const sortedForPathFinder = [...concepts].sort((a, b) => a.label.localeCompare(b.label));

  // Counts reflect the current view (Grant Lifecycle, Organizations & Roles,
  // etc.), not the whole ontology, so the key/filter only lists kinds that
  // actually appear here and shows how many of each.
  const kindCounts = new Map<ConceptKind, number>();
  for (const c of concepts) kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);
  const kindEntriesInView = KIND_LEGEND.filter((entry) => (kindCounts.get(entry.kind) ?? 0) > 0);

  const categoryCounts = new Map<string, number>();
  for (const c of concepts) categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
  const categoriesInView = CATEGORIES.filter((cat) => (categoryCounts.get(cat.id) ?? 0) > 0);

  // Counts both literal relationships.json rows AND the edges this
  // component synthesizes itself (structural "is a" + inherited) -- without
  // the latter, the "Structural (is a)" and "Inherited from parent" filter
  // chips would never appear, since no literal predicate ever maps to
  // either kind.
  const relKindCounts = new Map<RelationshipKind, number>();
  for (const r of relationships) {
    const k = relationshipKind(r.predicate);
    relKindCounts.set(k, (relKindCounts.get(k) ?? 0) + 1);
  }
  for (const link of synthesizedLinks) {
    relKindCounts.set(link.relKind, (relKindCounts.get(link.relKind) ?? 0) + 1);
  }
  const relKindsInView = (Object.keys(RELATIONSHIP_KIND_LABELS) as RelationshipKind[]).filter(
    (k) => (relKindCounts.get(k) ?? 0) > 0
  );

  // How many filters are actively hiding something, for the Filters panel's
  // summary count -- and how many concepts that leaves visible, for the
  // "N of M concepts shown" indicator (issue: filters used to hide ~40% of
  // the ontology with only a subtle color change as a clue).
  const filtersActiveCount = hiddenKinds.size + hiddenCategories.size + hiddenRelationshipKinds.size;
  const visibleByFilterCount = concepts.filter(
    (c) => !hiddenCategories.has(c.category) && !hiddenKinds.has(conceptKind(c))
  ).length;
  const activeViewLabel = customConceptIds
    ? 'Custom selection'
    : EXPLORER_VIEWS.find((v) => v.id === viewId)?.label ?? viewId;

  const visibleListConcepts = concepts
    .filter((c) => !hiddenCategories.has(c.category))
    .filter((c) => !hiddenKinds.has(conceptKind(c)))
    .filter((c) => !searchQuery.trim() || conceptSearchScore(c, searchQuery.trim()) > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
  const visibleListIds = new Set(visibleListConcepts.map((c) => c.id));
  const visibleListRelationships = relationships.filter(
    (r) => visibleListIds.has(r.subject) && visibleListIds.has(r.object)
  );

  // What's currently making a node disappear, as removable chips -- so a
  // user never has to open "Advanced filters" and inspect every checkbox to
  // find out why. Each entry undoes exactly the one thing it names.
  interface FilterChip {
    key: string;
    label: string;
    onRemove: () => void;
  }
  const activeFilterChips: FilterChip[] = [];
  if (!customConceptIds && viewId !== DEFAULT_VIEW_ID) {
    const view = EXPLORER_VIEWS.find((v) => v.id === viewId);
    activeFilterChips.push({ key: 'view', label: `View: ${view?.label ?? viewId}`, onRemove: () => setViewId(DEFAULT_VIEW_ID) });
  }
  for (const cat of CATEGORIES) {
    if (hiddenCategories.has(cat.id)) {
      activeFilterChips.push({
        key: `cat-${cat.id}`,
        label: `${cat.label} hidden`,
        onRemove: () => toggleCategory(cat.id),
      });
    }
  }
  // Kind visibility isn't tracked as a chip here -- the Filters panel's own
  // "N active" count and its chips are that axis's toggle/reset mechanism.
  for (const kind of Object.keys(RELATIONSHIP_KIND_LABELS) as RelationshipKind[]) {
    if (hiddenRelationshipKinds.has(kind)) {
      activeFilterChips.push({
        key: `rel-${kind}`,
        label: `${RELATIONSHIP_KIND_LABELS[kind]} relationships hidden`,
        onRemove: () => toggleRelationshipKind(kind),
      });
    }
  }
  if (searchQuery.trim()) {
    activeFilterChips.push({ key: 'search', label: `Search: "${searchQuery.trim()}"`, onRemove: () => setSearchQuery('') });
  }
  if (pathResult !== undefined) {
    activeFilterChips.push({
      key: 'path',
      label: 'Path highlighted',
      onRemove: () => {
        setPathFromId('');
        setPathToId('');
        setPathResult(undefined);
      },
    });
  }

  return (
    <div className="graph-explorer">
      <div className={`graph-workspace${selectedConcept ? ' has-inspector' : ''}`}>
        <details className="graph-sidebar" open>
          <summary className="graph-sidebar-heading">Explore</summary>

          <div className="graph-sidebar-section">
            <span className="graph-sidebar-section-label">View</span>
            {customConceptIds ? (
              <div className="custom-view-banner">
                <p>
                  Showing {customConceptIds.size} concepts from a <strong>Design</strong> recommendation.
                </p>
                <button type="button" className="link-button" onClick={() => setCustomConceptIds(null)}>
                  Clear, show named views
                </button>
              </div>
            ) : (
              <div className="graph-sidebar-view-list" role="group" aria-label="Ontology view">
                {EXPLORER_VIEWS.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={`graph-sidebar-view-row${viewId === view.id ? ' active' : ''}`}
                    aria-pressed={viewId === view.id}
                    title={view.description}
                    onClick={() => setViewId(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="graph-active-filters-row">
            {activeFilterChips.length > 0 && (
              <ul className="graph-filter-chips">
                {activeFilterChips.map((chip) => (
                  <li key={chip.key}>
                    <button type="button" className="graph-filter-chip" onClick={chip.onRemove}>
                      {chip.label} <span aria-hidden="true">&times;</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="link-button graph-reset-filters"
              disabled={activeFilterChips.length === 0}
              onClick={resetFilters}
            >
              Reset view
            </button>
          </div>

          <details className="graph-tool-section graph-filters-section" open>
            <summary>
              <span className="graph-tool-section-title">Filters</span>
              <span className="graph-tool-section-hint">
                {filtersActiveCount > 0 ? `${filtersActiveCount} active` : 'All shown'}
              </span>
            </summary>

            <details className="filter-chip-group" open>
              <summary className="filter-chip-group-label">Kind</summary>
              <div className="filter-chip-row" role="group" aria-label="Kind">
                {kindEntriesInView.map((entry) => {
                  const hidden = hiddenKinds.has(entry.kind);
                  const color = kindSwatchColor(entry.kind);
                  return (
                    <button
                      key={entry.kind}
                      type="button"
                      className={`filter-chip${hidden ? ' filter-chip-hidden' : ''}`}
                      aria-pressed={!hidden}
                      onClick={() => toggleKind(entry.kind)}
                    >
                      <span
                        className={`shape-swatch shape-swatch-${entry.kind}`}
                        style={color ? { background: `light-dark(${color.light}, ${color.dark})` } : undefined}
                      />
                      {entry.label}
                      <span className="filter-chip-count">{kindCounts.get(entry.kind)}</span>
                    </button>
                  );
                })}
              </div>
            </details>

            <details className="filter-chip-group" open>
              <summary className="filter-chip-group-label">Category</summary>
              <div className="filter-chip-row" role="group" aria-label="Category">
                {categoriesInView.map((cat) => {
                  const hidden = hiddenCategories.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`filter-chip${hidden ? ' filter-chip-hidden' : ''}`}
                      aria-pressed={!hidden}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <span
                        className="search-result-swatch"
                        style={{ background: `light-dark(${cat.colorLight}, ${cat.colorDark})` }}
                      />
                      {cat.label}
                      <span className="filter-chip-count">{categoryCounts.get(cat.id)}</span>
                    </button>
                  );
                })}
              </div>
            </details>

            <details className="filter-chip-group" open>
              <summary className="filter-chip-group-label">Relationship type</summary>
              <div className="filter-chip-row" role="group" aria-label="Relationship type">
                {relKindsInView.map((kind) => {
                  const hidden = hiddenRelationshipKinds.has(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`filter-chip${hidden ? ' filter-chip-hidden' : ''}`}
                      aria-pressed={!hidden}
                      onClick={() => toggleRelationshipKind(kind)}
                    >
                      {RELATIONSHIP_KIND_LABELS[kind]}
                      <span className="filter-chip-count">{relKindCounts.get(kind)}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          </details>

          <details className="graph-tool-section graph-path-finder-section">
            <summary>
              <span className="graph-tool-section-title">Find a connection</span>
              <span className="graph-tool-section-hint">See how two concepts connect, step by step</span>
            </summary>
            <div className="path-finder">
              <label className="path-finder-label">
                From
                <select value={pathFromId} onChange={(e) => setPathFromId(e.target.value)}>
                  <option value="">Select a concept&hellip;</option>
                  {sortedForPathFinder.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="path-finder-label">
                To
                <select value={pathToId} onChange={(e) => setPathToId(e.target.value)}>
                  <option value="">Select a concept&hellip;</option>
                  {sortedForPathFinder.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="path-finder-actions">
                <button type="button" className="home-cta home-cta-primary" disabled={!pathFromId || !pathToId} onClick={runPathFind}>
                  Find path
                </button>
                {pathResult !== undefined && (
                  <button type="button" className="link-button" onClick={clearPathFind}>
                    Clear
                  </button>
                )}
              </div>
              <div aria-live="polite">
                {pathResult === null && <p className="muted graph-hint">No path between these concepts in this view.</p>}
                {pathResult && pathResult.length === 0 && <p className="muted graph-hint">Select two different concepts.</p>}
                {pathResult && pathResult.length > 0 && (
                  <ol className="path-result">
                    <li>{conceptsById.get(pathResult[0].fromId)?.label}</li>
                    {pathResult.map((step, i) => (
                      <li key={i}>
                        <span className="muted">{step.label}</span> {conceptsById.get(step.toId)?.label}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </details>
        </details>

        <div className="graph-center">
          <div className="graph-center-toolbar">
            <h2 className="graph-center-title">{activeViewLabel}</h2>
            <p className="graph-visible-count">
              Showing <strong>{visibleByFilterCount}</strong> of {concepts.length} concepts
            </p>
            <div className="graph-view-toggle" role="group" aria-label="Graph or list view">
              <button type="button" className={!showList ? 'active' : ''} aria-pressed={!showList} onClick={() => setShowList(false)}>
                Graph
              </button>
              <button
                type="button"
                className={showList ? 'active' : ''}
                aria-pressed={showList}
                title="List (keyboard-accessible)"
                onClick={() => setShowList(true)}
              >
                List
              </button>
            </div>
            {!showList && labelsToggleButton}
          </div>

          <div className="search-box graph-toolbar-search">
            <input
              type="search"
              className="search-input"
              value={searchQuery}
              onChange={(e) => {
                setPathResult(undefined);
                setSearchQuery(e.target.value);
              }}
              placeholder="Search this view's concepts"
              aria-label="Search concepts in the graph"
            />
            {searchResults.length > 0 && (
              <ul className="search-results" role="listbox">
                {searchResults.map((c) => {
                  const cat = getCategory(c.category);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="search-result-button"
                        onClick={() => {
                          setSearchQuery('');
                          setPathResult(undefined);
                          setSelectedId(c.id);
                          fitToNeighborhood(c.id);
                        }}
                      >
                        <span
                          className="search-result-swatch"
                          style={{ background: `light-dark(${cat.colorLight}, ${cat.colorDark})` }}
                        />
                        <span>{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {searchQuery.trim() && searchResults.length === 0 && (
              <p className="muted search-no-results">No concepts match "{searchQuery.trim()}" in this view.</p>
            )}
          </div>

          <div className="graph-stage">
            <div className="graph-canvas-wrap graph-list-view" hidden={!showList}>
              <h2 className="graph-sidebar-title">
                Concepts ({visibleListConcepts.length} of {concepts.length})
              </h2>
              <ul className="concept-card-list">
                {visibleListConcepts.map((c) => {
                  const cat = getCategory(c.category);
                  return (
                    <li key={c.id} className="card">
                      <div className="concept-card-header">
                        <span
                          className="search-result-swatch"
                          style={{ background: `light-dark(${cat.colorLight}, ${cat.colorDark})` }}
                        />
                        <a href={`${base}concepts/${c.id}`} className="concept-card-label">
                          {c.label}
                        </a>
                      </div>
                      <p className="secondary concept-card-def">{c.definition}</p>
                    </li>
                  );
                })}
              </ul>
              <h2 className="graph-sidebar-title">Relationships ({visibleListRelationships.length})</h2>
              <ul className="graph-list-relationships">
                {visibleListRelationships.map((r) => (
                  <li key={r.id}>
                    <a href={`${base}concepts/${r.subject}`}>{conceptsById.get(r.subject)?.label}</a>{' '}
                    <span className="muted">{r.label}</span>{' '}
                    <a href={`${base}concepts/${r.object}`}>{conceptsById.get(r.object)?.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="graph-canvas-wrap" ref={wrapRef} hidden={showList}>
              <svg className="graph-canvas" ref={svgRef} role="img" aria-label="CommonGood Atlas concept relationship graph" />
              {controls}
            </div>
          </div>
        </div>

        {selectedConcept && (
          <aside
            className="graph-detail graph-detail-docked graph-inspector"
            style={
              {
                '--detail-accent': `light-dark(${getCategory(selectedConcept.category).colorLight}, ${getCategory(selectedConcept.category).colorDark})`,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className="graph-detail-close"
              aria-label="Close details"
              onClick={() => setSelectedId(null)}
            >
              &times;
            </button>
            <PropertyInspector
              concept={selectedConcept}
              parent={selectedConcept.subClassOf ? getConcept(selectedConcept.subClassOf) : undefined}
              subtypes={getSubtypes(selectedConcept.id)}
              outgoing={getOutgoingRelationships(selectedConcept.id)}
              incoming={getIncomingRelationships(selectedConcept.id)}
              propertyGroups={getPropertyGroups(selectedConcept)}
              businessRules={getBusinessRulesForConcept(selectedConcept.id)}
              base={base}
              showOpenPageLink
            />
          </aside>
        )}
      </div>

      <p className="muted graph-hint">
        Click a node to see its details. Click the background to clear. Drag to reposition, scroll to zoom.
      </p>
    </div>
  );
}

function neighborHas(concepts: { id: string }[], id: string): boolean {
  return concepts.some((c) => c.id === id);
}
