/* 高考冲刺跑酷 · 张雪峰马拉松
   纯前端 Canvas 跑酷小游戏，电脑/手机自适应。 */
(() => {
'use strict';

// ---------- 资源 ----------
const ASSET_LIST = {
  run0: 'assets/run0.png', run1: 'assets/run1.png', run2: 'assets/run2.png',
  run3: 'assets/run3.png', run4: 'assets/run4.png', run5: 'assets/run5.png',
  slide: 'assets/slide.png',   // 滑铲动作（躲高空障碍）
  hurt: 'assets/crouch.png',   // 受伤（仅撞击/游戏结束时显示）
  obstacle_sprite: 'assets/obstacle_sprite.png',     // 雪碧（地面，跳）
  obstacle_icecream: 'assets/obstacle_icecream.png', // 巧乐兹（高空，滑铲）
  book1: 'assets/book1.png',  // 练习册 +1
  book2: 'assets/book2.png',  // 志愿书 +2
  sky: 'assets/sky.png', far: 'assets/far.png',
  belt: 'assets/belt.png',       // 跑步机传送带（循环滚动）
  console: 'assets/console.png', // 跑步机控制台/扶手（固定最右）
};
const A = {};
function preload() {
  const keys = Object.keys(ASSET_LIST);
  return Promise.all(keys.map(k => new Promise(res => {
    const img = new Image();
    img.onload = () => { A[k] = img; res(); };
    img.onerror = () => { A[k] = null; res(); };
    img.src = ASSET_LIST[k];
  })));
}

// ---------- 画布 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let groundY = 0;        // 主角脚底所在 y
let S = 1;              // 整体缩放（基于高度，设计高度 400）

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const wrap = document.getElementById('game-wrap');
  W = wrap.clientWidth; H = wrap.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  S = Math.min(H / 400, W / 700);   // 兼顾竖屏：窄屏时按宽度缩放，人物不会过大
  groundY = H - H * 0.17;   // 脚底线（跑步机上表面附近）
}
window.addEventListener('resize', resize);

// ---------- 工具 ----------
const rand = (a, b) => a + Math.random() * (b - a);
function drawSprite(img, cx, footY, h, flip) {
  if (!img) return;
  const w = h * (img.width / img.height);
  ctx.save();
  ctx.translate(cx, footY - h);
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
  return w;
}

// ---------- 音效（WebAudio，无需素材）----------
let actx = null;
function initAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); }
function beep(freq, dur, type = 'square', vol = 0.12, slideTo) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
const sfx = {
  jump: () => beep(420, 0.18, 'square', 0.10, 760),
  collect: () => { beep(880, 0.10, 'sine', 0.14); setTimeout(() => beep(1320, 0.12, 'sine', 0.12), 70); },
  hit: () => beep(200, 0.4, 'sawtooth', 0.18, 60),
};

// ---------- 游戏状态 ----------
const STATE = { READY: 0, PLAYING: 1, OVER: 2 };
let state = STATE.READY;
let score = 0, best = +(localStorage.getItem('zxf_best') || 0);
let speed = 0, dist = 0, elapsed = 0;
let scrollFar = 0, scrollGround = 0;
let spawnTimer = 0;
let obstacles = [];   // {kind, x, footY, h, w, type:'jump'|'duck'}
let items = [];       // {img, x, y, h, value, taken}
let runFrame = 0, runTimer = 0;

// 玩家
const player = {
  y: 0, vy: 0, onGround: true, sliding: false, dead: false,
};

function baseSpeed() { return Math.max(300, W * 0.42); }

function reset() {
  score = 0; dist = 0; elapsed = 0; speed = baseSpeed();
  obstacles = []; items = []; spawnTimer = 0.6;
  player.y = 0; player.vy = 0; player.onGround = true; player.sliding = false; player.dead = false;
  slideHeld = false; pointerId = null;
  runFrame = 0; runTimer = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('best').textContent = best;
}

// ---------- 输入 ----------
let slideHeld = false;
function jump() {
  if (state !== STATE.PLAYING) return;
  if (player.onGround && !player.sliding) {
    player.vy = -1080 * S;
    player.onGround = false;
    sfx.jump();
  }
}
function setSlide(on) {
  slideHeld = on;
  if (state === STATE.PLAYING) player.sliding = on && player.onGround;
}

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault(); initAudio();
    if (state === STATE.PLAYING) jump(); else startOrRestart();
  } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    e.preventDefault(); setSlide(true);
  } else if (e.code === 'Enter') {
    if (state !== STATE.PLAYING) startOrRestart();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') setSlide(false);
});

// 指针（手机/鼠标）
let pointerStartY = 0, pointerId = null;
canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== STATE.PLAYING) { return; }   // 由按钮触发开始/重开
  pointerId = e.pointerId; pointerStartY = e.clientY;
  // 下方 1/3 区域按住 = 滑铲
  if (e.clientY > H * 0.66) setSlide(true);
  else jump();
});
canvas.addEventListener('pointermove', e => {
  if (pointerId !== e.pointerId || state !== STATE.PLAYING) return;
  if (e.clientY - pointerStartY > 40) setSlide(true);   // 下滑 = 滑铲
});
canvas.addEventListener('pointerup', e => { if (pointerId === e.pointerId) { setSlide(false); pointerId = null; } });
canvas.addEventListener('pointercancel', () => { setSlide(false); pointerId = null; });

// 按钮
document.getElementById('btn-start').addEventListener('click', () => { initAudio(); startOrRestart(); });
document.getElementById('btn-restart').addEventListener('click', () => { initAudio(); startOrRestart(); });

function startOrRestart() {
  reset();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('over-screen').classList.add('hidden');
  state = STATE.PLAYING;
}

// ---------- 生成障碍 / 道具 ----------
function spawn() {
  const r = Math.random();
  if (r < 0.58) {
    // 障碍物
    if (Math.random() < 0.55) {
      const h = 68 * S;
      obstacles.push({ img: A.obstacle_sprite, x: W + 60, footY: groundY, h, type: 'jump' });
    } else {
      const h = 52 * S;
      // 高空雪糕，位于头部高度，需蹲下
      obstacles.push({ img: A.obstacle_icecream, x: W + 60, footY: groundY - playerHeight() * 0.62, h, type: 'duck' });
    }
  } else {
    // 收集道具
    const isBig = Math.random() < 0.4;
    const img = isBig ? A.book2 : A.book1;
    const value = isBig ? 2 : 1;
    const h = 48 * S;
    const y = groundY - rand(playerHeight() * 0.3, playerHeight() * 1.25);
    items.push({ img, x: W + 60, y, h, value, taken: false });
  }
}

function playerHeight() { return 120 * S; }
function playerSlideHeight() { return 86 * S; }   // 滑铲精灵绘制高度（含身体，趴下姿势）
const PLAYER_X = 0.14;                              // 主角身体左缘所在屏幕比例

// ---------- 碰撞 ----------
function rectsHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function playerBox() {
  const footY = groundY - player.y;
  if (player.sliding && player.onGround) {
    // 滑铲：低矮碰撞盒，可钻过高空障碍
    const h = 48 * S, w = 92 * S;
    return { x: W * PLAYER_X + 6 * S, y: footY - h, w, h };
  }
  const ph = playerHeight();
  const pw = ph * (A.run0 ? A.run0.width / A.run0.height : 0.75);
  // 收缩碰撞盒，手感更宽容
  const mx = pw * 0.22, my = ph * 0.12;
  return { x: W * PLAYER_X + mx, y: footY - ph + my, w: pw - mx * 2, h: ph - my * 2 };
}

// ---------- 更新 ----------
function update(dt) {
  if (state !== STATE.PLAYING) return;
  elapsed += dt;
  speed = baseSpeed() * Math.min(2.3, 1 + elapsed * 0.035);
  dist += speed * dt;

  // 计分（距离）
  score += speed * dt * 0.02;
  document.getElementById('score').textContent = Math.floor(score);

  // 背景滚动
  scrollFar = (scrollFar + speed * 0.18 * dt) % (farDrawW());
  scrollGround = (scrollGround + speed * dt) % (beltTileW());

  // 玩家物理
  player.vy += 2600 * S * dt;
  player.y -= player.vy * dt;
  if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }
  else player.onGround = false;
  player.sliding = slideHeld && player.onGround;

  // 跑步动画
  if (player.onGround && !player.sliding) {
    runTimer += dt;
    const frameDur = Math.max(0.05, 0.12 - (speed / baseSpeed() - 1) * 0.04);
    if (runTimer >= frameDur) { runTimer = 0; runFrame = (runFrame + 1) % 6; }
  }

  // 生成
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawn();
    const minGap = Math.max(0.62, 230 / speed); // 保证反应时间
    spawnTimer = rand(minGap + 0.15, minGap + 0.95);
  }

  // 移动障碍 & 碰撞
  const pb = playerBox();
  for (const o of obstacles) {
    o.x -= speed * dt;
    const ow = o.h * (o.img ? o.img.width / o.img.height : 1);
    const ob = { x: o.x + ow * 0.18, y: o.footY - o.h + o.h * 0.12, w: ow * 0.64, h: o.h * 0.78 };
    if (!player.dead && rectsHit(pb, ob)) gameOver();
  }
  obstacles = obstacles.filter(o => o.x > -200);

  // 移动道具 & 收集
  for (const it of items) {
    it.x -= speed * dt;
    if (it.taken) continue;
    const iw = it.h * (it.img ? it.img.width / it.img.height : 1);
    const ib = { x: it.x + iw * 0.15, y: it.y - it.h + it.h * 0.15, w: iw * 0.7, h: it.h * 0.7 };
    if (rectsHit(pb, ib)) {
      it.taken = true;
      score += it.value;
      document.getElementById('score').textContent = Math.floor(score);
      sfx.collect();
      it.pop = 1;
    }
  }
  items = items.filter(it => it.x > -200 && (!it.taken || it.pop > 0));
  for (const it of items) if (it.taken) { it.pop -= dt * 3; it.y -= 120 * dt; }
}

function gameOver() {
  player.dead = true;
  sfx.hit();
  state = STATE.OVER;
  const final = Math.floor(score);
  const isRecord = final > best;
  if (isRecord) { best = final; localStorage.setItem('zxf_best', best); }
  document.getElementById('final-score').textContent = final;
  document.getElementById('final-best').textContent = best;
  document.getElementById('new-record').classList.toggle('hidden', !isRecord);
  document.getElementById('over-screen').classList.remove('hidden');
}

// ---------- 绘制 ----------
const TREAD_H_FRAC = 0.22;   // 跑步机绘制高度占屏比
const BELT_SURF = 0.415;     // 传送带上表面在素材内的高度比例
function treadH() { return Math.min(H * TREAD_H_FRAC, W * 0.17); }   // 兼顾竖屏：窄屏时控制台不过宽
function farDrawW() { return A.far ? H * 0.46 * (A.far.width / A.far.height) : W; }
function beltTileW() { return A.belt ? treadH() * (A.belt.width / A.belt.height) : W; }

function drawBackground() {
  // 天空渐变
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#8fd0fb'); g.addColorStop(0.55, '#c9ecff'); g.addColorStop(1, '#eef8ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 天空贴图（淡淡铺一层云）
  if (A.sky) {
    const sh = H * 0.55, sw = sh * (A.sky.width / A.sky.height);
    ctx.globalAlpha = 0.9;
    for (let x = -((dist * 0.04) % sw); x < W; x += sw) ctx.drawImage(A.sky, x, 0, sw, sh);
    ctx.globalAlpha = 1;
  }
  // 远景（健身房/跑道）：底边正好落在传送带上表面，自然衔接地面
  if (A.far) {
    const fh = H * 0.46, fw = farDrawW();
    const baseY = groundY - fh;
    const off = scrollFar % fw;
    for (let x = -off - fw; x < W; x += fw) ctx.drawImage(A.far, x, baseY, fw, fh);
    // 远景与跑步机之间压一道淡淡阴影，过渡更柔和
    const sg = ctx.createLinearGradient(0, groundY - H * 0.06, 0, groundY);
    sg.addColorStop(0, 'rgba(20,24,34,0)'); sg.addColorStop(1, 'rgba(20,24,34,0.28)');
    ctx.fillStyle = sg; ctx.fillRect(0, groundY - H * 0.06, W, H * 0.06);
  }
}

function drawGround() {
  const th = treadH();
  const yTop = groundY - th * BELT_SURF;
  // 跑步机下方铺一层健身房地板（带渐变），杜绝缝隙与空洞
  const fg = ctx.createLinearGradient(0, groundY, 0, H);
  fg.addColorStop(0, '#3a3f4b'); fg.addColorStop(1, '#191c23');
  ctx.fillStyle = fg;
  ctx.fillRect(0, groundY, W, H - groundY);
  // 传送带：循环滚动，铺满整屏宽
  if (A.belt) {
    const bw = beltTileW();
    const off = scrollGround % bw;
    for (let x = -off - bw; x < W; x += bw) ctx.drawImage(A.belt, x, yTop, bw, th);
  } else {
    ctx.fillStyle = '#2b2f38'; ctx.fillRect(0, groundY, W, H - groundY);
  }
  // 控制台 / 扶手：固定在最右端
  if (A.console) {
    const cw = th * (A.console.width / A.console.height);
    ctx.drawImage(A.console, W - cw, yTop, cw, th);
  }
}

function drawPlayer() {
  const cx = W * PLAYER_X;
  const footY = groundY - player.y;
  // 受伤图：仅游戏结束（撞到障碍）时显示
  if (state === STATE.OVER) { drawSprite(A.hurt, cx - 6 * S, footY, playerHeight() * 0.86); return; }
  // 滑铲：身体对齐跑步位置，扬尘拖在身后（左侧）
  if (player.sliding) {
    const img = A.slide;
    if (img) {
      const slh = playerSlideHeight();
      const sw = slh * (img.width / img.height);
      const runW = playerHeight() * (A.run0 ? A.run0.width / A.run0.height : 0.75);
      const left = cx + runW * 0.5 - sw * 0.70;
      ctx.drawImage(img, left, footY - slh, sw, slh);
    }
    return;
  }
  let img;
  if (!player.onGround) img = A.run3;           // 腾空帧
  else img = A['run' + runFrame];
  drawSprite(img, cx, footY, playerHeight());
}

function drawEntities() {
  for (const o of obstacles) drawSprite(o.img, o.x, o.footY, o.h);
  for (const it of items) {
    ctx.save();
    if (it.taken) ctx.globalAlpha = Math.max(0, it.pop);
    drawSprite(it.img, it.x, it.y, it.h);
    ctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawGround();
  drawEntities();
  drawPlayer();
}

// ---------- 主循环 ----------
let last = 0;
function loop(t) {
  if (!last) last = t;
  let dt = (t - last) / 1000; last = t;
  if (dt > 0.05) dt = 0.05;   // 防卡顿穿越
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// ---------- 启动 ----------
resize();
if (window.ResizeObserver) {
  new ResizeObserver(resize).observe(document.getElementById('game-wrap'));
}
preload().then(() => {
  resize();                 // 资源加载完后布局已就绪，重新测量
  reset();
  requestAnimationFrame(loop);
});
})();
