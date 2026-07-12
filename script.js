// PaintPro core - 확장하기 쉬운 구조
// 새로운 도구를 추가하려면 Tool 인터페이스({name, label, onDown, onMove, onUp})를
// 구현해서 ToolManager.register()로 등록하면 됨.

class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.history = [];
    this.redoStack = [];
    this.saveState();
  }

  resize() {
    const wrap = document.getElementById('canvas-wrap');
    const w = Math.min(1200, wrap.clientWidth - 40);
    const h = Math.min(800, wrap.clientHeight - 40);
    if (!this._sized) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(0, 0, w, h);
      this._sized = true;
    }
  }

  saveState() {
    this.history.push(this.canvas.toDataURL());
    if (this.history.length > 50) this.history.shift();
    this.redoStack = [];
  }

  restore(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }

  undo() {
    if (this.history.length <= 1) return;
    this.redoStack.push(this.history.pop());
    this.restore(this.history[this.history.length - 1]);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const state = this.redoStack.pop();
    this.history.push(state);
    this.restore(state);
  }

  clear() {
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveState();
  }
}

class ToolManager {
  constructor(canvasManager, state) {
    this.cm = canvasManager;
    this.state = state; // { color, size }
    this.tools = {};
    this.groups = {};
    this.activeTool = null;
    this.isDrawing = false;
    this._bindEvents();
  }

  register(tool, group = 'general') {
    this.tools[tool.name] = tool;
    if (!this.groups[group]) this.groups[group] = [];
    this.groups[group].push(tool);
    if (!this.activeTool) this.setActive(tool.name);
  }

  setActive(name) {
    this.activeTool = this.tools[name];
    document.querySelectorAll('#tool-buttons button, #shape-buttons button').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === name);
    });
  }

  _pos(e) {
    const rect = this.cm.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _bindEvents() {
    const canvas = this.cm.canvas;
    const start = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const p = this._pos(e);
      if (this.activeTool?.onDown) {
        this.activeTool.onDown(p, this.cm.ctx, this.state);
      }
    };
    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const p = this._pos(e);
      if (this.activeTool?.onMove) {
        this.activeTool.onMove(p, this.cm.ctx, this.state);
      }
    };
    const end = (e) => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      if (this.activeTool?.onUp) {
        this.activeTool.onUp(this.cm.ctx, this.state);
      }
      this.cm.saveState();
    };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
  }
}

// 도형 툴 공통 헬퍼: 시작점을 잡고 드래그 중 스냅샷을 복원하며 미리보기를 그림.
function createShapeTool(name, label, drawFn) {
  return {
    name, label,
    onDown(p, ctx) {
      this.start = p;
      this.snapshot = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    onMove(p, ctx, state) {
      ctx.putImageData(this.snapshot, 0, 0);
      ctx.strokeStyle = state.color;
      ctx.fillStyle = state.color;
      ctx.lineWidth = state.size;
      ctx.lineJoin = 'round';
      drawFn(ctx, this.start, p, state);
    },
    onUp() {}
  };
}

// ---- 브러시 툴 ----
// 각 브러시는 (ctx, from, to, state)를 받아 한 스트로크 세그먼트를 그리는 stroke 함수를 정의.
function createBrushTool(name, label, setupFn, strokeFn) {
  return {
    name, label,
    onDown(p, ctx, state) {
      this.last = p;
      setupFn(ctx, state);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      strokeFn(ctx, p, p, state);
    },
    onMove(p, ctx, state) {
      strokeFn(ctx, this.last, p, state);
      this.last = p;
    },
    onUp() {}
  };
}

const PencilTool = createBrushTool('pencil', '연필',
  (ctx, state) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
  },
  (ctx, from, to, state) => {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
);

const MarkerTool = createBrushTool('marker', '마커',
  (ctx, state) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.55;
  },
  (ctx, from, to, state) => {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size * 2.2;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
);

const HighlighterTool = createBrushTool('highlighter', '형광펜',
  (ctx, state) => {
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
  },
  (ctx, from, to, state) => {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size * 3;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
);

const CalligraphyTool = createBrushTool('calligraphy', '캘리그라피',
  (ctx, state) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  },
  (ctx, from, to, state) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    const nib = Math.abs(Math.cos(angle - Math.PI / 4)) * state.size * 2.5 + state.size * 0.3;
    ctx.strokeStyle = state.color;
    ctx.lineWidth = nib;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
);

const SprayTool = createBrushTool('spray', '스프레이',
  (ctx, state) => {},
  (ctx, from, to, state) => {
    const density = 20 + state.size;
    const radius = state.size * 2;
    ctx.fillStyle = state.color;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const x = to.x + Math.cos(angle) * r;
      const y = to.y + Math.sin(angle) * r;
      ctx.fillRect(x, y, 1, 1);
    }
  }
);

const EraserTool = createBrushTool('eraser', '지우개',
  (ctx, state) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  },
  (ctx, from, to, state) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = state.size * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
);

// ---- 도형 툴 ----
const LineTool = createShapeTool('line', '직선', (ctx, start, p) => {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
});

const RectTool = createShapeTool('rect', '사각형', (ctx, start, p, state) => {
  const w = p.x - start.x, h = p.y - start.y;
  if (state.fillShape) ctx.fillRect(start.x, start.y, w, h);
  else ctx.strokeRect(start.x, start.y, w, h);
});

const CircleTool = createShapeTool('circle', '원', (ctx, start, p, state) => {
  const rx = Math.abs(p.x - start.x) / 2;
  const ry = Math.abs(p.y - start.y) / 2;
  const cx = (start.x + p.x) / 2;
  const cy = (start.y + p.y) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (state.fillShape) ctx.fill();
  else ctx.stroke();
});

const TriangleTool = createShapeTool('triangle', '삼각형', (ctx, start, p, state) => {
  ctx.beginPath();
  ctx.moveTo((start.x + p.x) / 2, start.y);
  ctx.lineTo(start.x, p.y);
  ctx.lineTo(p.x, p.y);
  ctx.closePath();
  if (state.fillShape) ctx.fill();
  else ctx.stroke();
});

const PolygonTool = createShapeTool('polygon', '다각형', (ctx, start, p, state) => {
  const sides = 5;
  const radius = Math.hypot(p.x - start.x, p.y - start.y);
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const x = start.x + radius * Math.cos(angle);
    const y = start.y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (state.fillShape) ctx.fill();
  else ctx.stroke();
});

// ---- 초기화 ----
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  const cm = new CanvasManager(canvas);
  const state = {
    color: document.getElementById('colorPicker').value,
    size: Number(document.getElementById('sizeRange').value),
    fillShape: document.getElementById('fillShape').checked
  };
  const tm = new ToolManager(cm, state);

  const brushes = [PencilTool, MarkerTool, HighlighterTool, CalligraphyTool, SprayTool, EraserTool];
  const shapes = [LineTool, RectTool, CircleTool, TriangleTool, PolygonTool];

  brushes.forEach(t => tm.register(t, 'brush'));
  shapes.forEach(t => tm.register(t, 'shape'));
  tm.setActive('pencil');

  function buildButtons(containerId, group) {
    const container = document.getElementById(containerId);
    group.forEach(tool => {
      const btn = document.createElement('button');
      btn.textContent = tool.label;
      btn.dataset.tool = tool.name;
      btn.addEventListener('click', () => tm.setActive(tool.name));
      container.appendChild(btn);
    });
  }
  buildButtons('tool-buttons', brushes);
  buildButtons('shape-buttons', shapes);

  document.getElementById('colorPicker').addEventListener('input', (e) => {
    state.color = e.target.value;
  });
  document.getElementById('sizeRange').addEventListener('input', (e) => {
    state.size = Number(e.target.value);
  });
  document.getElementById('fillShape').addEventListener('change', (e) => {
    state.fillShape = e.target.checked;
  });
  document.getElementById('undoBtn').addEventListener('click', () => cm.undo());
  document.getElementById('redoBtn').addEventListener('click', () => cm.redo());
  document.getElementById('clearBtn').addEventListener('click', () => cm.clear());
  document.getElementById('saveBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'paintpro.png';
    link.href = canvas.toDataURL();
    link.click();
  });
});
