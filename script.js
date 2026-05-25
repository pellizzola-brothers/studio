const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ── GRID ─────────────────────────────────
const COLS = 30;
const ROWS = 20;
const MAX_SCENES = 9;

// ── TILE IDs ──────────────────────────────
// Blocos (tiles sólidos colocados no mapa)
const TILE_ID_START  = 1;
const TILE_ID_END    = 2;
const TILE_ID_ERASER = 0;
const EMPTY          = null;

// IDs de entidades/inimigos (colocados no mapa como marcadores)
// 50+ = inimigos, 40+ = interactives/usáveis
const ENT_CHAPELEIRA  = 50;
const ENT_ERICK       = 51;
const ENT_GOOMBERICK  = 52;
const ENT_PRANTA      = 53;
const ENT_LINUX       = 54;
const ENT_BULLET      = 55;
const ENT_PELLIZZOLA  = 56;

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

// ── BACKGROUNDS ───────────────────────────
// Fundos disponíveis para personalização de cena
const BACKGROUNDS = [
  { id: "dark",    label: "Escuro",     color: "#070911", gradient: null },
  { id: "sky",     label: "Céu",        color: "#1a3a6e", gradient: "linear-gradient(180deg, #1a2a6e 0%, #3a6ea8 60%, #7aabe8 100%)" },
  { id: "sunset",  label: "Pôr do sol", color: "#3a1a0a", gradient: "linear-gradient(180deg, #1a0a2e 0%, #6e2a1a 40%, #e85a20 80%, #e8b040 100%)" },
  { id: "cave",    label: "Caverna",    color: "#0a0a0a", gradient: "linear-gradient(180deg, #0a0a0a 0%, #1a1018 60%, #0a0808 100%)" },
  { id: "forest",  label: "Floresta",   color: "#0a1a0a", gradient: "linear-gradient(180deg, #0a1a0a 0%, #102810 50%, #1a3a18 100%)" },
  { id: "snow",    label: "Neve",       color: "#b0c8e8", gradient: "linear-gradient(180deg, #8aaace 0%, #b0c8e8 50%, #d0e0f0 100%)" },
  { id: "lava",    label: "Vulcão",     color: "#1a0800", gradient: "linear-gradient(180deg, #1a0800 0%, #3a1000 50%, #6a2000 100%)" },
  { id: "water",   label: "Água",       color: "#082838", gradient: "linear-gradient(180deg, #082838 0%, #104860 50%, #1a6880 100%)" },
];

// ── SPRITE PATHS ──────────────────────────
// Mapeados exatamente a partir da sprite_sheet.png real do projeto
const SPRITE_PATHS = {
  // ── Lógica / Marcadores
  1:  "textures/blocks/start_level.png",
  2:  "textures/blocks/end_level.png",

  // ── Blocos (existentes na sprite sheet — seção "Blocks")
  3:  "textures/blocks/exclamation_block.png",     // bloco amarelo exclamação (Lucky)
  4:  "textures/blocks/ice_block.png",             // bloco de gelo/neve
  5:  "textures/blocks/bricks.png",                // tijolo
  6:  "textures/blocks/arrow_right_block.png",     // bloco seta (direita)
  7:  "textures/blocks/cyan_block.png",            // bloco ciano (água/gelo)
  8:  "textures/blocks/white_block.png",           // bloco branco
  9:  "textures/blocks/gray_block.png",            // bloco cinza claro
  10: "textures/blocks/stone_block.png",           // bloco pedra cinza escuro
  11: "textures/blocks/sand_block.png",            // areia/terra amarelada
  12: "textures/blocks/orange_block.png",          // bloco laranja texturizado
  13: "textures/blocks/orange_block2.png",         // bloco laranja variante
  14: "textures/blocks/music_block.png",           // bloco nota musical
  15: "textures/blocks/face_block.png",            // bloco rosto (smiley)

  // ── Interactives (seção "Interactives" na sprite sheet)
  40: "textures/interactives/play_button.png",     // botão play (triângulo)
  41: "textures/interactives/pause_button.png",    // botão pausa
  42: "textures/interactives/play_big.png",        // play grande
  43: "textures/interactives/pizza.png",           // pizza
  44: "textures/interactives/arrow_red.png",       // seta vermelha
  45: "textures/interactives/skull.png",           // caveira
  46: "textures/interactives/star.png",            // estrela

  // ── Entidades / Inimigos (da sprite sheet)
  50: "textures/entities/chapeleira.png",          // Chapeleira (frame 1)
  51: "textures/entities/erick.png",               // Erick
  52: "textures/entities/goomberick.png",          // Goomberick
  53: "textures/entities/pranta.png",              // Pranta
  54: "textures/entities/linux.png",               // Linux (pinguim)
  55: "textures/entities/bullet.png",              // Bullet
  56: "textures/entities/pellizzola.png",          // Pellizzola (frame 1)
};

// ── TILE COLORS (fallback sem sprite) ─────
const TILE_COLORS = {
  // Lógica
  1:  { fill: "#00471f", stroke: "#00e07a", label: "S" },
  2:  { fill: "#5c0018", stroke: "#f03558", label: "E" },

  // Blocos estrutura
  3:  { fill: "#7a5800", stroke: "#e8b840", label: "!" },
  4:  { fill: "#2a6080", stroke: "#7ecfef", label: "❄" },
  5:  { fill: "#6b2510", stroke: "#b84a30" },
  6:  { fill: "#203050", stroke: "#4080c0", label: "→" },
  7:  { fill: "#104050", stroke: "#40c0d0", label: "~" },
  8:  { fill: "#d0d0d0", stroke: "#ffffff" },
  9:  { fill: "#909090", stroke: "#c0c0c0" },
  10: { fill: "#404040", stroke: "#808080" },
  11: { fill: "#8a7040", stroke: "#c0a868" },
  12: { fill: "#804020", stroke: "#c06040" },
  13: { fill: "#804020", stroke: "#e07030" },
  14: { fill: "#303060", stroke: "#6060c0", label: "♪" },
  15: { fill: "#404040", stroke: "#e0e0a0", label: "☺" },

  // Interactives
  40: { fill: "#002060", stroke: "#4080ff", label: "▶" },
  41: { fill: "#003060", stroke: "#40a0ff", label: "⏸" },
  42: { fill: "#001840", stroke: "#3060c0", label: "▶▶" },
  43: { fill: "#601800", stroke: "#e06030", label: "🍕" },
  44: { fill: "#601010", stroke: "#e03030", label: "▶" },
  45: { fill: "#202020", stroke: "#c0c0c0", label: "☠" },
  46: { fill: "#606000", stroke: "#e0e000", label: "★" },

  // Entidades
  50: { fill: "#1a3050", stroke: "#4080c0", label: "C" },
  51: { fill: "#203020", stroke: "#40a040", label: "Er" },
  52: { fill: "#2a2a10", stroke: "#a0a030", label: "G" },
  53: { fill: "#103010", stroke: "#30a030", label: "Pr" },
  54: { fill: "#102040", stroke: "#2060a0", label: "🐧" },
  55: { fill: "#602000", stroke: "#e05000", label: "•" },
  56: { fill: "#302010", stroke: "#a06030", label: "P" },
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
  return {
    map: makeEmptyMap(),
    startPos: null,
    endPos: null,
    background: "dark",   // ← novo: fundo personalizado por cena
  };
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

// ── DRAW: fundo da cena ───────────────────
function drawBackground() {
  const bg = BACKGROUNDS.find(b => b.id === scene().background) || BACKGROUNDS[0];
  if (bg.gradient) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    // Parse o gradient linear simples
    const stops = bg.gradient.match(/rgba?\([^)]+\)|#[0-9a-fA-F]+/g);
    if (stops && stops.length >= 2) {
      stops.forEach((color, i) => {
        grad.addColorStop(i / (stops.length - 1), color);
      });
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bg.color;
    }
  } else {
    ctx.fillStyle = bg.color;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

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
      ctx.font         = `bold ${Math.max(7, Math.floor(tileSize * 0.35))}px 'Share Tech Mono', monospace`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label, px + tileSize / 2, py + tileSize / 2);
    }
  }

  // Entidades têm um indicador de "entidade" no canto
  if (id >= 50) {
    ctx.fillStyle = "rgba(255,200,0,0.18)";
    ctx.fillRect(px, py, tileSize, tileSize);
    // borda pontilhada amarela
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "#e8b840aa";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
    ctx.setLineDash([]);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fundo personalizado da cena
  drawBackground();

  const m = sceneMap();
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (m[y][x] !== EMPTY) drawTile(x, y, m[y][x]);

  // Grade
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
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

  // Fundo do preview
  const bg = BACKGROUNDS.find(b => b.id === sc.background) || BACKGROUNDS[0];
  c.fillStyle = bg.color;
  c.fillRect(0, 0, PREV_W, PREV_H);

  const m = sc.map;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = m[y][x];
      if (id === EMPTY) continue;
      const px = x * PREV_TILE;
      const py = y * (PREV_H / ROWS);
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
      renderBgPicker(); // Atualiza o seletor de fundo ao trocar de cena
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
    // START: único por projeto (pode estar em qualquer cena)
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
// Apenas tiles/entidades presentes na sprite_sheet.png real do projeto.
// Blocos inventados (stone_block, wood_block, metal_block, grass, lava, saw,
// conveyor, bush, flower, mushroom, sign, etc.) foram removidos.
const BLOCK_REGISTRY = [

  // ── LÓGICA ──────────────────────────────
  {
    id: 1,
    name: "START",
    desc: "Ponto inicial do nível (spawn do jogador)",
    category: "logica",
    tags: ["start", "inicio", "começo", "spawn", "jogador"],
    previewStyle: "background:#00471f; border-color:#00e07a40;",
    previewLabel: { text: "S", color: "#00e07a" },
  },
  {
    id: 2,
    name: "END",
    desc: "Ponto final — completa o nível",
    category: "logica",
    tags: ["end", "fim", "saida", "meta", "goal", "completo"],
    previewStyle: "background:#5c0018; border-color:#f0355540;",
    previewLabel: { text: "E", color: "#f03558" },
  },

  // ── ESTRUTURA ────────────────────────────
  {
    id: 3,
    name: "Bloco !",
    desc: "Bloco amarelo de exclamação (Lucky Block)",
    category: "estrutura",
    tags: ["lucky", "exclamacao", "amarelo", "surpresa", "item", "bonus"],
    previewStyle: "background:#7a5800; border-color:#e8b84040;",
    previewLabel: { text: "!", color: "#e8b840" },
  },
  {
    id: 4,
    name: "Bloco Gelo",
    desc: "Bloco de gelo/neve — superfície escorregadia",
    category: "estrutura",
    tags: ["gelo", "ice", "neve", "snow", "frio", "escorregadio"],
    previewStyle: "background:#2a6080; border-color:#7ecfef40;",
    previewLabel: { text: "❄", color: "#7ecfef" },
  },
  {
    id: 5,
    name: "Tijolo",
    desc: "Bloco de tijolo sólido básico",
    category: "estrutura",
    tags: ["tijolo", "brick", "solido", "chao", "parede", "basico"],
    previewStyle: "background:#6b2510; border-color:#b84a3040;",
    previewLabel: null,
  },
  {
    id: 6,
    name: "Bloco Seta →",
    desc: "Bloco com seta indicando direção",
    category: "estrutura",
    tags: ["seta", "arrow", "direcao", "right", "direita"],
    previewStyle: "background:#203050; border-color:#4080c040;",
    previewLabel: { text: "→", color: "#4080c0" },
  },
  {
    id: 7,
    name: "Bloco Ciano",
    desc: "Bloco ciano (água/vidro)",
    category: "estrutura",
    tags: ["ciano", "cyan", "agua", "water", "vidro", "glass", "azul"],
    previewStyle: "background:#104050; border-color:#40c0d040;",
    previewLabel: null,
  },
  {
    id: 8,
    name: "Bloco Branco",
    desc: "Bloco branco sólido",
    category: "estrutura",
    tags: ["branco", "white", "solido", "limpo"],
    previewStyle: "background:#b0b0b0; border-color:#ffffff40;",
    previewLabel: null,
  },
  {
    id: 9,
    name: "Bloco Cinza",
    desc: "Bloco cinza claro",
    category: "estrutura",
    tags: ["cinza", "gray", "grey", "claro", "pedra"],
    previewStyle: "background:#707070; border-color:#b0b0b040;",
    previewLabel: null,
  },
  {
    id: 10,
    name: "Pedra",
    desc: "Bloco de pedra escura",
    category: "estrutura",
    tags: ["pedra", "stone", "rock", "cinza", "escuro", "solido"],
    previewStyle: "background:#303030; border-color:#70707040;",
    previewLabel: null,
  },
  {
    id: 11,
    name: "Areia",
    desc: "Bloco de areia/terra",
    category: "estrutura",
    tags: ["areia", "sand", "terra", "dirt", "amarelo", "solo"],
    previewStyle: "background:#8a7040; border-color:#c0a86840;",
    previewLabel: null,
  },
  {
    id: 12,
    name: "Bloco Laranja",
    desc: "Bloco laranja texturizado",
    category: "estrutura",
    tags: ["laranja", "orange", "textura", "solido"],
    previewStyle: "background:#804020; border-color:#c0604040;",
    previewLabel: null,
  },
  {
    id: 13,
    name: "Bloco Laranja 2",
    desc: "Variante do bloco laranja",
    category: "estrutura",
    tags: ["laranja", "orange", "variante", "solido"],
    previewStyle: "background:#804020; border-color:#e0703040;",
    previewLabel: null,
  },
  {
    id: 14,
    name: "Bloco Musical",
    desc: "Bloco com nota musical",
    category: "estrutura",
    tags: ["musica", "music", "nota", "som", "especial"],
    previewStyle: "background:#202050; border-color:#6060c040;",
    previewLabel: { text: "♪", color: "#8080e0" },
  },
  {
    id: 15,
    name: "Bloco Rosto",
    desc: "Bloco com rosto/smiley",
    category: "estrutura",
    tags: ["rosto", "face", "smiley", "emoticon", "decoracao"],
    previewStyle: "background:#303030; border-color:#e0e0a040;",
    previewLabel: { text: "☺", color: "#e0e0a0" },
  },

  // ── INTERACTIVES ─────────────────────────
  {
    id: 40,
    name: "Play",
    desc: "Botão play — ativa mecanismo",
    category: "interacao",
    tags: ["play", "botao", "ativar", "iniciar", "triangulo"],
    previewStyle: "background:#001840; border-color:#4080ff40;",
    previewLabel: { text: "▶", color: "#4080ff" },
  },
  {
    id: 41,
    name: "Pause",
    desc: "Botão pause — pausa mecanismo",
    category: "interacao",
    tags: ["pause", "pausa", "botao", "parar"],
    previewStyle: "background:#002040; border-color:#40a0ff40;",
    previewLabel: { text: "⏸", color: "#40a0ff" },
  },
  {
    id: 42,
    name: "Play Grande",
    desc: "Botão play grande",
    category: "interacao",
    tags: ["play", "grande", "botao", "ativar"],
    previewStyle: "background:#001030; border-color:#3060c040;",
    previewLabel: { text: "▶", color: "#3060c0" },
  },
  {
    id: 43,
    name: "Pizza",
    desc: "Item pizza — recupera vida",
    category: "interacao",
    tags: ["pizza", "comida", "vida", "cura", "item", "coletavel"],
    previewStyle: "background:#401000; border-color:#e0603040;",
    previewLabel: { text: "🍕", color: "#e06030" },
  },
  {
    id: 44,
    name: "Seta Vermelha",
    desc: "Seta vermelha — indica direção ou perigo",
    category: "interacao",
    tags: ["seta", "vermelha", "direcao", "perigo", "arrow"],
    previewStyle: "background:#401010; border-color:#e0303040;",
    previewLabel: { text: "▶", color: "#e03030" },
  },
  {
    id: 45,
    name: "Caveira",
    desc: "Caveira — zona de morte ou perigo extremo",
    category: "perigo",
    tags: ["caveira", "skull", "morte", "perigo", "kill", "instantaneo"],
    previewStyle: "background:#101010; border-color:#c0c0c040;",
    previewLabel: { text: "☠", color: "#c0c0c0" },
  },
  {
    id: 46,
    name: "Estrela",
    desc: "Estrela — item especial de bônus",
    category: "interacao",
    tags: ["estrela", "star", "bonus", "especial", "coletavel", "pontos"],
    previewStyle: "background:#404000; border-color:#e0e00040;",
    previewLabel: { text: "★", color: "#e0e000" },
  },

  // ── INIMIGOS ─────────────────────────────
  {
    id: 50,
    name: "Chapeleira",
    desc: "Inimigo Chapeleira — patrulha o terreno",
    category: "inimigos",
    tags: ["chapeleira", "inimigo", "enemy", "chapeu", "hat", "patrulha"],
    previewStyle: "background:#1a3050; border-color:#4080c040;",
    previewLabel: { text: "C", color: "#4080c0" },
  },
  {
    id: 51,
    name: "Erick",
    desc: "Erick — personagem NPC/inimigo",
    category: "inimigos",
    tags: ["erick", "inimigo", "enemy", "npc", "personagem"],
    previewStyle: "background:#1a3020; border-color:#40a04040;",
    previewLabel: { text: "Er", color: "#40a040" },
  },
  {
    id: 52,
    name: "Goomberick",
    desc: "Goomberick — inimigo básico com óculos",
    category: "inimigos",
    tags: ["goomberick", "goomba", "inimigo", "enemy", "oculos", "basico"],
    previewStyle: "background:#2a2a10; border-color:#a0a03040;",
    previewLabel: { text: "G", color: "#a0a030" },
  },
  {
    id: 53,
    name: "Pranta",
    desc: "Pranta — planta inimiga que ataca verticalmente",
    category: "inimigos",
    tags: ["pranta", "planta", "plant", "inimigo", "enemy", "vertical", "morde"],
    previewStyle: "background:#0a2010; border-color:#30a03040;",
    previewLabel: { text: "🌱", color: "#30a030" },
  },
  {
    id: 54,
    name: "Linux",
    desc: "Linux — pinguim inimigo (Tux)",
    category: "inimigos",
    tags: ["linux", "pinguim", "tux", "inimigo", "enemy", "penguin"],
    previewStyle: "background:#101828; border-color:#2060a040;",
    previewLabel: { text: "🐧", color: "#2060a0" },
  },
  {
    id: 55,
    name: "Bullet",
    desc: "Bullet — projétil inimigo",
    category: "inimigos",
    tags: ["bullet", "bala", "projetil", "tiro", "inimigo", "perigo"],
    previewStyle: "background:#401800; border-color:#e0500040;",
    previewLabel: { text: "•", color: "#e05000" },
  },
  {
    id: 56,
    name: "Pellizzola",
    desc: "Pellizzola — personagem jogável (referência visual)",
    category: "inimigos",
    tags: ["pellizzola", "jogador", "player", "principal", "personagem"],
    previewStyle: "background:#302010; border-color:#a0603040;",
    previewLabel: { text: "P", color: "#a06030" },
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

  if (activeCategory === "todos" && !searchQuery.trim()) {
    const categoryOrder  = ["logica", "estrutura", "interacao", "perigo", "inimigos"];
    const categoryLabels = {
      logica:    "Lógica",
      estrutura: "Estrutura",
      interacao: "Interação",
      perigo:    "Perigo",
      inimigos:  "Inimigos",
    };

    categoryOrder.forEach(cat => {
      const catBlocks = blocks.filter(b => b.category === cat);
      if (catBlocks.length === 0) return;

      const header = document.createElement("div");
      header.className = "block-category-header";
      header.textContent = categoryLabels[cat];
      grid.appendChild(header);

      const subgrid = document.createElement("div");
      subgrid.className = "block-subgrid";
      catBlocks.forEach(block => subgrid.appendChild(makeBlockCell(block)));
      grid.appendChild(subgrid);
    });
  } else {
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

  // Badge de tipo para inimigos
  if (block.category === "inimigos") {
    const badge = document.createElement("div");
    badge.className = "entity-badge";
    badge.textContent = "ENT";
    cell.appendChild(badge);
  }

  const preview = document.createElement("div");
  preview.className = "cell-preview";
  preview.style.cssText = block.previewStyle;

  if (sprites[block.id]) {
    const img = document.createElement("img");
    img.src = sprites[block.id].src;
    img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:3px; display:block; image-rendering:pixelated;";
    preview.innerHTML = "";
    preview.appendChild(img);
  } else if (block.previewLabel) {
    preview.innerHTML = `<span style="color:${block.previewLabel.color}; font-size:11px;">${block.previewLabel.text}</span>`;
  }

  const name = document.createElement("span");
  name.className = "cell-name";
  name.textContent = block.name;

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

// ── ERASER ────────────────────────────────
document.getElementById("eraser-item").addEventListener("click", () => {
  selectedTile = TILE_ID_ERASER;
  document.getElementById("eraser-item").classList.add("active");
  renderBlockGrid();
});

// ── BACKGROUND PICKER ─────────────────────
function renderBgPicker() {
  const picker = document.getElementById("bg-picker");
  if (!picker) return;
  picker.innerHTML = "";
  const current = scene().background || "dark";
  BACKGROUNDS.forEach(bg => {
    const btn = document.createElement("button");
    btn.className = "bg-btn" + (bg.id === current ? " active" : "");
    btn.title = bg.label;
    btn.dataset.bgId = bg.id;

    // Preview visual do fundo
    const swatch = document.createElement("div");
    swatch.className = "bg-swatch";
    if (bg.gradient) {
      swatch.style.background = bg.gradient;
    } else {
      swatch.style.background = bg.color;
    }

    const lbl = document.createElement("span");
    lbl.className = "bg-label";
    lbl.textContent = bg.label;

    btn.appendChild(swatch);
    btn.appendChild(lbl);

    btn.addEventListener("click", () => {
      scene().background = bg.id;
      markChanged();
      draw();
      renderBgPicker();
      renderScenePreviews();
    });

    picker.appendChild(btn);
  });
}

// ── ADD SCENE ─────────────────────────────
document.getElementById("addScene").addEventListener("click", () => {
  if (scenes.length >= MAX_SCENES) return;
  scenes.push(makeEmptyScene());
  currentScene = scenes.length - 1;
  markChanged();
  draw();
  updateStatus();
  renderScenePreviews();
  renderBgPicker();
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
  let enemies = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const id = sc.map[y][x];
      if (id !== EMPTY) {
        count++;
        if (id >= 50) enemies++;
      }
    }
  stTiles.textContent   = count;
  stScenes.textContent  = scenes.length;

  const stEnemies = document.getElementById("st-enemies");
  if (stEnemies) stEnemies.textContent = enemies;

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
  const bg = scene().background; // Preserva fundo ao limpar
  scenes[currentScene] = makeEmptyScene();
  scenes[currentScene].background = bg;
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
  renderBgPicker();
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

  // Salva também os backgrounds de cada cena
  const bgData = JSON.stringify(scenes.map(sc => sc.background || "dark"));

  const json =
`{
    "level": {
        "information": {
            "name": ${JSON.stringify(levelName)},
            "description": ${JSON.stringify(levelDescription)},
            "author": ${JSON.stringify(levelAuthor)}
        },
        "data": ${dataStr},
        "backgrounds": ${bgData}
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
  const bgs  = parsed?.level?.backgrounds;

  if (!Array.isArray(data)) {
    alert("Erro: formato de nível inválido (campo 'data' ausente ou incorreto).");
    return;
  }

  document.getElementById("level-name").value        = info?.name        ?? "";
  document.getElementById("level-description").value = info?.description ?? "";
  document.getElementById("level-author").value      = info?.author      ?? "";

  const scenesRaw = Array.isArray(data[0]) ? data : [data];

  scenes = scenesRaw.map((rawScene, sceneIdx) => {
    const sc = makeEmptyScene();
    // Restaura fundo salvo
    if (Array.isArray(bgs) && bgs[sceneIdx]) sc.background = bgs[sceneIdx];

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
  renderBgPicker();
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
renderBgPicker();
loadSprites();
