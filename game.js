const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const game = document.getElementById('game');
const upgrade = document.getElementById('upgrade');
const gameOver = document.getElementById('gameOver');
const waveBreak = document.getElementById('waveBreak');
const multiLobby = document.getElementById('multiLobby');
const status = document.getElementById('discordStatus');
const keys = new Set();

let raf = 0;
let last = 0;
let state = null;
let view = { w: 960, h: 620, dpr: 1 };
let mouse = { x: 480, y: 310, active: false, down: false };

const WORLD_W = 4200;
const WORLD_H = 2800;
const BASE = { x: WORLD_W / 2, y: WORLD_H / 2 };
const BASE_RADIUS = 150;

const ASSET_ROOT = './assets/';
const assets = { player: [], trees: [], bushes: [], rocks: [], skeleton: null, shield: null, boss: null, boss2: null };
let assetsReady = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    img.src = src;
  });
}

async function loadGameAssets() {
  if (assetsReady) return;
  const player = [];
  for (let r = 1; r <= 4; r++) for (let c = 1; c <= 5; c++) player.push(loadImage(`${ASSET_ROOT}characters/player_r${r}_${c}.png`));
  const trees = Array.from({length: 6}, (_, i) => loadImage(`${ASSET_ROOT}environment/treeclean_${String(i + 1).padStart(2,'0')}.png`));
  const bushes = Array.from({length: 20}, (_, i) => loadImage(`${ASSET_ROOT}environment/bushclean_${String(i + 1).padStart(2,'0')}.png`));
  const rocks = Array.from({length: 36}, (_, i) => loadImage(`${ASSET_ROOT}environment/rockclean_${String(i + 1).padStart(2,'0')}.png`).catch(() => null));
  const [p, t, b, r, skeleton, shield, boss, boss2] = await Promise.all([
    Promise.all(player), Promise.all(trees), Promise.all(bushes), Promise.all(rocks),
    loadImage(`${ASSET_ROOT}characters/skeleton.png`), loadImage(`${ASSET_ROOT}characters/skeleton_shield.png`),
    loadImage(`${ASSET_ROOT}characters/boss.png`), loadImage(`${ASSET_ROOT}characters/boss2.png`)
  ]);
  assets.player = p; assets.trees = t; assets.bushes = b; assets.rocks = r.filter(Boolean);
  assets.skeleton = skeleton; assets.shield = shield; assets.boss = boss; assets.boss2 = boss2;
  assetsReady = true;
}

const upgrades = [
  { name: '❤️ Vitalidade', text: '+25 de vida máxima e recupera 25 de vida.', apply: s => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { name: '⚡ Cadência', text: 'Atira 18% mais rápido.', apply: s => { s.fireInterval = Math.max(.09, s.fireInterval * .82); } },
  { name: '💨 Velocidade', text: 'Move 14% mais rápido.', apply: s => { s.speed *= 1.14; } },
  { name: '💥 Dano', text: '+30% de dano por disparo.', apply: s => { s.damage *= 1.3; } },
  { name: '🧲 Ímã', text: 'Aumenta o alcance de coleta de XP.', apply: s => { s.magnet += 55; } },
  { name: '🔫 Multitiro', text: '+1 projétil por disparo.', apply: s => { s.multishot = Math.min(7, s.multishot + 1); } },
  { name: '🎯 Alcance', text: 'Aumenta a distância útil dos disparos.', apply: s => { s.bulletLife = Math.min(2.2, s.bulletLife + .25); } },
  { name: '🛡️ Armadura', text: 'Reduz o dano recebido dos inimigos.', apply: s => { s.damageReduction = Math.min(.55, s.damageReduction + .08); } },
  { name: '🔥 Projétil pesado', text: 'Projéteis maiores e +12% de dano.', apply: s => { s.bulletRadius += 1.2; s.damage *= 1.12; } }
];

function resize() {
  const rect = canvas.getBoundingClientRect();
  view.w = Math.max(640, Math.floor(rect.width));
  view.h = Math.max(420, Math.floor(rect.height));
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(view.w * view.dpr);
  canvas.height = Math.floor(view.h * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (state) {
    state.camera.x = clamp(state.camera.x, 0, Math.max(0, WORLD_W - view.w));
    state.camera.y = clamp(state.camera.y, 0, Math.max(0, WORLD_H - view.h));
  }
}
new ResizeObserver(resize).observe(canvas);
resize();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function worldToScreen(x, y) { return { x: x - state.camera.x, y: y - state.camera.y }; }
function screenToWorld(x, y) { return { x: x + state.camera.x, y: y + state.camera.y }; }
function onScreen(x, y, pad = 0) { return x > -pad && x < view.w + pad && y > -pad && y < view.h + pad; }

async function startGame() {
  try { await loadGameAssets(); } catch (err) { console.warn("[ASSETS]", err); }
  menu.classList.add('hidden');
  multiLobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  upgrade.classList.add('hidden');
  waveBreak.classList.add('hidden');
  game.classList.remove('hidden');
  // The canvas starts inside a hidden container; measure it again after revealing the game.
  requestAnimationFrame(() => resize());

  state = {
    player: { x: BASE.x, y: BASE.y + 90, r: 25, angle: 0, moving: false, attackTimer: 0, frame: 0 },
    camera: { x: BASE.x - view.w / 2, y: BASE.y - view.h / 2 },
    maxHp: 100, hp: 100, speed: 285, damage: 24, fireInterval: .42, fireTimer: .1,
    magnet: 90, multishot: 1, knockbackResist: 0, damageReduction: 0,
    bulletLife: 1.15, bulletRadius: 5,
    wave: 1, kills: 0, xp: 0, nextXp: 8, level: 1, pendingUpgrades: 0,
    waveKills: 0, waveGoal: 10, spawnTimer: 0, spawnInterval: .72,
    enemies: [], bullets: [], orbs: [], particles: [], trees: [], rocks: [], bushes: [], grass: [],
    flowers: [], paths: [], river: [], bridge: null, decorations: [],
    paused: false, gameOver: false, waveCleared: false, waveCountdown: false,
    upgradeOpen: false, totalTime: 0, flash: 0, basePulse: 0
  };

  generateForest();
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  updateHud();
  canvas.focus();
}

function generateForest() {
  state.trees.length = 0;
  state.rocks.length = 0;
  state.bushes.length = 0;
  state.grass.length = 0;
  state.flowers.length = 0;
  state.paths.length = 0;
  state.decorations.length = 0;
  state.river = [];
  state.bridge = null;

  // One main trail with a smaller branch. The paths are kept apart to avoid visual overlaps.
  const main = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    main.push({ x: 180 + t * (WORLD_W - 360), y: WORLD_H * .72 - t * 1180 + Math.sin(t * Math.PI * 2.1) * 150 });
  }
  state.paths.push({ points: main, width: 132, inner: 96 });

  const branch = [];
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    branch.push({ x: BASE.x - 40 - t * 930, y: BASE.y + 90 - t * 610 + Math.sin(t * Math.PI * 1.1) * 110 });
  }
  state.paths.push({ points: branch, width: 92, inner: 64 });

  // River inspired by the supplied forest reference: a wide, winding watercourse with banks.
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    state.river.push({
      x: WORLD_W * .72 + Math.sin(t * Math.PI * 2.0) * 250 + Math.sin(t * 9) * 55,
      y: -220 + t * (WORLD_H + 440)
    });
  }
  // One bridge where the main trail crosses the river.
  state.bridge = { x: WORLD_W * .58, y: WORLD_H * .43, angle: -0.08, w: 185, h: 56 };

  const clearRadius = 380;
  for (let i = 0; i < 205; i++) {
    const x = rand(55, WORLD_W - 55), y = rand(55, WORLD_H - 55);
    if (dist(x, y, BASE.x, BASE.y) < clearRadius || nearAnyPath(x, y, 85) || nearRiver(x, y, 85)) continue;
    state.trees.push({ x, y, r: rand(54, 88), variant: Math.floor(rand(0, assets.trees.length || 6)) });
  }
  for (let i = 0; i < 180; i++) {
    const x = rand(45, WORLD_W - 45), y = rand(45, WORLD_H - 45);
    if (dist(x, y, BASE.x, BASE.y) < 230 || nearAnyPath(x, y, 48) || nearRiver(x, y, 48)) continue;
    state.rocks.push({ x, y, r: rand(12, 28), variant: Math.floor(rand(0, Math.max(1, assets.rocks.length))) });
  }
  for (let i = 0; i < 210; i++) {
    const x = rand(30, WORLD_W - 30), y = rand(30, WORLD_H - 30);
    if (dist(x, y, BASE.x, BASE.y) < 230 || nearAnyPath(x, y, 38) || nearRiver(x, y, 35)) continue;
    state.bushes.push({ x, y, r: rand(28, 52), variant: Math.floor(rand(0, assets.bushes.length || 15)) });
  }
  for (let i = 0; i < 1500; i++) {
    state.grass.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), len: rand(5, 12), rot: rand(-.8, .8), tone: Math.random() });
  }
  for (let i = 0; i < 420; i++) {
    state.flowers.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), color: pick(['#e8c66c', '#d7838b', '#b7a2e8', '#e8e1c5']), r: rand(1.4, 2.6) });
  }
  for (let i = 0; i < 65; i++) {
    const a = rand(0, Math.PI * 2), r = rand(250, 1050);
    const x = BASE.x + Math.cos(a) * r, y = BASE.y + Math.sin(a) * r;
    if (nearRiver(x, y, 50)) continue;
    state.decorations.push({ x, y, type: pick(['stump', 'log']) });
  }
}

function nearRiver(x, y, radius = 0) {
  return state.river.some(p => dist(x, y, p.x, p.y) < 78 + radius);
}

function nearAnyPath(x, y, radius) {
  return state.paths.some(path => path.points.some(p => dist(x, y, p.x, p.y) < path.width * .55 + radius));
}

function showMulti() {
  menu.classList.add('hidden');
  multiLobby.classList.remove('hidden');
  document.getElementById('participants').textContent = '👤 Você está pronto. Convide amigos para a Activity; a sincronização da partida entra na próxima etapa.';
}

function endGame() {
  state.gameOver = true;
  state.paused = true;
  document.getElementById('finalWave').textContent = state.wave;
  document.getElementById('finalKills').textContent = state.kills;
  document.getElementById('finalLevel').textContent = state.level;
  gameOver.classList.remove('hidden');
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  const margin = 90;
  const cam = state.camera;
  let x, y;
  const left = cam.x - margin, right = cam.x + view.w + margin;
  const top = cam.y - margin, bottom = cam.y + view.h + margin;
  if (side === 0) { x = left; y = rand(Math.max(20, top), Math.min(WORLD_H - 20, bottom)); }
  else if (side === 1) { x = right; y = rand(Math.max(20, top), Math.min(WORLD_H - 20, bottom)); }
  else if (side === 2) { x = rand(Math.max(20, left), Math.min(WORLD_W - 20, right)); y = top; }
  else { x = rand(Math.max(20, left), Math.min(WORLD_W - 20, right)); y = bottom; }
  x = clamp(x, 25, WORLD_W - 25); y = clamp(y, 25, WORLD_H - 25);
  const elite = Math.random() < Math.min(.15, .05 + state.wave * .012);
  const brute = !elite && Math.random() < Math.min(.25, .10 + state.wave * .018);
  const hp = elite ? 170 + state.wave * 15 : brute ? 78 + state.wave * 9 : 36 + state.wave * 5;
  const speed = elite ? 48 + state.wave * 1.3 : brute ? 56 + state.wave * 1.5 : 72 + state.wave * 2;
  state.enemies.push({ x, y, r: elite ? 34 : brute ? 24 : 20, hp, maxHp: hp, speed, elite, brute, hit: 0, angle: rand(0, Math.PI * 2), bossType: Math.random() < .5 ? 1 : 2 });
}

function nearestEnemy() {
  let best = null, bestDist = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function getAimTarget() {
  const e = nearestEnemy();
  if (e) return { x: e.x, y: e.y };
  if (mouse.active) return screenToWorld(mouse.x, mouse.y);
  return { x: state.player.x + Math.cos(state.player.angle) * 100, y: state.player.y + Math.sin(state.player.angle) * 100 };
}

function shoot() {
  if (!state || state.gameOver) return;
  const target = getAimTarget();
  const dx = target.x - state.player.x, dy = target.y - state.player.y;
  const baseAngle = Math.atan2(dy, dx);
  state.player.angle = baseAngle;
  state.player.attackTimer = .18;
  const count = state.multishot;
  const spread = count === 1 ? 0 : .14;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const a = baseAngle + offset;
    state.bullets.push({
      x: state.player.x + Math.cos(a) * 24,
      y: state.player.y + Math.sin(a) * 24,
      vx: Math.cos(a) * 760,
      vy: Math.sin(a) * 760,
      r: state.bulletRadius,
      damage: state.damage,
      life: state.bulletLife
    });
  }
  burst(state.player.x + Math.cos(baseAngle) * 26, state.player.y + Math.sin(baseAngle) * 26, '#ffd66e', 3);
}

function gainXp(n) {
  state.xp += n;
  while (state.xp >= state.nextXp) {
    state.xp -= state.nextXp;
    state.level++;
    state.pendingUpgrades++;
    state.nextXp = Math.floor(state.nextXp * 1.38 + 3);
    showUpgradeNotice();
  }
}

function showUpgradeNotice() {
  const notice = document.getElementById('upgradeNotice');
  if (!notice) return;
  notice.classList.remove('hidden');
  document.getElementById('upgradeCount').textContent = state.pendingUpgrades;
}

function nearBase() {
  return dist(state.player.x, state.player.y, BASE.x, BASE.y) <= BASE_RADIUS + 50;
}

function openUpgrade() {
  if (!state || state.pendingUpgrades <= 0 || !nearBase() || state.upgradeOpen) return;
  state.upgradeOpen = true;
  state.paused = true;
  upgrade.classList.remove('hidden');
  const list = document.getElementById('upgradeList');
  list.innerHTML = '';
  const choices = [...upgrades].sort(() => Math.random() - .5).slice(0, 3);
  for (const u of choices) {
    const b = document.createElement('button');
    b.className = 'upgrade';
    b.innerHTML = `<strong>${u.name}</strong><span>${u.text}</span>`;
    b.addEventListener('click', () => {
      u.apply(state);
      state.pendingUpgrades = Math.max(0, state.pendingUpgrades - 1);
      state.upgradeOpen = false;
      upgrade.classList.add('hidden');
      state.paused = false;
      last = performance.now();
      if (state.pendingUpgrades > 0) showUpgradeNotice();
      else document.getElementById('upgradeNotice').classList.add('hidden');
      updateHud();
    }, { once: true });
    list.appendChild(b);
  }
}

function clearWave() {
  if (state.waveCleared || state.gameOver) return;
  state.waveCleared = true;
  state.waveCountdown = true;
  state.spawnTimer = 0;
  waveBreak.classList.remove('hidden');
  // Deliberately NOT paused: the player can explore and walk to the base while waiting.
  state.paused = false;
  updateReadyBanner();
}

function nextWave() {
  if (!state || !state.waveCountdown) return;
  state.wave++;
  state.waveKills = 0;
  state.waveGoal = Math.floor(10 + (state.wave - 1) * 4 + state.wave * 1.5);
  state.spawnInterval = Math.max(.24, .72 - state.wave * .035);
  state.spawnTimer = 0;
  state.waveCleared = false;
  state.waveCountdown = false;
  waveBreak.classList.add('hidden');
  state.flash = .45;
  last = performance.now();
  updateHud();
}

function updateReadyBanner() {
  if (!state) return;
  document.getElementById('readyTopWave').textContent = state.wave + 1;
  document.getElementById('readyTop').classList.toggle('hidden', !state.waveCountdown);
}

function update(dt) {
  if (state.paused || state.gameOver) return;
  state.totalTime += dt;
  state.flash = Math.max(0, state.flash - dt);
  state.basePulse += dt;

  const p = state.player;
  let ax = 0, ay = 0;
  if (keys.has('w') || keys.has('arrowup')) ay--;
  if (keys.has('s') || keys.has('arrowdown')) ay++;
  if (keys.has('a') || keys.has('arrowleft')) ax--;
  if (keys.has('d') || keys.has('arrowright')) ax++;
  const moveLen = Math.hypot(ax, ay) || 1;
  p.moving = !!(ax || ay);
  if (ax || ay) {
    p.x += ax / moveLen * state.speed * dt;
    p.y += ay / moveLen * state.speed * dt;
  }
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.x = clamp(p.x, 35, WORLD_W - 35);
  p.y = clamp(p.y, 35, WORLD_H - 35);

  // The character now fires automatically whenever a target exists.
  // Mouse click / Space still force an immediate shot, but are no longer required.
  if (mouse.active && mouse.down) {
    p.angle = Math.atan2(screenToWorld(mouse.x, mouse.y).y - p.y, screenToWorld(mouse.x, mouse.y).x - p.x);
  }

  state.fireTimer += dt;
  if (state.fireTimer >= state.fireInterval) {
    state.fireTimer = 0;
    if (state.enemies.length) shoot();
  }

  if (!state.waveCountdown) {
    state.spawnTimer += dt;
    if (state.waveKills < state.waveGoal && state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer = 0;
      spawnEnemy();
      if (state.wave >= 4 && Math.random() < Math.min(.38, state.wave * .035)) spawnEnemy();
    }
  }

  for (const e of state.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);
    // Enemies do not invade the camp's center; the base remains a useful safe-ish hub.
    const baseDist = dist(e.x, e.y, BASE.x, BASE.y);
    const stopAtBase = baseDist < 118 && dist(p.x, p.y, BASE.x, BASE.y) < BASE_RADIUS + 30;
    if (!stopAtBase) {
      e.x += dx / d * e.speed * dt;
      e.y += dy / d * e.speed * dt;
    }
    e.hit = Math.max(0, e.hit - dt);
    if (d < e.r + p.r + 3) {
      state.hp -= (e.elite ? 20 : e.brute ? 15 : 11) * (1 - state.damageReduction) * dt;
      if (state.hp <= 0) { state.hp = 0; endGame(); return; }
    }
  }

  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
        e.hp -= b.damage;
        e.hit = .09;
        b.life = -1;
        burst(b.x, b.y, '#ffd66e', 4);
        if (e.hp <= 0) {
          state.kills++;
          state.waveKills++;
          const value = e.elite ? 4 : e.brute ? 2 : 1;
          for (let i = 0; i < value; i++) state.orbs.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), r: 6, value: 1, collected: false });
          burst(e.x, e.y, e.elite ? '#c58cff' : e.brute ? '#ff9d6e' : '#ff7b7b', e.elite ? 16 : 8);
        }
        break;
      }
    }
  }
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > -30 && b.x < WORLD_W + 30 && b.y > -30 && b.y < WORLD_H + 30);
  state.enemies = state.enemies.filter(e => e.hp > 0);

  for (const o of state.orbs) {
    const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (d < state.magnet) {
      const pull = d < 50 ? 560 : 300;
      o.x += dx / d * pull * dt;
      o.y += dy / d * pull * dt;
    }
    if (d < 25) { o.collected = true; gainXp(o.value); burst(o.x, o.y, '#75a8ff', 3); }
  }
  state.orbs = state.orbs.filter(o => !o.collected);

  updateParticles(dt);

  const waveFinished = !state.waveCountdown && state.waveKills >= state.waveGoal && state.enemies.length === 0;
  if (waveFinished) clearWave();

  const desiredX = clamp(p.x - view.w / 2, 0, WORLD_W - view.w);
  const desiredY = clamp(p.y - view.h / 2, 0, WORLD_H - view.h);
  state.camera.x += (desiredX - state.camera.x) * Math.min(1, dt * 7);
  state.camera.y += (desiredY - state.camera.y) * Math.min(1, dt * 7);

  updateHud();
  updateBaseHint();
  updateReadyBanner();
}

function updateBaseHint() {
  const hint = document.getElementById('baseHint');
  if (!hint || !state) return;
  const can = nearBase() && state.pendingUpgrades > 0;
  hint.classList.toggle('hidden', !can);
  if (can) document.getElementById('baseUpgradeCount').textContent = state.pendingUpgrades;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), speed = rand(40, 160);
    state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.25, .6), max: .6, color, r: rand(1.5, 3.5) });
  }
}

function updateParticles(dt) {
  for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= .97; p.vy *= .97; }
  state.particles = state.particles.filter(p => p.life > 0);
}

function draw() {
  const w = view.w, h = view.h;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#17251a';
  ctx.fillRect(0, 0, w, h);
  drawForest(w, h);
  drawEntities();
  drawBase();
  drawVignette(w, h);
  drawMiniMap();
}

function drawForest(w, h) {
  // Layer 1: rich ground. The reference uses a hand-painted, tile-like forest floor.
  ctx.fillStyle = '#6f9b4d';
  ctx.fillRect(0, 0, w, h);
  const cell = 84;
  for (let gx = Math.floor(state.camera.x / cell) * cell - state.camera.x; gx < w + cell; gx += cell) {
    for (let gy = Math.floor(state.camera.y / cell) * cell - state.camera.y; gy < h + cell; gy += cell) {
      const n = (Math.floor((gx + state.camera.x) / cell) * 17 + Math.floor((gy + state.camera.y) / cell) * 31) % 9;
      ctx.fillStyle = n < 3 ? 'rgba(56,95,47,.12)' : n < 6 ? 'rgba(154,180,77,.08)' : 'rgba(39,78,40,.07)';
      ctx.fillRect(gx, gy, cell, cell);
    }
  }

  drawRiver();
  drawPaths();

  // Fine grass texture is now only a detail layer, not the ground itself.
  for (const g of state.grass) {
    const s = worldToScreen(g.x, g.y);
    if (!onScreen(s.x, s.y, 12)) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(g.rot);
    ctx.strokeStyle = g.tone > .5 ? 'rgba(40,91,45,.42)' : 'rgba(106,139,58,.34)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(g.len * .15, -g.len * .4, 0, -g.len); ctx.stroke();
    ctx.restore();
  }

  for (const f of state.flowers) {
    const s = worldToScreen(f.x, f.y); if (!onScreen(s.x, s.y, 8)) continue;
    ctx.fillStyle = f.color; ctx.globalAlpha = .72; ctx.beginPath(); ctx.arc(s.x, s.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  for (const d of state.decorations) drawDecoration(d);

  for (const b of state.bushes) drawBush(b);
  for (const r of state.rocks) {
    const s = worldToScreen(r.x, r.y); if (!onScreen(s.x, s.y, 50)) continue;
    drawRock(r, s.x, s.y);
  }

  const visibleTrees = state.trees.filter(t => {
    const s = worldToScreen(t.x, t.y); return s.x > -130 && s.x < w + 130 && s.y > -170 && s.y < h + 170;
  }).sort((a, b) => a.y - b.y);
  for (const t of visibleTrees) drawTree(t);
}

function drawRiver() {
  if (state.river.length < 2) return;
  drawPathStroke(state.river, 210, 'rgba(83,72,43,.55)');
  drawPathStroke(state.river, 174, '#c4b56e');
  drawPathStroke(state.river, 148, '#5d9bc1');
  drawPathStroke(state.river, 128, '#70b5d7');
  // Animated water highlights.
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (let i = 2; i < state.river.length - 2; i += 3) {
    const p = state.river[i], s = worldToScreen(p.x, p.y);
    if (!onScreen(s.x, s.y, 30)) continue;
    const phase = Math.sin(state.totalTime * 2 + i) * 8;
    ctx.strokeStyle = 'rgba(220,246,250,.34)';
    ctx.beginPath(); ctx.moveTo(s.x - 20 + phase, s.y); ctx.lineTo(s.x + 18 + phase, s.y + 1); ctx.stroke();
  }
  ctx.restore();
  if (state.bridge) {
    const b = worldToScreen(state.bridge.x, state.bridge.y);
    if (onScreen(b.x, b.y, 150)) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(state.bridge.angle);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-state.bridge.w/2+6, -state.bridge.h/2+8, state.bridge.w, state.bridge.h);
      ctx.fillStyle = '#6b4527'; ctx.fillRect(-state.bridge.w/2, -state.bridge.h/2, state.bridge.w, state.bridge.h);
      ctx.fillStyle = '#9a6a3a';
      for (let x = -state.bridge.w/2+5; x < state.bridge.w/2-4; x += 18) ctx.fillRect(x, -state.bridge.h/2+4, 12, state.bridge.h-8);
      ctx.restore();
    }
  }
}

function drawPaths() {
  for (const path of state.paths) {
    drawPathStroke(path.points, path.width + 12, 'rgba(77,62,39,.25)');
    drawPathStroke(path.points, path.width, '#8d744d');
    drawPathStroke(path.points, path.inner, '#b79b68');
    drawPathStroke(path.points, Math.max(18, path.inner * .55), 'rgba(218,191,132,.25)');
  }
}

function drawPathStroke(points, width, color) {
  if (points.length < 2) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const first = worldToScreen(points[0].x, points[0].y); ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const a = worldToScreen(points[i].x, points[i].y), b = worldToScreen(points[i + 1].x, points[i + 1].y);
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const lastP = worldToScreen(points[points.length - 1].x, points[points.length - 1].y); ctx.lineTo(lastP.x, lastP.y); ctx.stroke(); ctx.restore();
}

function drawImageShadow(img, x, y, w, h) {
  ctx.save(); ctx.globalAlpha = .22; ctx.fillStyle = '#132012'; ctx.beginPath(); ctx.ellipse(x, y + h * .38, w * .38, h * .10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.drawImage(img, x - w/2, y - h * .78, w, h);
}

function drawRock(r, x, y) {
  const img = assets.rocks[r.variant % Math.max(1, assets.rocks.length)];
  if (!img) return;
  const scale = r.r * 2.2 / Math.max(img.width, img.height);
  drawImageShadow(img, x, y, img.width * scale, img.height * scale);
}

function drawBush(b) {
  const s = worldToScreen(b.x, b.y); if (!onScreen(s.x, s.y, 70)) return;
  const img = assets.bushes[b.variant % Math.max(1, assets.bushes.length)]; if (!img) return;
  const scale = b.r * 2 / Math.max(img.width, img.height);
  drawImageShadow(img, s.x, s.y, img.width * scale, img.height * scale);
}

function drawDecoration(d) {
  const s = worldToScreen(d.x, d.y); if (!onScreen(s.x, s.y, 40)) return;
  ctx.save();
  if (d.type === 'stump') {
    ctx.fillStyle = '#67492f'; ctx.fillRect(s.x - 9, s.y - 7, 18, 14);
    ctx.fillStyle = '#9d7950'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 7, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.translate(s.x, s.y); ctx.rotate(-.25); ctx.fillStyle = '#68472e'; ctx.fillRect(-24, -7, 48, 14); ctx.fillStyle = '#a57b50'; ctx.beginPath(); ctx.arc(24, 0, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTree(t) {
  const s = worldToScreen(t.x, t.y); if (!onScreen(s.x, s.y, 150)) return;
  const img = assets.trees[t.variant % Math.max(1, assets.trees.length)];
  if (!img) return;
  const h = t.r * 2.55, w = h * img.width / img.height;
  drawImageShadow(img, s.x, s.y, w, h);
}

function drawEntities() {
  for (const o of state.orbs) {
    const s = worldToScreen(o.x, o.y); if (!onScreen(s.x, s.y, 20)) continue;
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = '#6fa5ff'; ctx.fillStyle = '#77aaff';
    ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const b of state.bullets) {
    const s = worldToScreen(b.x, b.y); if (!onScreen(s.x, s.y, 20)) continue;
    ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = '#ffd36a'; ctx.fillStyle = '#ffe29a';
    ctx.beginPath(); ctx.arc(s.x, s.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const e of state.enemies) drawEnemy(e);
  drawPlayer();
  for (const p of state.particles) {
    const s = worldToScreen(p.x, p.y); if (!onScreen(s.x, s.y, 30)) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
}

function drawEnemy(e) {
  const s = worldToScreen(e.x, e.y); if (!onScreen(s.x, s.y, 100)) return;
  const img = e.elite ? (e.bossType === 2 ? assets.boss2 : assets.boss) : e.brute ? assets.shield : assets.skeleton;
  if (!img) return;
  const targetH = e.elite ? 115 : e.brute ? 72 : 64;
  const targetW = targetH * img.width / img.height;
  ctx.save();
  ctx.globalAlpha = e.hit > 0 ? .72 : 1;
  if (e.angle > Math.PI/2 || e.angle < -Math.PI/2) ctx.scale(-1,1);
  ctx.drawImage(img, s.x - targetW/2, s.y - targetH * .78, targetW, targetH);
  ctx.restore();
  const bw = Math.max(38, targetW * .72);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(s.x - bw/2, s.y - targetH*.9, bw, 5);
  ctx.fillStyle = e.elite ? '#d28aff' : '#ff7777'; ctx.fillRect(s.x - bw/2, s.y - targetH*.9, bw * clamp(e.hp/e.maxHp,0,1), 5);
}

function drawPlayer() {
  const p = state.player, s = worldToScreen(p.x, p.y);
  if (!onScreen(s.x, s.y, 100)) return;
  const row = p.attackTimer > 0 ? 4 : p.moving ? 3 : 1;
  const frame = p.moving ? Math.floor(state.totalTime * 10) % 5 : Math.floor(state.totalTime * 4) % 5;
  const img = assets.player[(row - 1) * 5 + frame];
  if (!img) return;
  const h = 78, w = h * img.width / img.height;
  ctx.save();
  if (Math.cos(p.angle) < 0) ctx.scale(-1,1);
  ctx.globalAlpha = .22; ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 28, 22, 7, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.drawImage(img, s.x - w/2, s.y - h*.78, w, h);
  ctx.restore();
}

function drawBase() {
  const s = worldToScreen(BASE.x, BASE.y);
  if (!onScreen(s.x, s.y, 220)) return;
  const pulse = Math.sin(state.basePulse * 2.4) * 3;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 68, 120, 35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b6a43'; ctx.beginPath(); ctx.arc(s.x, s.y + 25, 100, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b9955d'; ctx.beginPath(); ctx.arc(s.x, s.y + 20, 82, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,224,151,.65)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y + 20, 86 + pulse, 0, Math.PI * 2); ctx.stroke();

  // Campfire
  ctx.fillStyle = '#4f3522'; ctx.fillRect(s.x - 27, s.y + 30, 54, 7); ctx.save(); ctx.translate(s.x, s.y + 24); ctx.rotate(.2); ctx.fillRect(-27, -3, 54, 7); ctx.restore();
  ctx.fillStyle = '#ff9e43'; ctx.beginPath(); ctx.moveTo(s.x, s.y - 6); ctx.quadraticCurveTo(s.x - 19, s.y + 15, s.x, s.y + 25); ctx.quadraticCurveTo(s.x + 20, s.y + 13, s.x, s.y - 6); ctx.fill();
  ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.moveTo(s.x, s.y + 2); ctx.quadraticCurveTo(s.x - 8, s.y + 13, s.x, s.y + 19); ctx.quadraticCurveTo(s.x + 8, s.y + 12, s.x, s.y + 2); ctx.fill();

  // Upgrade tent / station.
  ctx.fillStyle = '#324c66'; ctx.beginPath(); ctx.moveTo(s.x - 72, s.y - 6); ctx.lineTo(s.x - 35, s.y - 58); ctx.lineTo(s.x + 2, s.y - 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#496c8d'; ctx.beginPath(); ctx.moveTo(s.x - 35, s.y - 58); ctx.lineTo(s.x + 2, s.y - 6); ctx.lineTo(s.x + 35, s.y - 58); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d5e3ef'; ctx.fillRect(s.x - 37, s.y - 24, 25, 5);
  ctx.fillStyle = '#ffd66e'; ctx.beginPath(); ctx.arc(s.x - 50, s.y - 28, 5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(5,10,7,.82)'; ctx.fillRect(s.x - 94, s.y - 112, 188, 26);
  ctx.fillStyle = '#e8f1e7'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('BASE • OFICINA DE UPGRADES', s.x, s.y - 94);
  ctx.restore();
}

function drawVignette(w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .28, w / 2, h / 2, Math.max(w, h) * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.48)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${state.flash * .12})`; ctx.fillRect(0, 0, w, h); }
}

function drawMiniMap() {
  const size = 128, x = view.w - size - 16, y = 74;
  ctx.save();
  ctx.fillStyle = 'rgba(6,11,8,.82)'; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.strokeRect(x, y, size, size);
  if (state.river?.length) {
    ctx.strokeStyle = '#68a9c7'; ctx.lineWidth = 4; ctx.beginPath();
    state.river.forEach((p, i) => { const px = x + p.x / WORLD_W * size, py = y + p.y / WORLD_H * size; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke();
  }
  for (const path of state.paths) {
    ctx.strokeStyle = '#aa9367'; ctx.lineWidth = 3; ctx.beginPath();
    path.points.forEach((p, i) => { const px = x + p.x / WORLD_W * size, py = y + p.y / WORLD_H * size; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke();
  }
  for (const t of state.trees) { const tx = x + t.x / WORLD_W * size, ty = y + t.y / WORLD_H * size; ctx.fillStyle = '#3f7b4a'; ctx.fillRect(tx, ty, 2, 2); }
  ctx.fillStyle = '#e3b866'; ctx.beginPath(); ctx.arc(x + BASE.x / WORLD_W * size, y + BASE.y / WORLD_H * size, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6da7ff'; ctx.beginPath(); ctx.arc(x + state.player.x / WORLD_W * size, y + state.player.y / WORLD_H * size, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function updateHud() {
  if (!state) return;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('kills').textContent = state.kills;
  document.getElementById('level').textContent = state.level;
  document.getElementById('waveProgress').textContent = `${state.waveKills}/${state.waveGoal}`;
  document.getElementById('xpText').textContent = `${state.xp}/${state.nextXp} XP`;
  document.getElementById('healthText').textContent = `${Math.ceil(state.hp)}/${state.maxHp}`;
  document.getElementById('healthBar').style.width = `${Math.max(0, state.hp / state.maxHp * 100)}%`;
  document.getElementById('xpBar').style.width = `${Math.max(0, state.xp / state.nextXp * 100)}%`;
  document.getElementById('damageStat').textContent = Math.round(state.damage);
  document.getElementById('rateStat').textContent = `${(1 / state.fireInterval).toFixed(1)}/s`;
  updateBaseHint();
}

function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000 || .016);
  last = now;
  update(dt);
  draw();
  raf = requestAnimationFrame(loop);
}

function updateMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = clamp(e.clientX - r.left, 0, r.width);
  mouse.y = clamp(e.clientY - r.top, 0, r.height);
  mouse.active = true;
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e'].includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
  if (k === 'e' && state && !state.paused && nearBase()) openUpgrade();
  if (k === ' ' && state && !state.paused) shoot();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('mousemove', updateMouse);
canvas.addEventListener('mousedown', e => { if (e.button === 0) { updateMouse(e); mouse.down = true; canvas.focus(); shoot(); } });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener('mouseleave', () => { mouse.active = false; });
canvas.tabIndex = 0;
canvas.addEventListener('click', () => canvas.focus());

document.getElementById('soloBtn').addEventListener('click', startGame);
document.getElementById('multiBtn').addEventListener('click', showMulti);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('menuBtn').addEventListener('click', () => { gameOver.classList.add('hidden'); game.classList.add('hidden'); menu.classList.remove('hidden'); });
document.getElementById('multiBackBtn').addEventListener('click', () => { multiLobby.classList.add('hidden'); menu.classList.remove('hidden'); });
document.getElementById('readyBtn').addEventListener('click', nextWave);

async function initDiscord() {
  try {
    const { DiscordSDK } = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.10.1/+esm');
    const clientId = window.DISCORD_CLIENT_ID || '';
    if (!clientId) { status.textContent = 'Activity pronta. Configure o ID do aplicativo no host para conectar ao Discord.'; return; }
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();
    status.textContent = '🟢 Conectado ao Discord. Escolha um modo para começar.';
  } catch (error) {
    status.textContent = 'Modo de teste local ativo. Dentro do Discord, o SDK será conectado pela Activity.';
    console.warn('[DISCORD SDK]', error);
  }
}
initDiscord();
