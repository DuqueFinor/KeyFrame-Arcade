const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const game = document.getElementById('game');
const upgrade = document.getElementById('upgrade');
const gameOver = document.getElementById('gameOver');
const multiLobby = document.getElementById('multiLobby');
const status = document.getElementById('discordStatus');
const keys = new Set();
let raf = 0;
let last = 0;
let state = null;

const upgrades = [
  { name: '❤️ Vitalidade', text: '+25 de vida máxima e recupera 25 de vida.', apply: s => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { name: '⚡ Cadência', text: 'Atira 18% mais rápido.', apply: s => { s.fireInterval = Math.max(0.12, s.fireInterval * 0.82); } },
  { name: '💨 Velocidade', text: 'Move 14% mais rápido.', apply: s => { s.speed *= 1.14; } },
  { name: '💥 Dano', text: '+30% de dano por disparo.', apply: s => { s.damage *= 1.3; } },
  { name: '🧲 Ímã', text: 'Aumenta bastante o alcance de coleta de XP.', apply: s => { s.magnet += 42; } }
];

function resize(){ canvas.width = Math.max(640, Math.floor(canvas.clientWidth * devicePixelRatio)); canvas.height = Math.max(420, Math.floor(canvas.clientHeight * devicePixelRatio)); }
new ResizeObserver(resize).observe(canvas);
resize();

function startGame(){
  menu.classList.add('hidden');
  multiLobby.classList.add('hidden');
  gameOver.classList.add('hidden');
  upgrade.classList.add('hidden');
  game.classList.remove('hidden');
  state = {
    player:{x:canvas.width/2,y:canvas.height/2,r:15},
    maxHp:100,hp:100,speed:330,damage:20,fireInterval:.42,fireTimer:0,magnet:80,
    wave:1,kills:0,xp:0,nextXp:8,level:1,spawnTimer:0,spawnInterval:.85,enemies:[],bullets:[],orbs:[],paused:false,gameOver:false
  };
  last = performance.now();
  cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  updateHud();
}

function showMulti(){
  menu.classList.add('hidden');
  multiLobby.classList.remove('hidden');
  document.getElementById('participants').textContent = '👤 Você está pronto. Convide amigos para a Activity; a sincronização da partida entra na próxima etapa.';
}

function endGame(){
  state.gameOver=true;
  document.getElementById('finalWave').textContent=state.wave;
  document.getElementById('finalKills').textContent=state.kills;
  gameOver.classList.remove('hidden');
}

function spawnEnemy(){
  const side=Math.floor(Math.random()*4), pad=40, w=canvas.width,h=canvas.height;
  let x,y;
  if(side===0){x=-pad;y=Math.random()*h}else if(side===1){x=w+pad;y=Math.random()*h}else if(side===2){x=Math.random()*w;y=-pad}else{x=Math.random()*w;y=h+pad}
  const elite=Math.random()<Math.min(.18,state.wave*.012);
  state.enemies.push({x,y,r:elite?19:13,hp:(elite?80:35)+state.wave*5,maxHp:(elite?80:35)+state.wave*5,speed:(elite?52:68)+state.wave*2,elite});
}

function nearestEnemy(){let best=null,dist=Infinity;for(const e of state.enemies){const d=(e.x-state.player.x)**2+(e.y-state.player.y)**2;if(d<dist){dist=d;best=e}}return best;}
function shoot(){const e=nearestEnemy();if(!e)return;const dx=e.x-state.player.x,dy=e.y-state.player.y,len=Math.hypot(dx,dy)||1;state.bullets.push({x:state.player.x,y:state.player.y,vx:dx/len*680,vy:dy/len*680,r:4,damage:state.damage});}
function gainXp(n){state.xp+=n;while(state.xp>=state.nextXp){state.xp-=state.nextXp;state.level++;state.nextXp=Math.floor(state.nextXp*1.38+3);openUpgrade();}}
function openUpgrade(){state.paused=true;upgrade.classList.remove('hidden');const list=document.getElementById('upgradeList');list.innerHTML='';const choices=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);for(const u of choices){const b=document.createElement('button');b.className='upgrade';b.innerHTML=`<strong>${u.name}</strong><span>${u.text}</span>`;b.addEventListener('click',()=>{u.apply(state);upgrade.classList.add('hidden');state.paused=false;last=performance.now();});list.appendChild(b);}}

function update(dt){
  if(state.paused||state.gameOver)return;
  const p=state.player;let ax=0,ay=0;if(keys.has('w')||keys.has('arrowup'))ay--;if(keys.has('s')||keys.has('arrowdown'))ay++;if(keys.has('a')||keys.has('arrowleft'))ax--;if(keys.has('d')||keys.has('arrowright'))ax++;const len=Math.hypot(ax,ay)||1;p.x=Math.max(p.r,Math.min(canvas.width-p.r,p.x+ax/len*state.speed*dt));p.y=Math.max(p.r,Math.min(canvas.height-p.r,p.y+ay/len*state.speed*dt));
  state.fireTimer+=dt;if(state.fireTimer>=state.fireInterval){state.fireTimer=0;shoot();}
  state.spawnTimer+=dt;if(state.spawnTimer>=state.spawnInterval){state.spawnTimer=0;spawnEnemy();if(state.wave>=4&&Math.random()<.25)spawnEnemy();}
  for(const e of state.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;if(d<e.r+p.r){state.hp-= (e.elite?19:12)*dt;if(state.hp<=0){state.hp=0;endGame();return;}}}
  for(const b of state.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;for(const e of state.enemies){if(e.hp<=0)continue;if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r){e.hp-=b.damage;b.deadHit=true;b.x=-9999;b.y=-9999;if(e.hp<=0){state.kills++;state.orbs.push({x:e.x,y:e.y,r:5});}break;}}}
  state.bullets=state.bullets.filter(b=>b.x>-20&&b.x<canvas.width+20&&b.y>-20&&b.y<canvas.height+20);
  state.enemies=state.enemies.filter(e=>e.hp>0);
  for(const o of state.orbs){const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy)||1;if(d<state.magnet)o.x+=dx/d*250*dt,o.y+=dy/d*250*dt;if(d<22){o.collected=true;gainXp(1);}}
  state.orbs=state.orbs.filter(o=>!o.collected);
  const targetWave=1+Math.floor(state.kills/12);if(targetWave>state.wave){state.wave=targetWave;state.spawnInterval=Math.max(.22,.85-state.wave*.045);}
  updateHud();
}

function draw(){
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#070a10';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(100,125,165,.08)';ctx.lineWidth=1;const grid=56;for(let x=0;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  for(const o of state.orbs){ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fillStyle='#74a7ff';ctx.fill()}
  for(const b of state.bullets){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle='#f6d365';ctx.fill()}
  for(const e of state.enemies){ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fillStyle=e.elite?'#b06cff':'#e85463';ctx.fill();ctx.beginPath();ctx.arc(e.x-e.r*.28,e.y-e.r*.15,2.2,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();const bw=e.r*2.2;ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(e.x-bw/2,e.y-e.r-9,bw,4);ctx.fillStyle='#ff7180';ctx.fillRect(e.x-bw/2,e.y-e.r-9,bw*(e.hp/e.maxHp),4)}
  const p=state.player;ctx.beginPath();ctx.arc(p.x,p.y,p.r+5,0,Math.PI*2);ctx.fillStyle='rgba(83,145,255,.16)';ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='#5c91ff';ctx.fill();ctx.beginPath();ctx.arc(p.x-4,p.y-4,3,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
}
function updateHud(){document.getElementById('wave').textContent=state.wave;document.getElementById('kills').textContent=state.kills;document.getElementById('level').textContent=state.level;document.getElementById('healthBar').style.width=`${Math.max(0,state.hp/state.maxHp*100)}%`;}
function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();raf=requestAnimationFrame(loop);}

window.addEventListener('keydown',e=>{if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){keys.add(e.key.toLowerCase());e.preventDefault();}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
document.getElementById('soloBtn').addEventListener('click',startGame);
document.getElementById('multiBtn').addEventListener('click',showMulti);
document.getElementById('restartBtn').addEventListener('click',startGame);
document.getElementById('menuBtn').addEventListener('click',()=>{gameOver.classList.add('hidden');game.classList.add('hidden');menu.classList.remove('hidden');});
document.getElementById('multiBackBtn').addEventListener('click',()=>{multiLobby.classList.add('hidden');menu.classList.remove('hidden');});

async function initDiscord(){
  try{
    const { DiscordSDK } = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.10.1/+esm');
    const clientId = window.DISCORD_CLIENT_ID || '';
    if(!clientId){status.textContent='Activity pronta. Configure o ID do aplicativo no host para conectar ao Discord.';return;}
    const sdk=new DiscordSDK(clientId);await sdk.ready();status.textContent='🟢 Conectado ao Discord. Escolha um modo para começar.';
  }catch(error){status.textContent='Modo de teste local ativo. Dentro do Discord, o SDK será conectado pela Activity.';console.warn('[DISCORD SDK]',error);}
}
initDiscord();
