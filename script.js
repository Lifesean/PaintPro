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

// ---- 왜곡(Distort) 기능 ----
// 숫자 값(강도)을 입력받아 캔버스 전체 픽셀을 파도/스월 형태로 왜곡시키는 필터.
// 다른 그림판에는 없는 PaintPro만의 차별화 기능.
function applyWaveDistortion(canvas, ctx, amount) {
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const srcData = src.data, dstData = dst.data;
  const freq = 0.04;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy) / maxR;
      const swirl = amount * 0.02 * (1 - r);
      const angle = Math.atan2(dy, dx) + swirl;
      const wave = Math.sin(y * freq + amount * 0.1) * amount * 0.5
                 + Math.cos(x * freq + amount * 0.1) * amount * 0.5;

      let sx = cx + Math.cos(angle) * Math.hypot(dx, dy) + wave;
      let sy = cy + Math.sin(angle) * Math.hypot(dx, dy) + wave;

      sx = Math.round(sx);
      sy = Math.round(sy);

      const idx = (y * w + x) * 4;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const sidx = (sy * w + sx) * 4;
        dstData[idx] = srcData[sidx];
        dstData[idx + 1] = srcData[sidx + 1];
        dstData[idx + 2] = srcData[sidx + 2];
        dstData[idx + 3] = srcData[sidx + 3];
      } else {
        dstData[idx] = 255;
        dstData[idx + 1] = 255;
        dstData[idx + 2] = 255;
        dstData[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// 국소 왜곡 브러시: 드래그하는 방향과 강도(state.distortAmount)에 비례하여
// 브러시 반경 안의 픽셀을 밀어내는 리퀴파이(liquify) 스타일 도구.
const DistortBrushTool = {
  name: 'distortBrush',
  label: '왜곡 브러시',
  onDown(p) {
    this.last = p;
  },
  onMove(p, ctx, state) {
    const dx = p.x - this.last.x;
    const dy = p.y - this.last.y;
    const strength = (state.distortAmount || 0) / 25;
    const radius = Math.max(10, state.size * 3);
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      warpArea(ctx, p, radius, dx, dy, strength);
    }
    this.last = p;
  },
  onUp() {}
};

function warpArea(ctx, center, radius, dx, dy, strength) {
  const canvas = ctx.canvas;
  const x0 = Math.max(0, Math.floor(center.x - radius));
  const y0 = Math.max(0, Math.floor(center.y - radius));
  const w = Math.min(canvas.width - x0, Math.ceil(radius * 2));
  const h = Math.min(canvas.height - y0, Math.ceil(radius * 2));
  if (w <= 0 || h <= 0) return;

  const src = ctx.getImageData(x0, y0, w, h);
  const dst = ctx.createImageData(w, h);
  const srcData = src.data, dstData = dst.data;
  const localCx = center.x - x0, localCy = center.y - y0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x - localCx, cy = y - localCy;
      const dist = Math.hypot(cx, cy);
      const idx = (y * w + x) * 4;
      let sx = x, sy = y;
      if (dist < radius) {
        const falloff = Math.pow(1 - dist / radius, 2);
        sx = x - dx * strength * falloff;
        sy = y - dy * strength * falloff;
      }
      const sxi = Math.round(sx), syi = Math.round(sy);
      if (sxi >= 0 && sxi < w && syi >= 0 && syi < h) {
        const sidx = (syi * w + sxi) * 4;
        dstData[idx] = srcData[sidx];
        dstData[idx + 1] = srcData[sidx + 1];
        dstData[idx + 2] = srcData[sidx + 2];
        dstData[idx + 3] = srcData[sidx + 3];
      } else {
        dstData[idx] = srcData[idx];
        dstData[idx + 1] = srcData[idx + 1];
        dstData[idx + 2] = srcData[idx + 2];
        dstData[idx + 3] = srcData[idx + 3];
      }
    }
  }
  ctx.putImageData(dst, x0, y0);
}

// ---- 초기화 ----
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  const cm = new CanvasManager(canvas);
  const state = {
    color: document.getElementById('colorPicker').value,
    size: Number(document.getElementById('sizeRange').value),
    fillShape: document.getElementById('fillShape').checked,
    distortAmount: Number(document.getElementById('distortAmount').value)
  };
  const tm = new ToolManager(cm, state);

  const brushes = [PencilTool, MarkerTool, HighlighterTool, CalligraphyTool, SprayTool, EraserTool, DistortBrushTool];
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
  document.getElementById('distortAmount').addEventListener('input', (e) => {
    state.distortAmount = Number(e.target.value);
  });
  document.getElementById('distortApplyBtn').addEventListener('click', () => {
    applyWaveDistortion(canvas, cm.ctx, state.distortAmount);
    cm.saveState();
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
