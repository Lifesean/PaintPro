// PaintPro core - 확장하기 쉬운 구조
// 새로운 도구를 추가하려면 Tool 인터페이스({name, icon, onDown, onMove, onUp})를
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
    this.activeTool = null;
    this.isDrawing = false;
    this._bindEvents();
  }

  register(tool) {
    this.tools[tool.name] = tool;
    if (!this.activeTool) this.setActive(tool.name);
  }

  setActive(name) {
    this.activeTool = this.tools[name];
    document.querySelectorAll('#tool-buttons button').forEach(b => {
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

// ---- 기본 도구들 ----
// 각 도구는 { name, label, onDown, onMove, onUp } 형태의 객체.
// onDown/onMove는 (point, ctx, state)를 받고, onUp은 (ctx, state)를 받음.

const PencilTool = {
  name: 'pencil',
  label: '연필',
  onDown(p, ctx, state) {
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  },
  onMove(p, ctx) {
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  },
  onUp() {}
};

const EraserTool = {
  name: 'eraser',
  label: '지우개',
  onDown(p, ctx, state) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = state.size * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  },
  onMove(p, ctx) {
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  },
  onUp() {}
};

const LineTool = {
  name: 'line',
  label: '직선',
  onDown(p, ctx, state) {
    this.start = p;
    this.snapshot = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  },
  onMove(p, ctx, state) {
    ctx.putImageData(this.snapshot, 0, 0);
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  },
  onUp() {}
};

const RectTool = {
  name: 'rect',
  label: '사각형',
  onDown(p, ctx) {
    this.start = p;
    this.snapshot = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  },
  onMove(p, ctx, state) {
    ctx.putImageData(this.snapshot, 0, 0);
    ctx.strokeStyle = state.color;
    ctx.lineWidth = state.size;
    ctx.strokeRect(this.start.x, this.start.y, p.x - this.start.x, p.y - this.start.y);
  },
  onUp() {}
};

// ---- 초기화 ----
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  const cm = new CanvasManager(canvas);
  const state = {
    color: document.getElementById('colorPicker').value,
    size: Number(document.getElementById('sizeRange').value)
  };
  const tm = new ToolManager(cm, state);

  [PencilTool, EraserTool, LineTool, RectTool].forEach(t => tm.register(t));

  const toolButtons = document.getElementById('tool-buttons');
  Object.values(tm.tools).forEach(tool => {
    const btn = document.createElement('button');
    btn.textContent = tool.label;
    btn.dataset.tool = tool.name;
    btn.addEventListener('click', () => tm.setActive(tool.name));
    toolButtons.appendChild(btn);
  });
  tm.setActive('pencil');

  document.getElementById('colorPicker').addEventListener('input', (e) => {
    state.color = e.target.value;
  });
  document.getElementById('sizeRange').addEventListener('input', (e) => {
    state.size = Number(e.target.value);
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
