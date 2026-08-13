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
import { nodeShapePath } from '../../data/graph-shapes';
import { seededGridPositions } from '../../data/graph-utils';
import { getCategory } from '../../data/categories';
import { exportSvgAsPng } from '../../data/svg-export';
import type { ConceptKind } from '../../data/ontology';
import type { ConceptualModel } from '../../data/program-model';

interface Props {
  model: ConceptualModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  category: string;
  kind: ConceptKind;
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

// Same rough proportions as GraphExplorer's own force setup (see
// docs/10-program-model-generation.md) -- this diagram is deliberately
// simpler (no filters/pathfinder/mini mode) but should feel like the same
// product, not a foreign UI.
const NODE_SIZE = 20;
const ARROW_GAP = 6;
const LINK_DISTANCE = 130;
const CHARGE_STRENGTH = -180;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function linkNodeId(end: string | number | SimNode): string {
  return typeof end === 'object' ? end.id : String(end);
}

function fitToBounds(handle: DiagramHandle, nodes: SimNode[], svgEl: SVGSVGElement, padding = 40, maxScale = 2) {
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
 * SVG/D3 diagram for the Conceptual Model -- built from the same
 * framework-independent primitives GraphExplorer.tsx uses
 * (graph-shapes/graph-utils/categories/svg-export), not a fork or
 * embedding of that component. Deliberately simpler: no filters, search,
 * or path-finder -- just pan/zoom/fit/select. See
 * docs/10-program-model-generation.md for why.
 */
export default function ConceptualModelDiagram({ model, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiagramHandle | null>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const seeded = seededGridPositions(
      model.nodes.map((n) => n.id),
      110
    );
    const nodes: SimNode[] = model.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      category: n.category,
      kind: n.kind,
      ...seeded.get(n.id),
    }));
    const links: SimLink[] = model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      dashed: e.type === 'specialization',
    }));

    const svg = select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'conceptual-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('class', 'conceptual-arrowhead');

    const viewport = svg.append('g').attr('class', 'conceptual-viewport');
    const edgeLayer = viewport.append('g').attr('class', 'conceptual-edges');
    const edgeLabelLayer = viewport.append('g').attr('class', 'conceptual-edge-labels');
    const nodeLayer = viewport.append('g').attr('class', 'conceptual-nodes');

    const edgeSel = edgeLayer
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links, (d) => d.id)
      .join('line')
      .attr('class', (d) => `conceptual-edge${d.dashed ? ' specialization-edge' : ''}`)
      .attr('marker-end', 'url(#conceptual-arrow)');

    const edgeLabelSel = edgeLabelLayer
      .selectAll<SVGTextElement, SimLink>('text')
      .data(links, (d) => d.id)
      .join('text')
      .attr('class', 'conceptual-edge-label')
      .attr('text-anchor', 'middle')
      .text((d) => d.label);

    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(LINK_DISTANCE))
      .force('charge', forceManyBody().strength(CHARGE_STRENGTH).distanceMax(440))
      .force('collide', forceCollide(NODE_SIZE / 2 + 20))
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
      .attr('class', 'conceptual-node')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => d.label)
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

    nodeSel
      .append('path')
      .attr('class', 'conceptual-node-shape')
      .attr('d', (d) => nodeShapePath(d.kind, NODE_SIZE))
      .style('fill', (d) => {
        const cat = getCategory(d.category);
        return `light-dark(${cat.colorLight}, ${cat.colorDark})`;
      });

    nodeSel
      .append('text')
      .attr('class', 'conceptual-node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', NODE_SIZE / 2 + 14)
      .text((d) => d.label);

    svg.on('click', () => onSelect(null));

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .filter((event) => event.type === 'wheel' || !(event.target as Element).closest('.conceptual-node'))
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
        const sr = NODE_SIZE / 2;
        const tr = NODE_SIZE / 2 + ARROW_GAP;
        select(this)
          .attr('x1', sx + ux * sr)
          .attr('y1', sy + uy * sr)
          .attr('x2', tx - ux * tr)
          .attr('y2', ty - uy * tr);
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
      // Skip the animated settle entirely -- jump straight to a converged
      // layout instead of an ongoing physics animation to sit through (see
      // docs/10-program-model-generation.md). Functional pan/zoom/drag are
      // untouched; only the decorative auto-settle motion is removed.
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
    // Rebuild only when the underlying data changes -- selection/highlight
    // updates happen in the effect below via .classed(), never a rebuild.
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
    link.download = 'commongood-atlas-conceptual-model.png';
    link.click();
  }

  return (
    <div className="conceptual-model-diagram-wrap" ref={wrapRef}>
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
        className="conceptual-model-diagram-canvas"
        role="img"
        aria-label="Conceptual model diagram -- select a node with click or Enter/Space"
      />
    </div>
  );
}
