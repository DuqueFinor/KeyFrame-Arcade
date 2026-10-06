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

function startGame() {
  menu.classList.add('hidden');
  multiLobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  upgrade.classList.add('hidden');
  waveBreak.classList.add('hidden');
  game.classList.remove('hidden');
  // The canvas starts inside a hidden container; measure it again after revealing the game.
  requestAnimationFrame(() => resize());

  state = {
    player: { x: BASE.x, y: BASE.y + 90, r: 19, angle: 0 },
    camera: { x: BASE.x - view.w / 2, y: BASE.y - view.h / 2 },
    maxHp: 100, hp: 100, speed: 285, damage: 24, fireInterval: .42, fireTimer: .1,
    magnet: 90, multishot: 1, knockbackResist: 0, damageReduction: 0,
    bulletLife: 1.15, bulletRadius: 5,
    wave: 1, kills: 0, xp: 0, nextXp: 8, level: 1, pendingUpgrades: 0,
    waveKills: 0, waveGoal: 10, spawnTimer: 0, spawnInterval: .72,
    enemies: [], bullets: [], orbs: [], particles: [], trees: [], rocks: [], grass: [],
    flowers: [], paths: [], decorations: [],
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
  state.grass.length = 0;
  state.flowers.length = 0;
  state.paths.length = 0;
  state.decorations.length = 0;

  // Main dirt trails: a broad winding route through the forest and several side paths.
  const main = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    main.push({ x: 260 + t * (WORLD_W - 520), y: WORLD_H * .54 + Math.sin(t * Math.PI * 2.3) * 300 + Math.sin(t * 7) * 80 });
  }
  state.paths.push({ points: main, width: 150, inner: 105 });
  const sideA = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    sideA.push({ x: BASE.x - 40 + Math.sin(t * Math.PI) * 460, y: BASE.y + 80 - t * 1050 });
  }
  state.paths.push({ points: sideA, width: 105, inner: 70 });
  const sideB = [];
  for (let i = 0; i <= 13; i++) {
    const t = i / 13;
    sideB.push({ x: BASE.x + 70 + t * 1050, y: BASE.y + 30 + Math.sin(t * Math.PI * 1.4) * 250 + t * 720 });
  }
  state.paths.push({ points: sideB, width: 110, inner: 72 });

  const clearRadius = 360;
  for (let i = 0; i < 230; i++) {
    const x = rand(50, WORLD_W - 50), y = rand(50, WORLD_H - 50);
    if (dist(x, y, BASE.x, BASE.y) < clearRadius) continue;
    if (nearAnyPath(x, y, 95)) continue;
    state.trees.push({ x, y, r: rand(24, 42), type: Math.random() < .28 ? 'pine' : 'oak', variant: Math.floor(rand(0, 3)) });
  }
  for (let i = 0; i < 145; i++) {
    const x = rand(45, WORLD_W - 45), y = rand(45, WORLD_H - 45);
    if (dist(x, y, BASE.x, BASE.y) < 250 || nearAnyPath(x, y, 60)) continue;
    state.rocks.push({ x, y, r: rand(9, 22), variant: Math.floor(rand(0, 4)) });
  }
  for (let i = 0; i < 1250; i++) {
    state.grass.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), len: rand(4, 11), rot: rand(-.8, .8), tone: Math.random() });
  }
  for (let i = 0; i < 380; i++) {
    state.flowers.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), color: pick(['#e8c66c', '#d7838b', '#b7a2e8', '#e8e1c5']), r: rand(1.4, 2.6) });
  }
  for (let i = 0; i < 75; i++) {
    const a = rand(0, Math.PI * 2), r = rand(230, 1050);
    state.decorations.push({ x: BASE.x + Math.cos(a) * r, y: BASE.y + Math.sin(a) * r, type: pick(['stump', 'bush', 'log']) });
  }
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
  const elite = Math.random() < Math.min(.14, .035 + state.wave * .008);
  const brute = !elite && Math.random() < Math.min(.18, state.wave * .012);
  const hp = elite ? 170 + state.wave * 15 : brute ? 78 + state.wave * 9 : 36 + state.wave * 5;
  const speed = elite ? 48 + state.wave * 1.3 : brute ? 56 + state.wave * 1.5 : 72 + state.wave * 2;
  state.enemies.push({ x, y, r: elite ? 25 : brute ? 19 : 15, hp, maxHp: hp, speed, elite, brute, hit: 0, angle: rand(0, Math.PI * 2) });
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
  if (ax || ay) {
    p.x += ax / moveLen * state.speed * dt;
    p.y += ay / moveLen * state.speed * dt;
  }
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
  ctx.fillStyle = '#263c25';
  ctx.fillRect(0, 0, w, h);

  // Organic ground texture instead of the old grid.
  const cell = 92;
  for (let gx = Math.floor(state.camera.x / cell) * cell - state.camera.x; gx < w + cell; gx += cell) {
    for (let gy = Math.floor(state.camera.y / cell) * cell - state.camera.y; gy < h + cell; gy += cell) {
      const n = ((Math.floor((gx + state.camera.x) / cell) * 17 + Math.floor((gy + state.camera.y) / cell) * 31) % 7);
      ctx.fillStyle = n < 3 ? 'rgba(57,86,48,.13)' : 'rgba(18,37,23,.08)';
      ctx.fillRect(gx, gy, cell, cell);
    }
  }

  drawPaths();

  for (const g of state.grass) {
    const s = worldToScreen(g.x, g.y);
    if (!onScreen(s.x, s.y, 20)) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(g.rot);
    ctx.strokeStyle = g.tone > .5 ? 'rgba(112,151,78,.42)' : 'rgba(83,129,69,.34)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(g.len * .15, -g.len * .4, 0, -g.len); ctx.stroke();
    ctx.restore();
  }

  for (const f of state.flowers) {
    const s = worldToScreen(f.x, f.y); if (!onScreen(s.x, s.y, 8)) continue;
    ctx.fillStyle = f.color; ctx.globalAlpha = .72; ctx.beginPath(); ctx.arc(s.x, s.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  for (const d of state.decorations) drawDecoration(d);

  for (const r of state.rocks) {
    const s = worldToScreen(r.x, r.y);
    if (!onScreen(s.x, s.y, 35)) continue;
    drawRock(r, s.x, s.y);
  }

  const visibleTrees = state.trees.filter(t => {
    const s = worldToScreen(t.x, t.y); return s.x > -90 && s.x < w + 90 && s.y > -120 && s.y < h + 120;
  }).sort((a, b) => a.y - b.y);
  for (const t of visibleTrees) drawTree(t);
}

function drawPaths() {
  for (const path of state.paths) {
    drawPathStroke(path.points, path.width, '#a28b61');
    drawPathStroke(path.points, path.inner, '#b9a172');
    drawPathStroke(path.points, Math.max(16, path.inner * .72), 'rgba(208,185,130,.32)');
    // Small stones along the edges.
    for (let i = 0; i < path.points.length; i += 2) {
      const p = path.points[i], s = worldToScreen(p.x + Math.sin(i * 3) * 10, p.y + Math.cos(i * 2) * 10);
      if (!onScreen(s.x, s.y, 25)) continue;
      ctx.fillStyle = 'rgba(93,78,55,.62)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 4, 2.5, .3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPathStroke(points, width, color) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const first = worldToScreen(points[0].x, points[0].y);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const a = worldToScreen(points[i].x, points[i].y);
    const b = worldToScreen(points[i + 1].x, points[i + 1].y);
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const lastP = worldToScreen(points[points.length - 1].x, points[points.length - 1].y);
  ctx.lineTo(lastP.x, lastP.y);
  ctx.stroke();
  ctx.restore();
}

function drawRock(r, x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(x, y + r * .55, r * 1.25, r * .38, -.1, 0, Math.PI * 2); ctx.fill();
  const colors = ['#667062', '#70776b', '#596158', '#7a7d72'];
  ctx.fillStyle = colors[r.variant];
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * .35); ctx.lineTo(x - r * .65, y - r * .5); ctx.lineTo(x - r * .05, y - r * .9); ctx.lineTo(x + r * .75, y - r * .45); ctx.lineTo(x + r, y + r * .35); ctx.lineTo(x + r * .2, y + r * .7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(220,225,210,.16)'; ctx.beginPath(); ctx.moveTo(x - r * .45, y - r * .35); ctx.lineTo(x - r * .05, y - r * .7); ctx.lineTo(x + r * .35, y - r * .42); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDecoration(d) {
  const s = worldToScreen(d.x, d.y); if (!onScreen(s.x, s.y, 40)) return;
  ctx.save();
  if (d.type === 'stump') {
    ctx.fillStyle = '#67492f'; ctx.fillRect(s.x - 9, s.y - 7, 18, 14);
    ctx.fillStyle = '#9d7950'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 7, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (d.type === 'log') {
    ctx.translate(s.x, s.y); ctx.rotate(-.25); ctx.fillStyle = '#68472e'; ctx.fillRect(-24, -7, 48, 14); ctx.fillStyle = '#a57b50'; ctx.beginPath(); ctx.arc(24, 0, 7, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#315e38'; ctx.beginPath(); ctx.arc(s.x - 8, s.y, 10, 0, Math.PI * 2); ctx.arc(s.x + 4, s.y - 5, 12, 0, Math.PI * 2); ctx.arc(s.x + 13, s.y + 3, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTree(t) {
  const s = worldToScreen(t.x, t.y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + t.r * .82, t.r * 1.05, t.r * .38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#68472d';
  ctx.fillRect(s.x - t.r * .17, s.y - 1, t.r * .34, t.r * 1.05);
  ctx.fillStyle = '#825a35'; ctx.fillRect(s.x - t.r * .06, s.y, t.r * .12, t.r * .9);
  if (t.type === 'pine') {
    const greens = ['#1e5c38', '#276b3e', '#174b31'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = greens[(t.variant + i) % greens.length];
      ctx.beginPath(); ctx.moveTo(s.x, s.y - t.r * 1.65 + i * t.r * .43); ctx.lineTo(s.x - t.r * (.8 - i * .08), s.y + t.r * .28 + i * t.r * .05); ctx.lineTo(s.x + t.r * (.8 - i * .08), s.y + t.r * .28 + i * t.r * .05); ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = t.variant === 1 ? '#2f7041' : '#245f37';
    ctx.beginPath();
    ctx.arc(s.x - t.r * .5, s.y - t.r * .55, t.r * .68, 0, Math.PI * 2);
    ctx.arc(s.x + t.r * .48, s.y - t.r * .55, t.r * .72, 0, Math.PI * 2);
    ctx.arc(s.x, s.y - t.r * 1.05, t.r * .78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#43834c'; ctx.globalAlpha = .65;
    ctx.beginPath(); ctx.arc(s.x - t.r * .25, s.y - t.r * 1.12, t.r * .36, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.restore();
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
  const s = worldToScreen(e.x, e.y); if (!onScreen(s.x, s.y, 60)) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + e.r + 6, e.r * 1.1, e.r * .35, 0, 0, Math.PI * 2); ctx.fill();
  const body = e.hit > 0 ? '#fff' : e.elite ? '#8e4fcb' : e.brute ? '#b24b47' : '#d85b62';
  ctx.fillStyle = body;
  ctx.beginPath();
  if (e.elite) {
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = i % 2 ? e.r * .78 : e.r * 1.12; const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
  } else { ctx.arc(s.x, s.y, e.r, 0, Math.PI * 2); }
  ctx.fill();
  ctx.fillStyle = e.elite ? '#5a2c82' : '#742d35'; ctx.beginPath(); ctx.arc(s.x, s.y + e.r * .12, e.r * .72, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7f7f7'; ctx.beginPath(); ctx.arc(s.x - e.r * .28, s.y - e.r * .12, e.r * .16, 0, Math.PI * 2); ctx.arc(s.x + e.r * .28, s.y - e.r * .12, e.r * .16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#18151a'; ctx.beginPath(); ctx.arc(s.x - e.r * .28, s.y - e.r * .1, e.r * .07, 0, Math.PI * 2); ctx.arc(s.x + e.r * .28, s.y - e.r * .1, e.r * .07, 0, Math.PI * 2); ctx.fill();
  const bw = e.r * 2.5; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(s.x - bw / 2, s.y - e.r - 12, bw, 5); ctx.fillStyle = e.elite ? '#c987ff' : '#ff7c83'; ctx.fillRect(s.x - bw / 2, s.y - e.r - 12, bw * clamp(e.hp / e.maxHp, 0, 1), 5);
  ctx.restore();
}

function drawPlayer() {
  const p = state.player, s = worldToScreen(p.x, p.y);
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, 17, 21, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#26384f'; ctx.beginPath(); ctx.arc(0, 3, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e6fb8'; ctx.beginPath(); ctx.arc(-2, -5, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e6b58c'; ctx.beginPath(); ctx.arc(2, -8, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17202d'; ctx.beginPath(); ctx.arc(1, -11, 7.5, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4c49e'; ctx.fillRect(11, -3, 14, 6);
  ctx.fillStyle = '#f0b34e'; ctx.fillRect(23, -2, 9, 4);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 25, 0, Math.PI * 2); ctx.stroke();
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
