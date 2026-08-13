import { useEffect, useRef } from 'react';
import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { drag as d3drag } from 'd3-drag';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { computeEntityBoxLayout, intersectRayWithBox, truncateLabel, type EntityBoxLayout } from '../../data/entity-shapes';
import { seededGridPositions } from '../../data/graph-utils';
import { getCategory } from '../../data/categories';
import { exportSvgAsPng } from '../../data/svg-export';
import type { LogicalEntityType, LogicalModel } from '../../data/logical-model';

interface Props {
  model: LogicalModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface EntityAttributeRow {
  label: string;
  logicalType: string;
  isIdentifier: boolean;
  inherited: boolean;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  category: string;
  entityType: LogicalEntityType;
  attributes: EntityAttributeRow[];
  layout: EntityBoxLayout;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string;
  label: string;
  dashed: boolean;
}

interface DiagramHandle {
  simulation: Simulation<SimNode, SimLink>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  nodeSel: Selection<SVGGElement, SimNode, SVGGElement, unknown>;
  edgeSel: Selection<SVGLineElement, SimLink, SVGGElement, unknown>;
  edgeLabelSel: Selection<SVGTextElement, SimLink, SVGGElement, unknown>;
  links: SimLink[];
}

const ENTITY_TYPE_LABELS: Record<LogicalEntityType, string> = {
  entity: 'Entity',
  'abstract-entity': 'Abstract Entity',
  'reference-entity': 'Reference Entity',
};

// Entity boxes are much bigger than ConceptualModelDiagram's ~20px concept
// bubbles, so the whole force setup needs looser spacing -- same
// deliberately simple proportions philosophy (see that component's own
// comment), just re-tuned for the bigger footprint.
const ARROW_GAP = 6;
const LINK_DISTANCE = 260;
const CHARGE_STRENGTH = -500;
const COLLIDE_BUFFER = 16;
const HEADER_MAX_CHARS = 22;
const ROW_MAX_CHARS = 28;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function linkNodeId(end: string | number | SimNode): string {
  return typeof end === 'object' ? end.id : String(end);
}

// Accounts for each node's own box extents (which vary a lot with
// attribute count), not just point coordinates -- ConceptualModelDiagram's
// version can get away with point coordinates only because every bubble is
// the same small fixed size.
function fitToBounds(handle: DiagramHandle, nodes: SimNode[], svgEl: SVGSVGElement, padding = 40, maxScale = 2) {
  if (nodes.length === 0) return;
  const minX = Math.min(...nodes.map((n) => (n.x ?? 0) - n.layout.width / 2));
  const maxX = Math.max(...nodes.map((n) => (n.x ?? 0) + n.layout.width / 2));
  const minY = Math.min(...nodes.map((n) => (n.y ?? 0) - n.layout.height / 2));
  const maxY = Math.max(...nodes.map((n) => (n.y ?? 0) + n.layout.height / 2));
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const rect = svgEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const scale = Math.min((rect.width - padding * 2) / bw, (rect.height - padding * 2) / bh, maxScale);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const transform = zoomIdentity
    .translate(rect.width / 2, rect.height / 2)
    .scale(Math.max(scale, 0.05))
    .translate(-cx, -cy);
  const sel = select(svgEl);
  if (prefersReducedMotion()) {
    sel.call(handle.zoomBehavior.transform, transform);
  } else {
    sel.transition().duration(200).call(handle.zoomBehavior.transform, transform);
  }
}

/**
 * SVG/D3 ER diagram for the Logical Model -- structurally mirrors
 * ConceptualModelDiagram.tsx (same build-on-[model]/classed-highlight-on-
 * [selectedId] split, same zoom/drag/fit/reduced-motion/export machinery),
 * but every entity is a boxy, variable-height node listing its full
 * attribute set rather than a small fixed-size bubble -- see
 * docs/10-program-model-generation.md's Logical Model section for the
 * deliberate simplifications this implies (circle-approximated collision,
 * no cardinality notation on edges).
 */
export default function LogicalModelDiagram({ model, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiagramHandle | null>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const seeded = seededGridPositions(
      model.entities.map((e) => e.id),
      320
    );
    const nodes: SimNode[] = model.entities.map((e) => ({
      id: e.id,
      label: e.label,
      category: e.category,
      entityType: e.entityType,
      attributes: e.attributes.map((a) => ({
        label: a.label,
        logicalType: a.logicalType,
        isIdentifier: a.logicalType === 'identifier',
        inherited: a.inherited,
      })),
      layout: computeEntityBoxLayout(e.attributes.length),
      ...seeded.get(e.id),
    }));
    const links: SimLink[] = model.associations.map((a) => ({
      id: a.id,
      source: a.sourceEntityId,
      target: a.targetEntityId,
      label: a.label,
      dashed: a.type === 'specialization',
    }));

    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'logical-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('class', 'logical-arrowhead');

    const viewport = svg.append('g').attr('class', 'logical-viewport');
    const edgeLayer = viewport.append('g').attr('class', 'logical-edges');
    const edgeLabelLayer = viewport.append('g').attr('class', 'logical-edge-labels');
    const nodeLayer = viewport.append('g').attr('class', 'logical-nodes');

    const edgeSel = edgeLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links, (d) => d.id)
      .join('line')
      .attr('class', (d) => `logical-association-edge${d.dashed ? ' specialization-edge' : ''}`)
      .attr('marker-end', 'url(#logical-arrow)');

    const edgeLabelSel = edgeLabelLayer
      .selectAll<SVGTextElement, SimLink>('text')
      .data(links, (d) => d.id)
      .join('text')
      .attr('class', 'logical-edge-label')
      .attr('text-anchor', 'middle')
      .text((d) => d.label);

    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(LINK_DISTANCE))
      .force('charge', forceManyBody().strength(CHARGE_STRENGTH).distanceMax(900))
      .force('collide', forceCollide<SimNode>((d) => Math.hypot(d.layout.width, d.layout.height) / 2 + COLLIDE_BUFFER))
      .force('x', forceX(0).strength(0.05))
      .force('y', forceY(0).strength(0.05));

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
      });

    const nodeSel = nodeLayer
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', 'logical-entity-node')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.label}, ${ENTITY_TYPE_LABELS[d.entityType]}`)
      .call(dragBehavior)
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelect(d.id === selectedId ? null : d.id);
      })
      .on('keydown', (event: KeyboardEvent, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(d.id === selectedId ? null : d.id);
        }
      });

    nodeSel.each(function (d) {
      const g = select(this);
      const { width, height, attributeRowY } = d.layout;
      const left = -width / 2;
      const top = -height / 2;

      g.append('rect')
        .attr('class', `logical-entity-box logical-entity-box-${d.entityType}`)
        .attr('x', left)
        .attr('y', top)
        .attr('width', width)
        .attr('height', height)
        .attr('rx', 4);

      g.append('rect')
        .attr('class', 'logical-entity-header')
        .attr('x', left)
        .attr('y', top)
        .attr('width', width)
        .attr('height', Math.min(height, 26))
        .style('fill', () => {
          const cat = getCategory(d.category);
          return `light-dark(${cat.colorLight}, ${cat.colorDark})`;
        });

      g.append('text')
        .attr('class', 'logical-entity-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('x', 0)
        .attr('y', top + 13)
        .text(truncateLabel(d.label, HEADER_MAX_CHARS));

      d.attributes.forEach((a, i) => {
        const rowText = `${a.isIdentifier ? 'PK ' : ''}${a.label} (${a.logicalType})`;
        g.append('text')
          .attr('class', `logical-attribute-row${a.isIdentifier ? ' logical-attribute-row-pk' : ''}${a.inherited ? ' logical-attribute-row-inherited' : ''}`)
          .attr('text-anchor', 'start')
          .attr('x', left + 6)
          .attr('y', top + attributeRowY[i])
          .text(truncateLabel(rowText, ROW_MAX_CHARS));
      });
    });

    svg.on('click', () => onSelect(null));

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 2.5])
      .filter((event) => event.type === 'wheel' || !(event.target as Element).closest('.logical-entity-node'))
      .on('zoom', (event) => viewport.attr('transform', event.transform.toString()));
    svg.call(zoomBehavior);

    function ticked() {
      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      edgeSel.each(function (d) {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const sx = s.x ?? 0;
        const sy = s.y ?? 0;
        const tx = t.x ?? 0;
        const ty = t.y ?? 0;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const sourceExit = intersectRayWithBox(dx, dy, s.layout.width / 2, s.layout.height / 2);
        const targetExit = intersectRayWithBox(-dx, -dy, t.layout.width / 2, t.layout.height / 2);
        select(this)
          .attr('x1', sx + sourceExit.ox)
          .attr('y1', sy + sourceExit.oy)
          .attr('x2', tx + targetExit.ox - ux * ARROW_GAP)
          .attr('y2', ty + targetExit.oy - uy * ARROW_GAP);
      });
      edgeLabelSel
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2);
    }
    simulation.on('tick', ticked);

    const handle: DiagramHandle = { simulation, zoomBehavior, nodeSel, edgeSel, edgeLabelSel, links };
    handleRef.current = handle;

    let hasAutoFitted = false;
    const autoFit = () => {
      if (hasAutoFitted) return;
      hasAutoFitted = true;
      fitToBounds(handle, nodes, svgEl);
    };

    if (prefersReducedMotion()) {
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      ticked();
      autoFit();
    } else {
      fitToBounds(handle, nodes, svgEl);
      simulation.on('end', autoFit);
    }
    const fitBackstop = setTimeout(autoFit, 2500);

    const resizeObserver = new ResizeObserver(() => {
      if (handleRef.current) fitToBounds(handleRef.current, nodes, svgEl);
    });
    if (wrapRef.current) resizeObserver.observe(wrapRef.current);

    return () => {
      clearTimeout(fitBackstop);
      resizeObserver.disconnect();
      simulation.stop();
      svg.on('.zoom', null);
      svg.on('click', null);
      svg.selectAll('*').remove();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (!selectedId) {
      handle.nodeSel.classed('selected', false).classed('connected', false).classed('faded', false);
      handle.edgeSel.classed('connected', false).classed('faded', false);
      handle.edgeLabelSel.classed('visible', false);
      return;
    }
    const neighborIds = new Set<string>([selectedId]);
    const incidentEdgeIds = new Set<string>();
    for (const link of handle.links) {
      const sourceId = linkNodeId(link.source);
      const targetId = linkNodeId(link.target);
      if (sourceId === selectedId || targetId === selectedId) {
        incidentEdgeIds.add(link.id);
        neighborIds.add(sourceId);
        neighborIds.add(targetId);
      }
    }
    handle.nodeSel.classed('selected', (d) => d.id === selectedId);
    handle.nodeSel.classed('connected', (d) => d.id !== selectedId && neighborIds.has(d.id));
    handle.nodeSel.classed('faded', (d) => !neighborIds.has(d.id));
    handle.edgeSel.classed('connected', (d) => incidentEdgeIds.has(d.id));
    handle.edgeSel.classed('faded', (d) => !incidentEdgeIds.has(d.id));
    handle.edgeLabelSel.classed('visible', (d) => incidentEdgeIds.has(d.id));
  }, [selectedId]);

  function handleZoomBy(factor: number) {
    const handle = handleRef.current;
    const svgEl = svgRef.current;
    if (!handle || !svgEl) return;
    const sel = select(svgEl);
    if (prefersReducedMotion()) {
      sel.call(handle.zoomBehavior.scaleBy, factor);
    } else {
      sel.transition().duration(150).call(handle.zoomBehavior.scaleBy, factor);
    }
  }

  function handleFit() {
    const handle = handleRef.current;
    const svgEl = svgRef.current;
    if (!handle || !svgEl) return;
    const nodes = handle.nodeSel.data();
    fitToBounds(handle, nodes, svgEl);
  }

  async function handleExportPng() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const background = getComputedStyle(svgEl).backgroundColor || '#ffffff';
    const dataUrl = await exportSvgAsPng(svgEl, { background, scale: 2 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'commongood-atlas-logical-model.png';
    link.click();
  }

  return (
    <div className="conceptual-model-diagram-wrap logical-model-diagram-wrap" ref={wrapRef}>
      <div className="conceptual-model-diagram-toolbar" role="group" aria-label="Diagram controls">
        <button type="button" className="link-button" onClick={() => handleZoomBy(1.3)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="link-button" onClick={() => handleZoomBy(1 / 1.3)} aria-label="Zoom out">
          &minus;
        </button>
        <button type="button" className="link-button" onClick={handleFit}>
          Fit to view
        </button>
        <button type="button" className="link-button" onClick={handleExportPng}>
          Export as image
        </button>
      </div>
      <svg
        ref={svgRef}
        className="conceptual-model-diagram-canvas logical-model-diagram-canvas"
        role="img"
        aria-label="Logical model ER diagram -- select an entity with click or Enter/Space"
      />
    </div>
  );
}
