const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ── GRID ─────────────────────────────────
const COLS = 30;
const ROWS = 20;
const MAX_SCENES = 9;

// ── TILE IDs ──────────────────────────────
const TILE_ID_START  = 1;
const TILE_ID_END    = 4;
const TILE_ID_ERASER = 0;
const EMPTY          = null;

// ── STATE ─────────────────────────────────
let tileSize      = 24;
let scenes        = [makeEmptyScene()];
let currentScene  = 0;
let selectedTile  = 1;
let isPainting    = false;
let sceneToRemove = null;
let loadedMidiData = {};

window.__hasUnsavedChanges = false;
function markChanged() { window.__hasUnsavedChanges = true; }
function markSaved()   { window.__hasUnsavedChanges = false; }

function scene()    { return scenes[currentScene]; }
function sceneMap() { return scene().map; }

// ── SPRITE PATHS ──────────────────────────
// Segue o padrão: textures/blocks/<nome>.png
// IDs 1-5 existentes + novos a partir de 6
const SPRITE_PATHS = {
  // ── Lógica
  1:  "textures/blocks/start_level.png",
  4:  "textures/blocks/end_level.png",

  // ── Estrutura
  2:  "textures/blocks/bricks.png",
  6:  "textures/blocks/stone_block.png",
  7:  "textures/blocks/wood_block.png",
  8:  "textures/blocks/metal_block.png",
  9:  "textures/blocks/dirt_block.png",
  10: "textures/blocks/grass_block.png",
  11: "textures/blocks/sand_block.png",
  12: "textures/blocks/cloud_block.png",

  // ── Interação
  3:  "textures/blocks/lucky_block.png",
  5:  "textures/blocks/ice_excla_block.png",
  13: "textures/blocks/checkpoint_flag.png",
  14: "textures/blocks/checkpoint_flag_active.png",
  15: "textures/blocks/coin.png",
  16: "textures/blocks/spring.png",
  17: "textures/blocks/door.png",
  18: "textures/blocks/key.png",

  // ── Perigo
  19: "textures/blocks/spike.png",
  20: "textures/blocks/lava_block.png",
  21: "textures/blocks/fire.png",
  22: "textures/blocks/saw.png",

  // ── Movimento
  23: "textures/blocks/moving_platform.png",
  24: "textures/blocks/conveyor_left.png",
  25: "textures/blocks/conveyor_right.png",

  // ── Decoração
  26: "textures/blocks/bush.png",
  27: "textures/blocks/flower.png",
  28: "textures/blocks/mushroom.png",
  29: "textures/blocks/sign.png",
};

// ── TILE COLORS (fallback sem sprite) ─────
const TILE_COLORS = {
  // Lógica
  1:  { fill: "#00471f", stroke: "#00e07a", label: "S" },
  4:  { fill: "#5c0018", stroke: "#f03558", label: "E" },

  // Estrutura
  2:  { fill: "#6b2510", stroke: "#b84a30" },
  6:  { fill: "#404040", stroke: "#888888" },
  7:  { fill: "#5a3010", stroke: "#a06030" },
  8:  { fill: "#2a3040", stroke: "#6080b0" },
  9:  { fill: "#3d2b14", stroke: "#7a5530" },
  10: { fill: "#1a4010", stroke: "#40a020" },
  11: { fill: "#8a7040", stroke: "#c0a868" },
  12: { fill: "#c0c0d0", stroke: "#e0e0f0", label: "☁" },

  // Interação
  3:  { fill: "#7a5800", stroke: "#e8b840", label: "?" },
  5:  { fill: "#2a6080", stroke: "#7ecfef", label: "!" },
  13: { fill: "#1a4020", stroke: "#50c060", label: "⚑" },
  14: { fill: "#1a4020", stroke: "#f0c020", label: "⚐" },
  15: { fill: "#806000", stroke: "#f0c000", label: "¢" },
  16: { fill: "#404020", stroke: "#c0c040", label: "↑" },
  17: { fill: "#402810", stroke: "#a06840", label: "▭" },
  18: { fill: "#604010", stroke: "#e0b030", label: "⚿" },

  // Perigo
  19: { fill: "#401010", stroke: "#c03030", label: "▲" },
  20: { fill: "#601800", stroke: "#ff4800", label: "▓" },
  21: { fill: "#601000", stroke: "#ff6000", label: "🔥" },
  22: { fill: "#303030", stroke: "#909090", label: "⚙" },

  // Movimento
  23: { fill: "#203050", stroke: "#4080c0", label: "↔" },
  24: { fill: "#202040", stroke: "#6060c0", label: "◄" },
  25: { fill: "#202040", stroke: "#c06060", label: "►" },

  // Decoração
  26: { fill: "#103010", stroke: "#30a030", label: "🌿" },
  27: { fill: "#401040", stroke: "#e040e0", label: "✿" },
  28: { fill: "#401010", stroke: "#e04040", label: "🍄" },
  29: { fill: "#302010", stroke: "#a08040", label: "!" },
};

// ── SPRITES ───────────────────────────────
const sprites = {};
let spritesReady = 0;

function loadSprites() {
  for (const [id, path] of Object.entries(SPRITE_PATHS)) {
    const img = new Image();
    img.src = path;
    img.addEventListener("load", () => {
      sprites[id] = img;
      spritesReady++;
      draw();
      renderScenePreviews();
    });
    img.addEventListener("error", () => {
      spritesReady++;
    });
  }
}

// ── SCENE FACTORY ─────────────────────────
function makeEmptyScene() {
  return { map: makeEmptyMap(), startPos: null, endPos: null };
}

function makeEmptyMap() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

// ── CANVAS SIZING ─────────────────────────
function sizeCanvas() {
  const area = document.getElementById("canvas-area");
  const aw = area.clientWidth  - 40;
  const ah = area.clientHeight - 60;
  tileSize = Math.max(12, Math.floor(Math.min(aw / COLS, ah / ROWS)));
  canvas.width  = tileSize * COLS;
  canvas.height = tileSize * ROWS;
  draw();
}

window.addEventListener("resize", sizeCanvas);

// ── DRAW MAIN CANVAS ──────────────────────
function drawTile(x, y, id) {
  const px  = x * tileSize;
  const py  = y * tileSize;
  const img = sprites[id];

  if (img) {
    ctx.drawImage(img, px, py, tileSize, tileSize);
  } else {
    const c = TILE_COLORS[id];
    if (!c) return;
    ctx.fillStyle = c.fill;
    ctx.fillRect(px, py, tileSize, tileSize);
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
    if (c.label && tileSize >= 16) {
      ctx.fillStyle    = c.stroke + "cc";
      ctx.font         = `bold ${Math.max(8, Math.floor(tileSize * 0.38))}px 'Share Tech Mono', monospace`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label, px + tileSize / 2, py + tileSize / 2);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#070911";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const m = sceneMap();
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (m[y][x] !== EMPTY) drawTile(x, y, m[y][x]);

  ctx.strokeStyle = "#1a2030";
  ctx.lineWidth   = 1;
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * tileSize); ctx.lineTo(canvas.width, y * tileSize); ctx.stroke();
  }
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * tileSize, 0); ctx.lineTo(x * tileSize, canvas.height); ctx.stroke();
  }
}

// ── SCENE PREVIEW THUMBNAILS ──────────────
const PREV_W = 90;
const PREV_H = 60;
const PREV_TILE = PREV_W / COLS;

function drawPreview(sc, canvasEl) {
  const c = canvasEl.getContext("2d");
  c.clearRect(0, 0, PREV_W, PREV_H);
  c.fillStyle = "#070911";
  c.fillRect(0, 0, PREV_W, PREV_H);

  const m = sc.map;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = m[y][x];
      if (id === EMPTY) continue;
      const px = x * PREV_TILE;
      const py = y * PREV_TILE;
      const img = sprites[id];
      if (img) {
        c.drawImage(img, px, py, PREV_TILE, PREV_H / ROWS);
      } else {
        const col = TILE_COLORS[id];
        if (!col) continue;
        c.fillStyle = col.fill;
        c.fillRect(px, py, PREV_TILE, PREV_H / ROWS);
      }
    }
  }
}

function renderScenePreviews() {
  const container = document.getElementById("scene-previews");
  container.innerHTML = "";

  scenes.forEach((sc, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "scene-thumb" + (idx === currentScene ? " active" : "");
    wrapper.dataset.idx = idx;

    const cvs = document.createElement("canvas");
    cvs.width  = PREV_W;
    cvs.height = PREV_H;
    drawPreview(sc, cvs);

    const label = document.createElement("div");
    label.className = "scene-label";
    label.textContent = `CENA ${idx + 1}`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "scene-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remover cena";
    removeBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (scenes.length <= 1) return;
      sceneToRemove = idx;
      document.getElementById("modal-remove-overlay").classList.add("open");
    });

    wrapper.addEventListener("click", () => {
      currentScene = idx;
      draw();
      updateStatus();
      renderScenePreviews();
    });

    wrapper.appendChild(cvs);
    wrapper.appendChild(label);
    if (scenes.length > 1) wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
  });
}

// ── PAINT ─────────────────────────────────
function paint(e) {
  const rect = canvas.getBoundingClientRect();
  const x    = Math.floor((e.clientX - rect.left) / tileSize);
  const y    = Math.floor((e.clientY - rect.top)  / tileSize);

  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;

  const sc      = scene();
  const current = sc.map[y][x];
  let needFullPreviewRefresh = false;

  if (selectedTile === TILE_ID_ERASER) {
    if (current === TILE_ID_START) sc.startPos = null;
    if (current === TILE_ID_END)   sc.endPos   = null;
    sc.map[y][x] = EMPTY;
  } else if (selectedTile === TILE_ID_START) {
    scenes.forEach((s, i) => {
      if (i !== currentScene && s.startPos) {
        s.map[s.startPos.y][s.startPos.x] = EMPTY;
        s.startPos = null;
        needFullPreviewRefresh = true;
      }
    });
    if (sc.startPos) sc.map[sc.startPos.y][sc.startPos.x] = EMPTY;
    sc.startPos  = { x, y };
    sc.map[y][x] = TILE_ID_START;
  } else if (selectedTile === TILE_ID_END) {
    scenes.forEach((s, i) => {
      if (i !== currentScene && s.endPos) {
        s.map[s.endPos.y][s.endPos.x] = EMPTY;
        s.endPos = null;
        needFullPreviewRefresh = true;
      }
    });
    if (sc.endPos) sc.map[sc.endPos.y][sc.endPos.x] = EMPTY;
    sc.endPos    = { x, y };
    sc.map[y][x] = TILE_ID_END;
  } else {
    if (current === TILE_ID_START) sc.startPos = null;
    if (current === TILE_ID_END)   sc.endPos   = null;
    sc.map[y][x] = selectedTile;
  }

  markChanged();
  draw();
  updateStatus();

  if (needFullPreviewRefresh) {
    renderScenePreviews();
  } else {
    const thumbs = document.querySelectorAll(".scene-thumb");
    if (thumbs[currentScene]) {
      const cvs = thumbs[currentScene].querySelector("canvas");
      if (cvs) drawPreview(sc, cvs);
    }
  }
  if (selectedTile !== TILE_ID_ERASER && sc.map[y][x] !== EMPTY) addRecent(selectedTile);
}

// ── MOUSE EVENTS ──────────────────────────
canvas.addEventListener("mousedown", e => { isPainting = true; paint(e); });

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / tileSize);
  const y = Math.floor((e.clientY - rect.top)  / tileSize);
  const txt = (x >= 0 && x < COLS && y >= 0 && y < ROWS) ? `X: ${x} | Y: ${y}` : "X: — | Y: —";
  document.getElementById("coords-display").textContent  = txt;
  document.getElementById("bottom-coords").textContent   = "CURSOR: " + txt;
  if (isPainting) paint(e);
});

canvas.addEventListener("mouseup",    () => { isPainting = false; });
canvas.addEventListener("mouseleave", () => { isPainting = false; });

// ── BLOCK REGISTRY ────────────────────────
// Cada bloco tem: id, name, desc, category, tags, previewStyle, previewLabel
const BLOCK_REGISTRY = [

  // ── LÓGICA ──────────────────────────────
  {
    id: 1,
    name: "START",
    desc: "Ponto inicial do nível",
    category: "logica",
    tags: ["start", "inicio", "começo", "spawn", "jogador"],
    previewStyle: "background:#00471f; border-color:#00e07a40;",
    previewLabel: { text: "S", color: "#00e07a" },
  },
  {
    id: 4,
    name: "END",
    desc: "Ponto final do nível",
    category: "logica",
    tags: ["end", "fim", "saida", "meta", "goal", "completo"],
    previewStyle: "background:#5c0018; border-color:#f0355540;",
    previewLabel: { text: "E", color: "#f03558" },
  },

  // ── ESTRUTURA ────────────────────────────
  {
    id: 2,
    name: "Tijolo",
    desc: "Bloco sólido básico",
    category: "estrutura",
    tags: ["tijolo", "brick", "solido", "chao", "parede", "basico"],
    previewStyle: "background:#6b2510; border-color:#b84a3040;",
    previewLabel: null,
  },
  {
    id: 6,
    name: "Pedra",
    desc: "Bloco de pedra resistente",
    category: "estrutura",
    tags: ["pedra", "stone", "rock", "solido", "duro"],
    previewStyle: "background:#404040; border-color:#88888840;",
    previewLabel: null,
  },
  {
    id: 7,
    name: "Madeira",
    desc: "Bloco de madeira",
    category: "estrutura",
    tags: ["madeira", "wood", "log", "plataforma"],
    previewStyle: "background:#5a3010; border-color:#a0603040;",
    previewLabel: null,
  },
  {
    id: 8,
    name: "Metal",
    desc: "Bloco metálico sólido",
    category: "estrutura",
    tags: ["metal", "aco", "ferro", "solido", "duro"],
    previewStyle: "background:#2a3040; border-color:#6080b040;",
    previewLabel: null,
  },
  {
    id: 9,
    name: "Terra",
    desc: "Bloco de terra",
    category: "estrutura",
    tags: ["terra", "dirt", "solo", "chao"],
    previewStyle: "background:#3d2b14; border-color:#7a553040;",
    previewLabel: null,
  },
  {
    id: 10,
    name: "Grama",
    desc: "Bloco de grama",
    category: "estrutura",
    tags: ["grama", "grass", "verde", "chao", "topo"],
    previewStyle: "background:#1a4010; border-color:#40a02040;",
    previewLabel: null,
  },
  {
    id: 11,
    name: "Areia",
    desc: "Bloco de areia",
    category: "estrutura",
    tags: ["areia", "sand", "praia", "deserto"],
    previewStyle: "background:#8a7040; border-color:#c0a86840;",
    previewLabel: null,
  },
  {
    id: 12,
    name: "Nuvem",
    desc: "Plataforma de nuvem",
    category: "estrutura",
    tags: ["nuvem", "cloud", "ceu", "plataforma", "flutuante"],
    previewStyle: "background:#c0c0d0; border-color:#e0e0f040;",
    previewLabel: { text: "☁", color: "#8888aa" },
  },

  // ── INTERAÇÃO ────────────────────────────
  {
    id: 3,
    name: "Lucky Block",
    desc: "Bloco surpresa com item",
    category: "interacao",
    tags: ["lucky", "sorte", "surpresa", "item", "bonus", "caixa"],
    previewStyle: "background:#7a5800; border-color:#e8b84040;",
    previewLabel: { text: "?", color: "#e8b840" },
  },
  {
    id: 5,
    name: "Bloco de Gelo",
    desc: "Superfície escorregadia",
    category: "interacao",
    tags: ["gelo", "ice", "frio", "especial", "deslizante", "escorregadio"],
    previewStyle: "background:#2a6080; border-color:#7ecfef40;",
    previewLabel: { text: "!", color: "#7ecfef" },
  },
  {
    id: 13,
    name: "Checkpoint",
    desc: "Bandeira de checkpoint",
    category: "interacao",
    tags: ["checkpoint", "bandeira", "flag", "save", "salvar", "ponto", "meio"],
    previewStyle: "background:#1a4020; border-color:#50c06040;",
    previewLabel: { text: "⚑", color: "#50c060" },
  },
  {
    id: 14,
    name: "Checkpoint Ativo",
    desc: "Bandeira de checkpoint ativada",
    category: "interacao",
    tags: ["checkpoint", "bandeira", "flag", "ativo", "salvo", "dourado"],
    previewStyle: "background:#1a4020; border-color:#f0c02040;",
    previewLabel: { text: "⚐", color: "#f0c020" },
  },
  {
    id: 15,
    name: "Moeda",
    desc: "Moeda coletável",
    category: "interacao",
    tags: ["moeda", "coin", "ouro", "coletavel", "pontos"],
    previewStyle: "background:#806000; border-color:#f0c00040;",
    previewLabel: { text: "¢", color: "#f0c000" },
  },
  {
    id: 16,
    name: "Mola",
    desc: "Impulsiona o jogador para cima",
    category: "interacao",
    tags: ["mola", "spring", "pulo", "salto", "impulso"],
    previewStyle: "background:#404020; border-color:#c0c04040;",
    previewLabel: { text: "↑", color: "#c0c040" },
  },
  {
    id: 17,
    name: "Porta",
    desc: "Porta de passagem de cena",
    category: "interacao",
    tags: ["porta", "door", "passagem", "saida", "entrada", "cena"],
    previewStyle: "background:#402810; border-color:#a0684040;",
    previewLabel: { text: "▭", color: "#a06840" },
  },
  {
    id: 18,
    name: "Chave",
    desc: "Chave para abrir portas",
    category: "interacao",
    tags: ["chave", "key", "porta", "destrancar", "coletavel"],
    previewStyle: "background:#604010; border-color:#e0b03040;",
    previewLabel: { text: "⚿", color: "#e0b030" },
  },

  // ── PERIGO ───────────────────────────────
  {
    id: 19,
    name: "Espinho",
    desc: "Mata o jogador ao tocar",
    category: "perigo",
    tags: ["espinho", "spike", "morte", "perigo", "dano", "armadilha"],
    previewStyle: "background:#401010; border-color:#c0303040;",
    previewLabel: { text: "▲", color: "#c03030" },
  },
  {
    id: 20,
    name: "Lava",
    desc: "Lava — morte instantânea",
    category: "perigo",
    tags: ["lava", "fogo", "quente", "morte", "perigo", "derrete"],
    previewStyle: "background:#601800; border-color:#ff480040;",
    previewLabel: { text: "▓", color: "#ff4800" },
  },
  {
    id: 21,
    name: "Fogo",
    desc: "Chama que causa dano",
    category: "perigo",
    tags: ["fogo", "fire", "chama", "queimar", "dano", "perigo"],
    previewStyle: "background:#601000; border-color:#ff600040;",
    previewLabel: { text: "↑", color: "#ff6000" },
  },
  {
    id: 22,
    name: "Serra",
    desc: "Serra giratória perigosa",
    category: "perigo",
    tags: ["serra", "saw", "lamina", "corte", "morte", "perigo"],
    previewStyle: "background:#303030; border-color:#90909040;",
    previewLabel: { text: "⚙", color: "#909090" },
  },

  // ── MOVIMENTO ────────────────────────────
  {
    id: 23,
    name: "Plat. Móvel",
    desc: "Plataforma que se move",
    category: "movimento",
    tags: ["plataforma", "movel", "moving", "platform", "desloca", "vai"],
    previewStyle: "background:#203050; border-color:#4080c040;",
    previewLabel: { text: "↔", color: "#4080c0" },
  },
  {
    id: 24,
    name: "Esteira ◄",
    desc: "Esteira que empurra à esquerda",
    category: "movimento",
    tags: ["esteira", "conveyor", "esquerda", "left", "empurra", "desloca"],
    previewStyle: "background:#202040; border-color:#6060c040;",
    previewLabel: { text: "◄", color: "#6060c0" },
  },
  {
    id: 25,
    name: "Esteira ►",
    desc: "Esteira que empurra à direita",
    category: "movimento",
    tags: ["esteira", "conveyor", "direita", "right", "empurra", "desloca"],
    previewStyle: "background:#202040; border-color:#c0606040;",
    previewLabel: { text: "►", color: "#c06060" },
  },

  // ── DECORAÇÃO ────────────────────────────
  {
    id: 26,
    name: "Arbusto",
    desc: "Decoração — arbusto",
    category: "decoracao",
    tags: ["arbusto", "bush", "planta", "verde", "decoracao", "fundo"],
    previewStyle: "background:#103010; border-color:#30a03040;",
    previewLabel: { text: "🌿", color: "#30a030" },
  },
  {
    id: 27,
    name: "Flor",
    desc: "Decoração — flor",
    category: "decoracao",
    tags: ["flor", "flower", "planta", "decoracao", "colorido"],
    previewStyle: "background:#401040; border-color:#e040e040;",
    previewLabel: { text: "✿", color: "#e040e0" },
  },
  {
    id: 28,
    name: "Cogumelo",
    desc: "Decoração — cogumelo",
    category: "decoracao",
    tags: ["cogumelo", "mushroom", "fungo", "decoracao"],
    previewStyle: "background:#401010; border-color:#e0404040;",
    previewLabel: { text: "🍄", color: "#e04040" },
  },
  {
    id: 29,
    name: "Placa",
    desc: "Placa de aviso decorativa",
    category: "decoracao",
    tags: ["placa", "sign", "aviso", "decoracao", "texto", "mensagem"],
    previewStyle: "background:#302010; border-color:#a0804040;",
    previewLabel: { text: "!", color: "#a08040" },
  },
];

// ── FAVORITES & RECENTS ───────────────────
let favorites = new Set();
let recents   = [];

function addRecent(id) {
  recents = [id, ...recents.filter(r => r !== id)].slice(0, 8);
}

// ── BLOCK FILTER STATE ────────────────────
let activeCategory = "todos";
let searchQuery    = "";

function getFilteredBlocks() {
  let pool = BLOCK_REGISTRY;
  if (activeCategory === "favoritos") {
    pool = pool.filter(b => favorites.has(b.id));
  } else if (activeCategory === "recentes") {
    pool = recents.map(id => BLOCK_REGISTRY.find(b => b.id === id)).filter(Boolean);
  } else if (activeCategory !== "todos") {
    pool = pool.filter(b => b.category === activeCategory);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    pool = pool.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.desc.toLowerCase().includes(q) ||
      b.tags.some(t => t.includes(q))
    );
  }
  return pool;
}

function renderBlockGrid() {
  const grid   = document.getElementById("block-grid");
  const blocks = getFilteredBlocks();
  grid.innerHTML = "";

  if (blocks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "block-empty";
    empty.textContent = "Nenhum bloco encontrado";
    grid.appendChild(empty);
    return;
  }

  // Agrupa por categoria se mostrando "todos" sem busca
  if (activeCategory === "todos" && !searchQuery.trim()) {
    const categoryOrder = ["logica", "estrutura", "interacao", "perigo", "movimento", "decoracao"];
    const categoryLabels = {
      logica:     "Lógica",
      estrutura:  "Estrutura",
      interacao:  "Interação",
      perigo:     "Perigo",
      movimento:  "Movimento",
      decoracao:  "Decoração",
    };

    categoryOrder.forEach(cat => {
      const catBlocks = blocks.filter(b => b.category === cat);
      if (catBlocks.length === 0) return;

      const header = document.createElement("div");
      header.className = "block-category-header";
      header.textContent = categoryLabels[cat];
      grid.appendChild(header);

      // Subgrid independente para cada categoria
      const subgrid = document.createElement("div");
      subgrid.className = "block-subgrid";
      catBlocks.forEach(block => subgrid.appendChild(makeBlockCell(block)));
      grid.appendChild(subgrid);
    });
  } else {
    // Sem agrupamento: subgrid único
    const subgrid = document.createElement("div");
    subgrid.className = "block-subgrid";
    blocks.forEach(block => subgrid.appendChild(makeBlockCell(block)));
    grid.appendChild(subgrid);
  }
}

function makeBlockCell(block) {
  const cell = document.createElement("div");
  cell.className = "block-cell" + (selectedTile === block.id ? " active" : "");
  cell.dataset.id = block.id;

  const preview = document.createElement("div");
  preview.className = "cell-preview";
  preview.style.cssText = block.previewStyle;

  if (sprites[block.id]) {
    const img = document.createElement("img");
    img.src = sprites[block.id].src;
    img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:3px; display:block;";
    preview.innerHTML = "";
    preview.appendChild(img);
  } else if (block.previewLabel) {
    preview.innerHTML = `<span style="color:${block.previewLabel.color}; font-size:12px;">${block.previewLabel.text}</span>`;
  }

  const name = document.createElement("span");
  name.className = "cell-name";
  name.textContent = block.name;

  // Tooltip com descrição
  cell.title = block.desc;

  const favBtn = document.createElement("button");
  favBtn.className = "fav-btn" + (favorites.has(block.id) ? " fav-on" : "");
  favBtn.textContent = "★";
  favBtn.title = "Favoritar";

  favBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (favorites.has(block.id)) favorites.delete(block.id);
    else favorites.add(block.id);
    renderBlockGrid();
  });

  cell.addEventListener("click", () => {
    selectedTile = block.id;
    document.getElementById("eraser-item").classList.remove("active");
    renderBlockGrid();
  });

  cell.append(preview, name, favBtn);
  return cell;
}

// ── CATEGORY FILTER BUTTONS ───────────────
document.getElementById("cat-filters").addEventListener("click", e => {
  const btn = e.target.closest(".cat-btn");
  if (!btn) return;
  activeCategory = btn.dataset.cat;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderBlockGrid();
});

document.getElementById("block-search").addEventListener("input", e => {
  searchQuery = e.target.value;
  renderBlockGrid();
});

document.getElementById("eraser-item").addEventListener("click", () => {
  selectedTile = TILE_ID_ERASER;
  document.getElementById("eraser-item").classList.add("active");
  renderBlockGrid();
});

// ── ADD SCENE ─────────────────────────────
document.getElementById("addScene").addEventListener("click", () => {
  if (scenes.length >= MAX_SCENES) return;
  scenes.push(makeEmptyScene());
  currentScene = scenes.length - 1;
  markChanged();
  draw();
  updateStatus();
  renderScenePreviews();
});

// ── STATUS ────────────────────────────────
function updateStatus() {
  const sc = scene();
  const stStart  = document.getElementById("st-start");
  const stEnd    = document.getElementById("st-end");
  const stTiles  = document.getElementById("st-tiles");
  const stScenes = document.getElementById("st-scenes");
  const sceneNum = document.getElementById("scene-num");

  sceneNum.textContent = currentScene + 1;

  stStart.textContent = sc.startPos ? "✓" : "✗";
  stStart.className   = `status-badge ${sc.startPos ? "badge-on" : "badge-off"}`;
  stEnd.textContent   = sc.endPos   ? "✓" : "✗";
  stEnd.className     = `status-badge ${sc.endPos   ? "badge-on" : "badge-off"}`;

  let count = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (sc.map[y][x] !== EMPTY) count++;
  stTiles.textContent  = count;
  stScenes.textContent = scenes.length;

  const addSceneBtn = document.getElementById("addScene");
  addSceneBtn.style.display = scenes.length >= MAX_SCENES ? "none" : "";
}

// ── MODAL LIMPAR ──────────────────────────
const modalOverlay = document.getElementById("modal-overlay");
const modalCancel  = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");

document.getElementById("clearMap").addEventListener("click", () => {
  modalOverlay.classList.add("open");
});
modalCancel.addEventListener("click", () => { modalOverlay.classList.remove("open"); });
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) modalOverlay.classList.remove("open"); });

modalConfirm.addEventListener("click", () => {
  scenes[currentScene] = makeEmptyScene();
  markChanged();
  draw();
  updateStatus();
  renderScenePreviews();
  modalOverlay.classList.remove("open");
});

// ── MODAL REMOVER CENA ────────────────────
const modalRemoveOverlay = document.getElementById("modal-remove-overlay");
document.getElementById("modal-remove-cancel").addEventListener("click", () => {
  modalRemoveOverlay.classList.remove("open");
  sceneToRemove = null;
});
modalRemoveOverlay.addEventListener("click", e => {
  if (e.target === modalRemoveOverlay) { modalRemoveOverlay.classList.remove("open"); sceneToRemove = null; }
});
document.getElementById("modal-remove-confirm").addEventListener("click", () => {
  if (sceneToRemove === null) return;
  scenes.splice(sceneToRemove, 1);
  if (currentScene >= scenes.length) currentScene = scenes.length - 1;
  markChanged();
  draw();
  updateStatus();
  renderScenePreviews();
  modalRemoveOverlay.classList.remove("open");
  sceneToRemove = null;
});

// ── ESC fecha modais ──────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    modalOverlay.classList.remove("open");
    modalRemoveOverlay.classList.remove("open");
    sceneToRemove = null;
  }
});

// ── SALVAR .lvl ───────────────────────────
function buildDataBlock(entries) {
  const GROUP  = 9;
  const indent = "                ";
  const lines  = [];
  for (let i = 0; i < entries.length; i += GROUP)
    lines.push(indent + entries.slice(i, i + GROUP).map(e => `"${e}"`).join(", "));
  return "[\n" + lines.join(",\n") + "\n            ]";
}

document.getElementById("saveMap").addEventListener("click", async () => {
  const levelName        = document.getElementById("level-name").value        || "";
  const levelDescription = document.getElementById("level-description").value || "";
  const levelAuthor      = document.getElementById("level-author").value      || "";

  const scenesData = scenes.map(sc => {
    const entries = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        entries.push(String(sc.map[y][x] === EMPTY ? 0 : sc.map[y][x]).padStart(3, "0"));
    return buildDataBlock(entries);
  });

  const dataStr = "[\n" + scenesData.map(s => "            " + s).join(",\n") + "\n        ]";

  const json =
`{
    "level": {
        "information": {
            "name": ${JSON.stringify(levelName)},
            "description": ${JSON.stringify(levelDescription)},
            "author": ${JSON.stringify(levelAuthor)}
        },
        "data": ${dataStr}
    }
}`;

  try { JSON.parse(json); } catch (err) {
    alert("Erro interno: JSON inválido. Veja o console.");
    console.error(err);
    return;
  }

  const zip = new JSZip();
  zip.file("LEVEL_DATA.json", json);
  const midiFolder = zip.folder("MIDI_DATA");
  for (const [name, data] of Object.entries(loadedMidiData)) {
    midiFolder.file(name, data);
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${levelName || "map"}.lvl`;
  a.click();
  URL.revokeObjectURL(url);
  markSaved();
});

// ── ABRIR .lvl / .json ────────────────────
function applyLevelJson(jsonText) {
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch {
    alert("Erro: JSON inválido.");
    return;
  }

  const info = parsed?.level?.information;
  const data = parsed?.level?.data;

  if (!Array.isArray(data)) {
    alert("Erro: formato de nível inválido (campo 'data' ausente ou incorreto).");
    return;
  }

  document.getElementById("level-name").value        = info?.name        ?? "";
  document.getElementById("level-description").value = info?.description ?? "";
  document.getElementById("level-author").value      = info?.author      ?? "";

  const scenesRaw = Array.isArray(data[0]) ? data : [data];

  scenes = scenesRaw.map(rawScene => {
    const sc = makeEmptyScene();
    rawScene.forEach((entry, i) => {
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      if (y >= ROWS) return;
      const cellId = parseInt(entry, 10);
      if (isNaN(cellId) || cellId === 0) return;
      sc.map[y][x] = cellId;
      if (cellId === TILE_ID_START) sc.startPos = { x, y };
      if (cellId === TILE_ID_END)   sc.endPos   = { x, y };
    });
    return sc;
  });

  currentScene = 0;
  markChanged();
  draw();
  updateStatus();
  renderScenePreviews();
}

document.getElementById("openMap").addEventListener("click", () => {
  const input  = document.createElement("input");
  input.type   = "file";
  input.accept = ".lvl,.json,application/json";

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    if (file.name.endsWith(".lvl")) {
      let zip;
      try {
        const buf = await file.arrayBuffer();
        zip = await JSZip.loadAsync(buf);
      } catch {
        alert("Erro: arquivo .lvl inválido (ZIP corrompido).");
        return;
      }

      const jsonEntry = zip.file("LEVEL_DATA.json");
      if (!jsonEntry) {
        alert("Erro: arquivo .lvl não contém LEVEL_DATA.json.");
        return;
      }

      loadedMidiData = {};
      for (const [path, entry] of Object.entries(zip.files)) {
        if (path.startsWith("MIDI_DATA/") && !entry.dir) {
          loadedMidiData[path.replace("MIDI_DATA/", "")] = await entry.async("uint8array");
        }
      }

      const jsonText = await jsonEntry.async("string");
      applyLevelJson(jsonText);
    } else {
      loadedMidiData = {};
      const reader = new FileReader();
      reader.addEventListener("load", () => applyLevelJson(reader.result));
      reader.readAsText(file);
    }
  });

  input.click();
});

// ── INIT ──────────────────────────────────
["level-name", "level-description", "level-author"].forEach(id => {
  document.getElementById(id).addEventListener("input", markChanged);
});

sizeCanvas();
updateStatus();
renderBlockGrid();
renderScenePreviews();
loadSprites();
