import * as vscode from 'vscode';
import * as path from 'path';
import { parseLabConf, type LabConfDocument } from '../parser/labConfParser';

interface TopologyData {
  devices: Array<{ id: string; label: string }>;
  domains: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string; label: string }>;
}

function buildTopology(parsed: LabConfDocument): TopologyData {
  const devices: Array<{ id: string; label: string }> = [];
  const domainsMap = new Map<string, { id: string; label: string }>();
  const edges: Array<{ from: string; to: string; label: string }> = [];

  for (const [devName, devInfo] of parsed.devices) {
    devices.push({ id: `dev:${devName}`, label: devName });

    for (const [index, iface] of devInfo.interfaces) {
      // Strip quotes from value
      const raw = iface.value.replace(/^["']|["']$/g, '');
      const slashIdx = raw.indexOf('/');
      const domainName = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw;
      if (!domainName) {
        continue;
      }
      const domainId = `domain:${domainName}`;
      if (!domainsMap.has(domainName)) {
        domainsMap.set(domainName, { id: domainId, label: domainName });
      }
      edges.push({ from: `dev:${devName}`, to: domainId, label: `eth${index}` });
    }
  }

  return { devices, domains: Array.from(domainsMap.values()), edges };
}

function getWebviewContent(topology: TopologyData, webview: vscode.Webview): string {
  const { devices, domains, edges } = topology;

  const nodesArray = [
    ...devices.map((d) => ({
      id: d.id,
      label: d.label,
      shape: 'box',
      color: { background: '#4FC3F7', border: '#0277BD' },
      font: { color: '#000000' },
    })),
    ...domains.map((d) => ({
      id: d.id,
      label: d.label,
      shape: 'ellipse',
      color: { background: '#A5D6A7', border: '#2E7D32' },
      font: { color: '#000000' },
    })),
  ];

  const edgesArray = edges.map((e, i) => ({
    id: i,
    from: e.from,
    to: e.to,
    label: e.label,
    font: { size: 10, align: 'top' },
    color: { color: '#888888' },
  }));

  const nodesJson = JSON.stringify(nodesArray);
  const edgesJson = JSON.stringify(edgesArray);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kathara Topology</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    #header {
      padding: 8px 16px;
      background: var(--vscode-sideBar-background, var(--vscode-editorWidget-background));
      border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border, var(--vscode-panel-border)));
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-editor-foreground));
    }
    #legend {
      display: flex;
      gap: 20px;
      padding: 6px 16px;
      background: var(--vscode-sideBar-background, var(--vscode-editorWidget-background));
      border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border, var(--vscode-panel-border)));
      font-size: 11px;
      align-items: center;
      color: var(--vscode-editor-foreground);
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-box {
      width: 16px; height: 16px;
      border-radius: 3px;
      border: 2px solid var(--vscode-button-hoverBackground, var(--vscode-focusBorder));
      background: var(--vscode-button-background);
    }
    .legend-ellipse {
      width: 20px; height: 14px;
      border-radius: 50%;
      border: 2px solid var(--vscode-badge-background);
      background: var(--vscode-badge-background);
      opacity: 0.7;
    }
    .legend-hint {
      margin-left: auto;
      font-size: 10px;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      opacity: 0.7;
    }
    #network {
      flex: 1;
      min-height: 0;
      position: relative;
      background: var(--vscode-editor-background);
    }
    #empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="header">
    <strong>Kathara Topology</strong>
    &nbsp;·&nbsp;
    ${devices.length} device${devices.length !== 1 ? 's' : ''},
    ${domains.length} collision domain${domains.length !== 1 ? 's' : ''},
    ${edges.length} link${edges.length !== 1 ? 's' : ''}
  </div>
  <div id="legend">
    <div class="legend-item"><div class="legend-box"></div> Device</div>
    <div class="legend-item"><div class="legend-ellipse"></div> Collision Domain</div>
    <div class="legend-hint">
      Scroll to zoom &nbsp;·&nbsp; Drag canvas to pan &nbsp;·&nbsp; Drag nodes to move &nbsp;·&nbsp; Double-click to reset view
    </div>
  </div>
  ${
    nodesArray.length === 0
      ? '<div id="empty">No devices found in lab.conf</div>'
      : '<div id="network"></div>'
  }

  <script>
    window.addEventListener('load', function() {
      const nodes = ${nodesJson};
      const edges = ${edgesJson};

      if (nodes.length === 0) return;

      // ── Canvas setup ──────────────────────────────────────────────────────
      const container = document.getElementById('network');
      const canvas = document.createElement('canvas');
      const headerEl = document.getElementById('header');
      const legendEl = document.getElementById('legend');
      const reservedH = (headerEl ? headerEl.offsetHeight : 36) + (legendEl ? legendEl.offsetHeight : 32);

      function resizeCanvas() {
        canvas.width  = container.offsetWidth  || window.innerWidth;
        canvas.height = container.offsetHeight || Math.max(400, window.innerHeight - reservedH);
      }
      resizeCanvas();
      canvas.style.display = 'block';
      canvas.style.cursor  = 'default';
      container.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      // ── View transform (pan + zoom) ───────────────────────────────────────
      let panX = 0, panY = 0, scale = 1;
      const MIN_SCALE = 0.1, MAX_SCALE = 8;

      /** Convert a canvas-pixel position to world coordinates */
      function toWorld(sx, sy) {
        return { x: (sx - panX) / scale, y: (sy - panY) / scale };
      }

      /** Return raw canvas pixel from a mouse event */
      function canvasXY(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width  / rect.width),
          y: (e.clientY - rect.top)  * (canvas.height / rect.height),
        };
      }

      // ── Initial node layout ───────────────────────────────────────────────
      const pos = {};
      // World-space layout: use a virtual 800×600 canvas so positions are
      // independent of the actual window size
      const WW = 800, WH = 600;
      const cx = WW / 2, cy = WH / 2;
      const r  = Math.min(cx, cy) * 0.75;
      nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        pos[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });

      // ── Force simulation ─────────────────────────────────────────────────
      function simulate(steps) {
        const k = Math.sqrt((WW * WH) / nodes.length);
        for (let s = 0; s < steps; s++) {
          for (let i = 0; i < nodes.length; i++) {
            let fx = 0, fy = 0;
            for (let j = 0; j < nodes.length; j++) {
              if (i === j) continue;
              const dx = pos[nodes[i].id].x - pos[nodes[j].id].x;
              const dy = pos[nodes[i].id].y - pos[nodes[j].id].y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = (k * k) / dist;
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
            pos[nodes[i].id].x += fx * 0.01;
            pos[nodes[i].id].y += fy * 0.01;
          }
          for (const e of edges) {
            const p1 = pos[e.from], p2 = pos[e.to];
            if (!p1 || !p2) continue;
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist * dist) / k * 0.01;
            p1.x += (dx / dist) * force;  p1.y += (dy / dist) * force;
            p2.x -= (dx / dist) * force;  p2.y -= (dy / dist) * force;
          }
        }
      }

      simulate(200);

      // Center the simulated layout in the viewport initially
      function fitToView() {
        if (nodes.length === 0) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, pos[n.id].x);
          maxX = Math.max(maxX, pos[n.id].x);
          minY = Math.min(minY, pos[n.id].y);
          maxY = Math.max(maxY, pos[n.id].y);
        }
        const pad = 60;
        const contentW = maxX - minX + pad * 2;
        const contentH = maxY - minY + pad * 2;
        scale = Math.min(canvas.width / contentW, canvas.height / contentH, 2);
        panX  = canvas.width  / 2 - scale * ((minX + maxX) / 2);
        panY  = canvas.height / 2 - scale * ((minY + maxY) / 2);
      }
      fitToView();

      // ── Theme colors — read from VS Code CSS variables at draw time ────────
      function css(prop, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(prop).trim();
        return v || fallback;
      }
      function getColors() {
        return {
          edgeLine:       css('--vscode-editorWidget-border',            '#555555'),
          edgeLabel:      css('--vscode-descriptionForeground',          '#888888'),
          deviceFill:     css('--vscode-button-background',              '#0078d4'),
          deviceStroke:   css('--vscode-focusBorder',                    '#005fa3'),
          deviceText:     css('--vscode-button-foreground',              '#ffffff'),
          domainFill:     css('--vscode-badge-background',               '#4d4d4d'),
          domainStroke:   css('--vscode-activityBar-activeBorder',
                          css('--vscode-focusBorder',                    '#007acc')),
          domainText:     css('--vscode-badge-foreground',               '#ffffff'),
        };
      }

      // ── Drawing ───────────────────────────────────────────────────────────
      function draw() {
        const C = getColors();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, panX, panY);

        // Edges
        for (const e of edges) {
          const p1 = pos[e.from], p2 = pos[e.to];
          if (!p1 || !p2) continue;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = C.edgeLine;
          ctx.lineWidth = 1.5 / scale;
          ctx.stroke();
          if (e.label) {
            const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            ctx.fillStyle = C.edgeLabel;
            ctx.font = \`\${10 / scale}px var(--vscode-font-family, monospace)\`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(e.label, mx, my - 4 / scale);
          }
        }

        // Nodes
        for (const n of nodes) {
          const p = pos[n.id];
          if (!p) continue;
          const isDevice = n.shape === 'box';
          ctx.beginPath();
          if (isDevice) {
            const w = Math.max(n.label.length * 8 + 16, 60), h = 28, rad = 4;
            const x = p.x - w / 2, y = p.y - h / 2;
            ctx.moveTo(x + rad, y);
            ctx.lineTo(x + w - rad, y); ctx.arcTo(x + w, y,     x + w, y + rad,     rad);
            ctx.lineTo(x + w, y + h - rad); ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
            ctx.lineTo(x + rad, y + h); ctx.arcTo(x,     y + h, x,     y + h - rad, rad);
            ctx.lineTo(x, y + rad);     ctx.arcTo(x,     y,     x + rad, y,          rad);
            ctx.closePath();
            ctx.fillStyle   = C.deviceFill;
            ctx.strokeStyle = C.deviceStroke;
          } else {
            const rx = Math.max(n.label.length * 5 + 16, 40), ry = 20;
            ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 2 * Math.PI);
            ctx.fillStyle   = C.domainFill;
            ctx.strokeStyle = C.domainStroke;
          }
          ctx.fill();
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
          ctx.fillStyle = isDevice ? C.deviceText : C.domainText;
          ctx.font = \`bold \${12 / scale}px var(--vscode-font-family, monospace)\`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.label, p.x, p.y);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      draw();

      // ── Interaction state ─────────────────────────────────────────────────
      let mode = 'idle'; // 'idle' | 'dragging-node' | 'panning'
      let activeNode = null;
      let lastX = 0, lastY = 0;
      let nodeDragOffsetX = 0, nodeDragOffsetY = 0;

      function nodeRadius(n) {
        return n.shape === 'box' ? 40 : 40;
      }

      function hitTest(wx, wy) {
        // Test in reverse order so top-rendered nodes are picked first
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          const p = pos[n.id];
          if (!p) continue;
          if (n.shape === 'box') {
            const w = Math.max(n.label.length * 8 + 16, 60), h = 28;
            if (wx >= p.x - w/2 && wx <= p.x + w/2 && wy >= p.y - h/2 && wy <= p.y + h/2) return n;
          } else {
            const rx = Math.max(n.label.length * 5 + 16, 40), ry = 20;
            if (((wx - p.x) / rx) ** 2 + ((wy - p.y) / ry) ** 2 <= 1) return n;
          }
        }
        return null;
      }

      canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const { x: sx, y: sy } = canvasXY(e);
        const { x: wx, y: wy } = toWorld(sx, sy);
        const hit = hitTest(wx, wy);
        if (hit) {
          mode = 'dragging-node';
          activeNode = hit;
          nodeDragOffsetX = wx - pos[hit.id].x;
          nodeDragOffsetY = wy - pos[hit.id].y;
          canvas.style.cursor = 'grabbing';
        } else {
          mode = 'panning';
          lastX = sx; lastY = sy;
          canvas.style.cursor = 'grabbing';
        }
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        const { x: sx, y: sy } = canvasXY(e);
        if (mode === 'panning') {
          panX += sx - lastX;
          panY += sy - lastY;
          lastX = sx; lastY = sy;
          draw();
        } else if (mode === 'dragging-node') {
          const { x: wx, y: wy } = toWorld(sx, sy);
          pos[activeNode.id].x = wx - nodeDragOffsetX;
          pos[activeNode.id].y = wy - nodeDragOffsetY;
          draw();
        } else {
          // Hover cursor
          const { x: wx, y: wy } = toWorld(sx, sy);
          canvas.style.cursor = hitTest(wx, wy) ? 'grab' : 'default';
        }
      });

      window.addEventListener('mouseup', () => {
        mode = 'idle';
        activeNode = null;
        canvas.style.cursor = 'default';
      });

      // ── Zoom on scroll wheel ─────────────────────────────────────────────
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const { x: sx, y: sy } = canvasXY(e);
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * zoomFactor));
        // Zoom centered on the mouse position
        panX = sx - (sx - panX) * (newScale / scale);
        panY = sy - (sy - panY) * (newScale / scale);
        scale = newScale;
        draw();
      }, { passive: false });

      // ── Double-click to reset view ───────────────────────────────────────
      canvas.addEventListener('dblclick', (e) => {
        const { x: sx, y: sy } = canvasXY(e);
        const { x: wx, y: wy } = toWorld(sx, sy);
        // If hit a node, ignore; otherwise reset
        if (!hitTest(wx, wy)) {
          fitToView();
          draw();
        }
      });

      // ── Resize ───────────────────────────────────────────────────────────
      window.addEventListener('resize', () => {
        resizeCanvas();
        fitToView();
        draw();
      });

      // ── Redraw when VS Code theme changes (updates CSS vars on <body>) ───
      new MutationObserver(() => draw())
        .observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    });
  </script>
</body>
</html>`;
}

// ─── Topology View Provider ───────────────────────────────────────────────────

export class TopologyViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  async show(context: vscode.ExtensionContext): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'katharaTopology',
      'Kathara Topology',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        for (const d of this.disposables) {
          d.dispose();
        }
        this.disposables = [];
      },
      null,
      context.subscriptions,
    );

    // Auto-refresh on lab.conf changes
    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
      if (path.basename(e.document.fileName) === 'lab.conf' && this.panel) {
        this.refresh();
      }
    });
    this.disposables.push(watcher);

    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const labConfUri = await this.findLabConf();
    if (!labConfUri) {
      this.panel.webview.html = `<html><body style="background:#1e1e1e;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
        No lab.conf found in the workspace.
      </body></html>`;
      return;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(labConfUri);
      const text = Buffer.from(bytes).toString('utf-8');
      const parsed = parseLabConf(text);
      const topology = buildTopology(parsed);
      this.panel.webview.html = getWebviewContent(topology, this.panel.webview);
    } catch (err) {
      this.panel.webview.html = `<html><body>Error reading lab.conf: ${err}</body></html>`;
    }
  }

  private async findLabConf(): Promise<vscode.Uri | undefined> {
    // Prefer the currently active editor
    const active = vscode.window.activeTextEditor;
    if (active && path.basename(active.document.fileName) === 'lab.conf') {
      return active.document.uri;
    }
    const found = await vscode.workspace.findFiles('**/lab.conf', null, 1);
    return found[0];
  }
}
