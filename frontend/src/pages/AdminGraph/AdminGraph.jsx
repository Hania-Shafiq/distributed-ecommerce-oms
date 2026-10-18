/**
 * pages/AdminGraph/AdminGraph.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-Only Force-Directed Co-Purchase Knowledge Graph.
 * Visualizes product network topology powered by Neo4j co-purchase edges.
 *
 * Features:
 *   • Force-directed layout using Cytoscape.js (cose layout engine)
 *   • Node color by product category
 *   • Node size by graph degree (number of connections)
 *   • Edge width scaled by co-purchase weight (distinct users)
 *   • Node click inspector: reveals product metadata and top co-purchased partners
 *   • Interactive zoom, pan, and layout fit controls
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import cytoscape from 'cytoscape';
import {
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  X,
  ExternalLink,
  Info,
  ShieldCheck,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { getGraphNetwork } from '../../api/recommendationApi';
import Button from '../../components/Button';
import { formatError } from '../../utils/formatError';

// Curated category color mapping
const CATEGORY_COLORS = {
  Electronics: '#0ea5e9',   // Sky blue
  Furniture:   '#f59e0b',   // Amber
  Kitchen:     '#10b981',   // Emerald
  Sports:      '#8b5cf6',   // Purple
  Accessories: '#ec4899',   // Pink
  General:     '#64748b',   // Slate
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748b';
}

export default function AdminGraph() {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [limitEdges, setLimitEdges] = useState(150);
  const [graphData, setGraphData]   = useState({ nodes: [], edges: [] });
  const [selectedNode, setSelected] = useState(null);

  // Fetch graph data from backend
  const loadGraph = async (limit = limitEdges) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const data = await getGraphNetwork(limit);
      setGraphData(data);
    } catch (err) {
      setError(formatError(err, 'Failed to load network topology graph.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph(limitEdges);
  }, [limitEdges]);

  // Build / update Cytoscape graph instance
  useEffect(() => {
    if (!containerRef.current || loading || !graphData.nodes.length) return;

    // Calculate dynamic node sizes and edge widths
    const maxDegree = Math.max(...graphData.nodes.map(n => n.degree || 1), 1);
    const maxWeight = Math.max(...graphData.edges.map(e => e.weight || 1), 1);

    const elements = [
      ...graphData.nodes.map(node => {
        // Node size range: 24px - 64px based on degree
        const degreeRatio = (node.degree || 0) / maxDegree;
        const size = Math.round(24 + degreeRatio * 40);

        return {
          group: 'nodes',
          data: {
            id: String(node.id),
            rawId: node.id,
            name: node.name,
            category: node.category,
            degree: node.degree,
            size: size,
            color: getCategoryColor(node.category),
          },
        };
      }),
      ...graphData.edges.map(edge => {
        // Edge width range: 1.5px - 8px based on weight
        const weightRatio = (edge.weight || 1) / maxWeight;
        const width = Math.max(1.5, Math.min(8, 1.5 + weightRatio * 6.5));

        return {
          group: 'edges',
          data: {
            id: `e_${edge.source}_${edge.target}`,
            source: String(edge.source),
            target: String(edge.target),
            weight: edge.weight,
            width: width,
          },
        };
      }),
    ];

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      boxSelectionEnabled: false,
      autounselectify: false,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(name)',
            'font-size': '11px',
            'font-family': 'Inter, system-ui, sans-serif',
            'color': '#1e293b',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-background-opacity': 0.8,
            'text-background-color': '#ffffff',
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
            'background-color': 'data(color)',
            'width': 'data(size)',
            'height': 'data(size)',
            'border-width': 2.5,
            'border-color': '#ffffff',
            'box-shadow': '0 2px 4px rgba(0,0,0,0.1)',
            'transition-property': 'background-color, border-color, border-width, width, height',
            'transition-duration': '0.15s',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#0f172a',
            'border-width': 4,
            'text-background-color': '#0f172a',
            'color': '#ffffff',
            'font-weight': 'bold',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(width)',
            'line-color': '#cbd5e1',
            'curve-style': 'bezier',
            'opacity': 0.65,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': '0.15s',
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#3d8361',
            'opacity': 1.0,
            'z-index': 999,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#3d8361',
            'border-width': 3,
          },
        },
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 80,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 40,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
    });

    // Handle node selection / click
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();

      // Reset previous highlights
      cy.elements().removeClass('highlighted');

      // Highlight clicked node & immediate neighbors
      node.addClass('highlighted');
      const connectedEdges = node.connectedEdges();
      connectedEdges.addClass('highlighted');
      const neighborNodes = connectedEdges.connectedNodes();
      neighborNodes.addClass('highlighted');

      // Collect top partners with weights
      const partners = [];
      connectedEdges.forEach((edge) => {
        const edgeData = edge.data();
        const otherNode = edge.source().id() === node.id() ? edge.target() : edge.source();
        partners.push({
          id: otherNode.data('rawId'),
          name: otherNode.data('name'),
          category: otherNode.data('category'),
          weight: edgeData.weight,
        });
      });

      // Sort partners by co-purchase weight descending
      partners.sort((a, b) => b.weight - a.weight);

      setSelected({
        id: nodeData.rawId,
        name: nodeData.name,
        category: nodeData.category,
        degree: nodeData.degree,
        partners: partners,
      });
    });

    // Click background to clear selection
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted');
        setSelected(null);
      }
    });

    cyRef.current = cy;

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData, loading]);

  // Zoom controls
  const handleZoomIn = () => {
    if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() * 1.25);
  };
  const handleZoomOut = () => {
    if (cyRef.current) cyRef.current.zoom(cyRef.current.zoom() * 0.8);
  };
  const handleFit = () => {
    if (cyRef.current) cyRef.current.fit(40);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ── Breadcrumb & Top Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <nav className="flex items-center gap-2 text-xs font-normal text-slate-400 mb-2">
            <Link to="/admin" className="hover:text-charcoal ui-transition flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Dashboard</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="text-charcoal font-medium">Co-Purchase Network Graph</span>
          </nav>
          <div className="flex items-center gap-2.5">
            <Share2 className="w-6 h-6 text-sea-green" />
            <h1 className="text-2xl font-semibold text-charcoal tracking-tight">Product Affinity Network</h1>
            <span className="badge-status badge-status-ok text-[11px] font-mono">NEO4J LIVE</span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Force-directed graph of multi-product purchasing affinities. Node size indicates connection degree; edge thickness reflects distinct co-purchasing customers.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-granite/12 px-3 py-1.5 rounded-md">
            <span>Edge Limit:</span>
            <select
              value={limitEdges}
              onChange={(e) => setLimitEdges(Number(e.target.value))}
              className="bg-transparent font-medium text-charcoal focus:outline-none cursor-pointer"
            >
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={150}>Top 150 (Default)</option>
              <option value={300}>Top 300</option>
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadGraph(limitEdges)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Category Legend & Network Stats ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-lg border border-granite/10 shadow-2xs mb-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-charcoal">Categories:</span>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: color }} />
              <span className="text-slate-600">{cat}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 font-mono text-slate-500">
          <span>Nodes: <strong className="text-charcoal">{graphData.nodes.length}</strong></span>
          <span>Edges: <strong className="text-charcoal">{graphData.edges.length}</strong></span>
        </div>
      </div>

      {/* ── Main Graph Canvas Container ── */}
      <div className="relative bg-white rounded-lg border border-granite/15 shadow-sm overflow-hidden min-h-[640px] h-[640px]">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-sea-green rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-600">Traversing Neo4j affinity graph...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
              <Info className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-charcoal text-base mb-1">Graph Unavailable</h3>
            <p className="text-sm text-slate-500 max-w-md mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => loadGraph(limitEdges)}>
              Retry Probe
            </Button>
          </div>
        )}

        {/* Cytoscape Canvas mount target */}
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Floating Zoom / Layout Tooling */}
        <div className="absolute bottom-5 left-5 z-10 flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm p-1.5 rounded-lg border border-granite/15 shadow-md">
          <button
            onClick={handleZoomIn}
            className="p-2 text-slate-600 hover:text-charcoal hover:bg-slate-100 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 text-slate-600 hover:text-charcoal hover:bg-slate-100 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFit}
            className="p-2 text-slate-600 hover:text-charcoal hover:bg-slate-100 rounded transition-colors"
            title="Fit to Canvas"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Click Inspector Panel */}
        {selectedNode && (
          <div className="absolute top-5 right-5 z-10 w-80 max-w-[calc(100%-2.5rem)] bg-white/95 backdrop-blur-md rounded-lg border border-granite/20 shadow-xl p-5 animate-fade-in overflow-hidden">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white mb-1.5"
                  style={{ backgroundColor: getCategoryColor(selectedNode.category) }}
                >
                  {selectedNode.category}
                </span>
                <h3 className="font-bold text-charcoal text-base leading-snug">
                  {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  if (cyRef.current) cyRef.current.elements().removeClass('highlighted');
                  setSelected(null);
                }}
                className="text-slate-400 hover:text-charcoal p-1 rounded-md transition-colors"
                title="Dismiss inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-md border border-slate-100 text-xs mb-4">
              <span className="text-slate-500">Network Degree:</span>
              <strong className="text-charcoal font-mono text-sm">{selectedNode.degree}</strong>
              <span className="text-slate-400">connections</span>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-3.5 h-3.5 text-sea-green" />
                <h4 className="text-xs font-semibold text-charcoal uppercase tracking-wider">
                  Top Co-Purchased Partners
                </h4>
              </div>

              {selectedNode.partners.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No co-purchase edges recorded for this node in the current view.</p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedNode.partners.map((partner) => (
                    <li
                      key={partner.id}
                      className="p-2 rounded-md border border-granite/8 bg-white hover:bg-slate-50 transition-colors text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-charcoal truncate">{partner.name}</p>
                        <p className="text-[10px] text-slate-400">{partner.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-sea-green">{partner.weight}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">buyers</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-granite/10 flex items-center justify-end">
              <Link
                to={`/products/${selectedNode.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sea-green hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>View catalog item</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
