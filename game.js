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

const WORLD_W = 3600;
const WORLD_H = 2400;

const upgrades = [
  { name: '❤️ Vitalidade', text: '+25 de vida máxima e recupera 25 de vida.', apply: s => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { name: '⚡ Cadência', text: 'Atira 18% mais rápido.', apply: s => { s.fireInterval = Math.max(0.11, s.fireInterval * 0.82); } },
  { name: '💨 Velocidade', text: 'Move 14% mais rápido.', apply: s => { s.speed *= 1.14; } },
  { name: '💥 Dano', text: '+30% de dano por disparo.', apply: s => { s.damage *= 1.3; } },
  { name: '🧲 Ímã', text: 'Aumenta o alcance de coleta de XP.', apply: s => { s.magnet += 48; } },
  { name: '🔫 Multitiro', text: '+1 projétil por disparo.', apply: s => { s.multishot = Math.min(5, s.multishot + 1); } },
  { name: '🏃 Passos leves', text: 'Mais velocidade e menor empurrão dos inimigos.', apply: s => { s.speed *= 1.08; s.knockbackResist = Math.min(.7, s.knockbackResist + .12); } }
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

function startGame() {
  menu.classList.add('hidden');
  multiLobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  upgrade.classList.add('hidden');
  waveBreak.classList.add('hidden');
  game.classList.remove('hidden');

  state = {
    player: { x: WORLD_W / 2, y: WORLD_H / 2, r: 17, angle: 0 },
    camera: { x: WORLD_W / 2 - view.w / 2, y: WORLD_H / 2 - view.h / 2 },
    maxHp: 100, hp: 100, speed: 280, damage: 24, fireInterval: .42, fireTimer: .2,
    magnet: 82, multishot: 1, knockbackResist: 0,
    wave: 1, kills: 0, xp: 0, nextXp: 8, level: 1,
    waveKills: 0, waveGoal: 10, spawnTimer: 0, spawnInterval: .72,
    enemies: [], bullets: [], orbs: [], particles: [], trees: [], rocks: [], grass: [],
    paused: false, gameOver: false, waveCleared: false, waveCountdown: false,
    totalTime: 0, flash: 0
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

  const center = { x: WORLD_W / 2, y: WORLD_H / 2 };
  for (let i = 0; i < 190; i++) {
    const x = rand(70, WORLD_W - 70), y = rand(70, WORLD_H - 70);
    if (dist(x, y, center.x, center.y) < 330) continue;
    state.trees.push({ x, y, r: rand(20, 33), type: Math.random() < .25 ? 'pine' : 'oak', hue: Math.random() });
  }
  for (let i = 0; i < 110; i++) {
    state.rocks.push({ x: rand(50, WORLD_W - 50), y: rand(50, WORLD_H - 50), r: rand(7, 17) });
  }
  for (let i = 0; i < 720; i++) {
    state.grass.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), len: rand(4, 10), rot: rand(-.5, .5) });
  }
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
  const margin = 70;
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
  const hp = elite ? 150 + state.wave * 13 : brute ? 75 + state.wave * 8 : 34 + state.wave * 5;
  const speed = elite ? 48 + state.wave * 1.3 : brute ? 56 + state.wave * 1.5 : 72 + state.wave * 2;
  state.enemies.push({ x, y, r: elite ? 23 : brute ? 18 : 14, hp, maxHp: hp, speed, elite, brute, hit: 0, angle: rand(0, Math.PI * 2) });
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
  if (mouse.active) return screenToWorld(mouse.x, mouse.y);
  const e = nearestEnemy();
  return e ? { x: e.x, y: e.y } : { x: state.player.x + Math.cos(state.player.angle) * 100, y: state.player.y + Math.sin(state.player.angle) * 100 };
}

function shoot() {
  const target = getAimTarget();
  const dx = target.x - state.player.x, dy = target.y - state.player.y;
  const baseAngle = Math.atan2(dy, dx);
  state.player.angle = baseAngle;
  const count = state.multishot;
  const spread = count === 1 ? 0 : .16;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const a = baseAngle + offset;
    state.bullets.push({
      x: state.player.x + Math.cos(a) * 20,
      y: state.player.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 720,
      vy: Math.sin(a) * 720,
      r: 5,
      damage: state.damage,
      life: 1.1
    });
  }
}

function gainXp(n) {
  state.xp += n;
  while (state.xp >= state.nextXp) {
    state.xp -= state.nextXp;
    state.level++;
    state.nextXp = Math.floor(state.nextXp * 1.38 + 3);
    openUpgrade();
    if (state.gameOver) break;
  }
}

function openUpgrade() {
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
      upgrade.classList.add('hidden');
      state.paused = false;
      last = performance.now();
      updateHud();
    }, { once: true });
    list.appendChild(b);
  }
}

function clearWave() {
  if (state.waveCleared || state.gameOver) return;
  state.waveCleared = true;
  state.waveCountdown = true;
  state.paused = true;
  document.getElementById('breakWaveNumber').textContent = state.wave;
  document.getElementById('breakKills').textContent = state.waveKills;
  document.getElementById('nextWaveNumber').textContent = state.wave + 1;
  waveBreak.classList.remove('hidden');
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
  state.paused = false;
  waveBreak.classList.add('hidden');
  state.flash = .45;
  last = performance.now();
  updateHud();
}

function update(dt) {
  if (state.paused || state.gameOver) return;
  state.totalTime += dt;
  state.flash = Math.max(0, state.flash - dt);

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

  if (mouse.active) {
    const target = screenToWorld(mouse.x, mouse.y);
    p.angle = Math.atan2(target.y - p.y, target.x - p.x);
  }

  state.fireTimer += dt;
  if (state.fireTimer >= state.fireInterval) {
    state.fireTimer = 0;
    if (mouse.down || state.enemies.length > 0) shoot();
  }

  state.spawnTimer += dt;
  if (state.waveKills < state.waveGoal && state.spawnTimer >= state.spawnInterval) {
    state.spawnTimer = 0;
    spawnEnemy();
    if (state.wave >= 4 && Math.random() < Math.min(.38, state.wave * .035)) spawnEnemy();
  }

  for (const e of state.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.x += dx / d * e.speed * dt;
    e.y += dy / d * e.speed * dt;
    e.hit = Math.max(0, e.hit - dt);
    if (d < e.r + p.r + 3) {
      state.hp -= (e.elite ? 20 : e.brute ? 15 : 11) * dt;
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
        if (e.hp <= 0) {
          state.kills++;
          state.waveKills++;
          const value = e.elite ? 4 : e.brute ? 2 : 1;
          for (let i = 0; i < value; i++) state.orbs.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), r: 6, value: 1, collected: false });
          burst(e.x, e.y, e.elite ? '#c58cff' : '#ff7b7b', e.elite ? 13 : 7);
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
      const pull = d < 50 ? 520 : 280;
      o.x += dx / d * pull * dt;
      o.y += dy / d * pull * dt;
    }
    if (d < 25) { o.collected = true; gainXp(o.value); burst(o.x, o.y, '#75a8ff', 3); }
  }
  state.orbs = state.orbs.filter(o => !o.collected);

  updateParticles(dt);

  const waveFinished = state.waveKills >= state.waveGoal && state.enemies.length === 0;
  if (waveFinished) clearWave();

  const desiredX = clamp(p.x - view.w / 2, 0, WORLD_W - view.w);
  const desiredY = clamp(p.y - view.h / 2, 0, WORLD_H - view.h);
  state.camera.x += (desiredX - state.camera.x) * Math.min(1, dt * 7);
  state.camera.y += (desiredY - state.camera.y) * Math.min(1, dt * 7);

  updateHud();
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
  ctx.fillStyle = '#0a140e';
  ctx.fillRect(0, 0, w, h);

  drawForest(w, h);
  drawEntities();
  drawVignette(w, h);
  drawMiniMap();
}

function drawForest(w, h) {
  ctx.fillStyle = '#17301d';
  ctx.fillRect(0, 0, w, h);

  // subtle terrain bands
  ctx.strokeStyle = 'rgba(173, 205, 142, .055)';
  ctx.lineWidth = 1;
  for (let x = -((state.camera.x) % 64); x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = -((state.camera.y) % 64); y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  for (const g of state.grass) {
    const s = worldToScreen(g.x, g.y);
    if (s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(g.rot);
    ctx.strokeStyle = 'rgba(103, 157, 83, .48)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -g.len); ctx.stroke(); ctx.restore();
  }

  for (const r of state.rocks) {
    const s = worldToScreen(r.x, r.y);
    if (s.x < -30 || s.x > w + 30 || s.y < -30 || s.y > h + 30) continue;
    ctx.fillStyle = '#354338';
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, r * 1.15, r * .72, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4b5c4e';
    ctx.beginPath(); ctx.ellipse(s.x - r * .2, s.y - r * .15, r * .75, r * .45, -.25, 0, Math.PI * 2); ctx.fill();
  }

  const visibleTrees = state.trees.filter(t => {
    const s = worldToScreen(t.x, t.y); return s.x > -80 && s.x < w + 80 && s.y > -100 && s.y < h + 100;
  }).sort((a, b) => a.y - b.y);
  for (const t of visibleTrees) drawTree(t);
}

function drawTree(t) {
  const s = worldToScreen(t.x, t.y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + t.r * .72, t.r * .9, t.r * .35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#68472d';
  ctx.fillRect(s.x - t.r * .16, s.y, t.r * .32, t.r * .95);
  if (t.type === 'pine') {
    ctx.fillStyle = '#1d5a36';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(s.x, s.y - t.r * 1.35 + i * t.r * .45); ctx.lineTo(s.x - t.r * (.75 - i * .1), s.y + t.r * .35 + i * t.r * .05); ctx.lineTo(s.x + t.r * (.75 - i * .1), s.y + t.r * .35 + i * t.r * .05); ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#245f37';
    ctx.beginPath(); ctx.arc(s.x - t.r * .45, s.y - t.r * .55, t.r * .68, 0, Math.PI * 2); ctx.arc(s.x + t.r * .45, s.y - t.r * .55, t.r * .72, 0, Math.PI * 2); ctx.arc(s.x, s.y - t.r * .95, t.r * .75, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7442';
    ctx.beginPath(); ctx.arc(s.x - t.r * .25, s.y - t.r * 1.08, t.r * .4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawEntities() {
  for (const o of state.orbs) {
    const s = worldToScreen(o.x, o.y); if (!onScreen(s.x, s.y, 20)) continue;
    ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = '#6fa5ff'; ctx.fillStyle = '#77aaff';
    ctx.beginPath(); ctx.arc(s.x, s.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  for (const b of state.bullets) {
    const s = worldToScreen(b.x, b.y); if (!onScreen(s.x, s.y, 20)) continue;
    ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = '#ffd36a'; ctx.fillStyle = '#ffe29a';
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
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + e.r + 5, e.r * 1.1, e.r * .35, 0, 0, Math.PI * 2); ctx.fill();
  const body = e.hit > 0 ? '#fff' : e.elite ? '#8e4fcb' : e.brute ? '#b24b47' : '#d85b62';
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(s.x, s.y, e.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = e.elite ? '#5a2c82' : '#742d35';
  ctx.beginPath(); ctx.arc(s.x, s.y + e.r * .12, e.r * .72, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7f7f7';
  ctx.beginPath(); ctx.arc(s.x - e.r * .28, s.y - e.r * .12, e.r * .16, 0, Math.PI * 2); ctx.arc(s.x + e.r * .28, s.y - e.r * .12, e.r * .16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#18151a';
  ctx.beginPath(); ctx.arc(s.x - e.r * .28, s.y - e.r * .1, e.r * .07, 0, Math.PI * 2); ctx.arc(s.x + e.r * .28, s.y - e.r * .1, e.r * .07, 0, Math.PI * 2); ctx.fill();
  const bw = e.r * 2.4;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(s.x - bw / 2, s.y - e.r - 11, bw, 5);
  ctx.fillStyle = e.elite ? '#c987ff' : '#ff7c83'; ctx.fillRect(s.x - bw / 2, s.y - e.r - 11, bw * clamp(e.hp / e.maxHp, 0, 1), 5);
  ctx.restore();
}

function drawPlayer() {
  const p = state.player, s = worldToScreen(p.x, p.y);
  ctx.save();
  ctx.translate(s.x, s.y); ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(0, 16, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#26384f'; ctx.beginPath(); ctx.arc(0, 3, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e6fb8'; ctx.beginPath(); ctx.arc(-2, -5, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e6b58c'; ctx.beginPath(); ctx.arc(2, -8, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17202d'; ctx.beginPath(); ctx.arc(1, -11, 7, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4c49e'; ctx.fillRect(10, -3, 13, 6);
  ctx.fillStyle = '#f0b34e'; ctx.fillRect(21, -2, 8, 4);
  ctx.restore();

  // direction marker
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(s.x, s.y, 23, 0, Math.PI * 2); ctx.stroke();
}

function drawVignette(w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${state.flash * .12})`; ctx.fillRect(0, 0, w, h); }
}

function drawMiniMap() {
  const size = 112, x = view.w - size - 14, y = 14;
  ctx.save();
  ctx.fillStyle = 'rgba(6,11,8,.78)'; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.strokeRect(x, y, size, size);
  for (const t of state.trees) {
    const tx = x + t.x / WORLD_W * size, ty = y + t.y / WORLD_H * size;
    ctx.fillStyle = '#3f7b4a'; ctx.fillRect(tx, ty, 2, 2);
  }
  ctx.fillStyle = '#6da7ff'; ctx.beginPath(); ctx.arc(x + state.player.x / WORLD_W * size, y + state.player.y / WORLD_H * size, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function onScreen(x, y, pad = 0) { return x > -pad && x < view.w + pad && y > -pad && y < view.h + pad; }

function updateHud() {
  if (!state) return;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('kills').textContent = state.kills;
  document.getElementById('level').textContent = state.level;
  document.getElementById('waveProgress').textContent = `${state.waveKills}/${state.waveGoal}`;
  document.getElementById('xpText').textContent = `${state.xp}/${state.nextXp} XP`;
  document.getElementById('healthBar').style.width = `${Math.max(0, state.hp / state.maxHp * 100)}%`;
  document.getElementById('xpBar').style.width = `${Math.max(0, state.xp / state.nextXp * 100)}%`;
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
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
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
