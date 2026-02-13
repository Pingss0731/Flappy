
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// --- Music (starts after user interaction) ---
const music = new Audio('lofi.mp3');
music.loop = true;
music.preload = 'auto';
music.volume = 0.25;
let musicEnabled = false;

const muteBtn = document.getElementById('muteBtn');
const vol = document.getElementById('vol');
if(vol){
  vol.addEventListener('input', () => {
    music.volume = Number(vol.value);
  });
}

async function toggleMusic(force){
  try{
    if(typeof force === 'boolean') musicEnabled = force;
    else musicEnabled = !musicEnabled;

    if(musicEnabled){
      await music.play();
      if(muteBtn) muteBtn.textContent = 'Music: On';
    } else {
      music.pause();
      if(muteBtn) muteBtn.textContent = 'Music: Off';
    }
  } catch {
    // If autoplay blocked, keep it off until next user action.
    musicEnabled = false;
    if(muteBtn) muteBtn.textContent = 'Music: Off';
  }
}

if(muteBtn){
  muteBtn.addEventListener('click', () => toggleMusic());
}

// We'll toggle smoothing per draw: smooth for the main sprite.
ctx.imageSmoothingEnabled = true;

// Responsive + crisp rendering: keep logical game coords (420x640) but scale for devicePixelRatio.
const baseW = 420;
const baseH = 640;
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
canvas.width = Math.floor(baseW * dpr);
canvas.height = Math.floor(baseH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// Pipe sprite disabled (use classic Flappy-style drawn pipes)
const pipeImg = null;

// Watermark overlay (transparent PNG)
const pipeWatermark = new Image();
pipeWatermark.src = "watermark.png";

// City background disabled (was causing UI/artifacts on some devices)

// Logical game size
const W = baseW, H = baseH;

let state = "menu"; // menu | ready | playing | gameover
let score = 0, best = 0;
let playerName = (localStorage.getItem('flappyRyukuName') || '').trim();
let playerId = (localStorage.getItem('flappyRyukuId') || '').trim();
if(!playerId){
  playerId = (crypto?.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2)));
  localStorage.setItem('flappyRyukuId', playerId);
}

// Overlays
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const nameInput = document.getElementById('nameInput');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const lbEl = document.getElementById('lb');
const lbFab = document.getElementById('lbFab');
const lbOverlay = document.getElementById('lbOverlay');
const lbFullEl = document.getElementById('lbFull');
const myRankLine = document.getElementById('myRankLine');
const lbCloseBtn = document.getElementById('lbCloseBtn');
// copy button removed
const resultLine = document.getElementById('resultLine');
const creditLine = document.getElementById('creditLine');

if(nameInput){
  nameInput.value = playerName;
  nameInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') startBtn?.click();
  });
}

// --- Leaderboard (GLOBAL via Vercel KV) ---
async function renderLb(limit = 10, el = lbEl){
  if(!el) return;
  el.innerHTML = '';
  const li = document.createElement('li');
  li.textContent = 'Loading...';
  el.appendChild(li);

  try{
    const res = await fetch(`/api/leaderboard?limit=${limit}`, { cache: 'no-store' });
    const data = await res.json();
    const entries = Array.isArray(data?.entries) ? data.entries : [];

    el.innerHTML = '';
    if(entries.length === 0){
      const li2 = document.createElement('li');
      li2.textContent = 'No scores yet — be the first!';
      el.appendChild(li2);
      return;
    }

    entries.forEach((e, idx) => {
      const li3 = document.createElement('li');
      // For top100, show ranking number
      li3.textContent = (limit > 10) ? `${idx+1}. ${e.name} — ${e.score}` : `${e.name} — ${e.score}`;
      el.appendChild(li3);
    });
  } catch {
    el.innerHTML = '';
    const li4 = document.createElement('li');
    li4.textContent = 'Leaderboard unavailable';
    el.appendChild(li4);
  }
}

async function submitScore(){
  if(score <= 0) return;
  const name = (playerName || 'Anonymous');
  try{
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: playerId, name, score })
    });
  } catch {
    // ignore
  }
}

async function refreshMyRank(){
  if(!myRankLine) return;
  try{
    const res = await fetch(`/api/me?id=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    const data = await res.json();
    if(data && data.rank){
      myRankLine.textContent = `Your rank: #${data.rank} (Best: ${data.score ?? 0})`;
    } else {
      myRankLine.textContent = 'Your rank: unranked';
    }
  } catch {
    myRankLine.textContent = 'Your rank: unavailable';
  }
}

// Leaderboard overlay controls
function openLb(){
  if(lbOverlay) lbOverlay.style.display = 'flex';
  renderLb(100, lbFullEl);
  refreshMyRank();
}
function closeLb(){
  if(lbOverlay) lbOverlay.style.display = 'none';
}
lbFab?.addEventListener('click', openLb);
lbCloseBtn?.addEventListener('click', closeLb);

function showStart(){
  state = 'menu';
  if(startOverlay) startOverlay.style.display = 'flex';
  if(gameOverOverlay) gameOverOverlay.style.display = 'none';
  renderLb();
}

function showGameOver(){
  if(startOverlay) startOverlay.style.display = 'none';
  if(gameOverOverlay) gameOverOverlay.style.display = 'flex';

  submitScore();
  renderLb();
  refreshMyRank();

  const name = (playerName || 'Anonymous');
  if(resultLine) resultLine.textContent = `Score: ${score} (Best: ${best})`;
  if(creditLine) creditLine.textContent = name;
}

function startGame(){
  playerName = (nameInput?.value || '').trim();
  localStorage.setItem('flappyRyukuName', playerName);

  if(startOverlay) startOverlay.style.display = 'none';
  if(gameOverOverlay) gameOverOverlay.style.display = 'none';

  reset();
  // stay in 'ready' until first flap
}

startBtn?.addEventListener('click', startGame);
restartBtn?.addEventListener('click', () => { startGame(); });
// Show start overlay on load
showStart();

// --- Classic-ish Flappy physics (consistent at 60fps) ---
// Gravity is constant; flap sets a fixed upward velocity.
// Tune these 3 values to change the "feel".
const GRAVITY = 0.38;      // falling acceleration per frame
const FLAP_VEL = -7.8;     // upward velocity on flap
const MAX_FALL = 10.5;     // terminal fall speed

// Fixed timestep so it feels consistent across different FPS.
const STEP_MS = 1000 / 60;
let lastT = performance.now();
let acc = 0;

const bird = {
  x: 120,
  y: H/2,
  r: 18,
  vy: 0,
  rot: 0,
  frames: [],        // optional 2-frame flap animation
  useImage: true,    // set false to use circle fallback
};

// Simple sprite animation. With 4 frames, 80–110ms feels nice.
const FLAP_ANIM_MS = 90;

const pipes = [];
const pipeW = 70; // base pipe width; actual width varies per pipe

// Wind mode (side-to-side drift) — starts gentle, grows with score.
const WIND_MAX = 0.9; // px per step
function currentWind(){
  const amp = Math.min(WIND_MAX, 0.15 + score * 0.03);
  return Math.sin(performance.now() / 700) * amp;
}

// Difficulty: start VERY easy, then slowly becomes hard.
// Gap decreases with score; speed & spawn rate increase with score.
const basePipeGap = 260; // bigger gap at the start (easier)
const minPipeGap = 135;  // smallest gap when it gets hard
function currentPipeGap(){
  return Math.max(minPipeGap, basePipeGap - score * 3.0);
}

const basePipeSpeed = 1.3;
const maxPipeSpeed = 4.2;
function currentPipeSpeed(){
  return Math.min(maxPipeSpeed, basePipeSpeed + score * 0.09);
}

function currentSpawnEvery(){
  // Bigger = fewer pipes (easier). Decreases over time.
  return Math.max(78, 130 - score * 1.0);
}

let spawnTimer = 0;

// Pipe generation helpers
let lastGapCenter = H/2;
let patternIndex = 0;
const GAP_PATTERN = [0.22, 0.78, 0.5, 0.5, 0.28]; // HIGH/LOW/MID style
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function reset(){
  // reset state and timers; difficulty auto-resets because score resets
  
  state = "ready";
  score = 0;
  bird.x = 120;
  bird.y = H/2;
  bird.vy = 0;
  pipes.length = 0;
  spawnTimer = 0;

  if(gameOverOverlay) gameOverOverlay.style.display = 'none';
}

function spawnPipe(){
  const groundH = 70;
  const pad = 70;

  // Variation B: difficulty scaling (gap gets smaller)
  const baseGap = currentPipeGap();

  // Variation 1: random gap size per pipe (easy → hard as score increases)
  const gapScaleMin = Math.max(0.78, 0.96 - score * 0.008);
  const gapScaleMax = Math.min(1.10, 1.04 + score * 0.002);
  const gapScale = gapScaleMin + Math.random() * (gapScaleMax - gapScaleMin);
  const gap = baseGap * gapScale;

  // Variation 2: random width per pipe
  const w = Math.max(54, Math.min(92, Math.floor(pipeW + (Math.random() - 0.5) * 22)));

  const minTop = pad;
  const maxTop = H - groundH - pad - gap;

  // Variation A: smooth random (natural movement)
  // Move the GAP center gradually instead of jumping.
  const offset = Math.min(90, 30 + score * 2.0);
  const desiredCenter = clamp(lastGapCenter + (Math.random() * 2 - 1) * offset, minTop + gap/2, maxTop + gap/2);

  // Variation D: pattern-based pipes (semi scripted)
  // Mix in patterns after a few points.
  const usePattern = score >= 4 && Math.random() < Math.min(0.35, 0.12 + score * 0.01);
  const patternCenter = (minTop + gap/2) + GAP_PATTERN[patternIndex % GAP_PATTERN.length] * (maxTop - minTop);

  const gapCenter = usePattern ? patternCenter : desiredCenter;
  if(usePattern) patternIndex++;
  lastGapCenter = gapCenter;

  // Convert GAP center -> top pipe height
  const baseTopH = clamp(gapCenter - gap/2, minTop, maxTop);

  // Variation C: moving pipes (vertical motion)
  const amp = Math.min(70, 10 + score * 2.4);
  const freq = Math.min(0.07, 0.02 + score * 0.0012);
  const phase = Math.random() * Math.PI * 2;

  // Variation E: vertical velocity pipes (physics-based)
  const vyChance = score >= 8 ? Math.min(0.28, 0.08 + score * 0.01) : 0;
  const vy = (Math.random() < vyChance) ? ((Math.random() * 2 - 1) * Math.min(1.1, 0.35 + score * 0.05)) : 0;

  // Slanted pipes (tilt). Starts subtle and increases with score.
  const tiltMaxDeg = Math.min(14, 3 + score * 0.7);
  const tiltDeg = (Math.random() * 2 - 1) * tiltMaxDeg;
  const tilt = tiltDeg * Math.PI / 180;

  // Fake pipes (troll mod)
  const fakeChance = Math.min(0.22, 0.06 + score * 0.01);
  const fake = Math.random() < fakeChance;

  const makeOne = (xOffset=0) => {
    pipes.push({
      x: W + 30 + xOffset,
      w,
      gap,
      baseTopH,
      minTop,
      maxTop,
      amp,
      freq,
      phase: phase + xOffset * 0.05,
      vy,
      tilt,
      fake,
      passed: false,
    });
  };

  makeOne(0);

  // Variation 3: double pipes (two sets close together) after you get a few points
  const doubleChance = (score >= 3) ? Math.min(0.28, 0.10 + score * 0.01) : 0;
  if(Math.random() < doubleChance){
    makeOne(w + 58);
  }
}

function pipeTopH(p){
  const t = performance.now();
  const wiggle = Math.sin((t / 16.67) * p.freq + p.phase) * p.amp;
  const th = p.baseTopH + wiggle;
  // keep it in bounds so it stays fair
  const minTop = p.minTop ?? 70;
  const maxTop = p.maxTop ?? (H - 70 - 70 - (p.gap ?? currentPipeGap()));
  return clamp(th, minTop, maxTop);
}

function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr){
  const nx = Math.max(rx, Math.min(cx, rx+rw));
  const ny = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx - nx, dy = cy - ny;
  return dx*dx + dy*dy < cr*cr;
}

function rectCircleCollideRotated(rx, ry, rw, rh, angle, ox, oy, cx, cy, cr){
  // Rotate circle point into rect local space (inverse rotate around origin ox,oy)
  const s = Math.sin(-angle);
  const c = Math.cos(-angle);
  const x = cx - ox;
  const y = cy - oy;
  const lx = x * c - y * s + ox;
  const ly = x * s + y * c + oy;
  return rectCircleCollide(rx, ry, rw, rh, lx, ly, cr);
}

function flap(){
  // From menu: start the game
  if(state === 'menu'){
    startGame();
    return;
  }

  // First interaction: start music softly (if user didn't turn it off)
  if(!musicEnabled){
    // auto-enable music on first flap; user can turn it off with the button
    toggleMusic(true);
  }

  if(state === "ready"){ state = "playing"; }
  if(state === "playing"){
    bird.vy = FLAP_VEL;
  }
  if(state === "gameover") reset();
}

function updateStep(){
  // bird physics
  if(state === "playing"){
    // Variation 6: wind mode (gentle side-to-side drift)
    bird.x += currentWind();
    bird.x = Math.max(70, Math.min(170, bird.x));

    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
    bird.y += bird.vy;
  } else if(state === "ready"){
    bird.x = 120;
    bird.y = H/2 + Math.sin(Date.now()/200)*6;
  } else if(state === "menu"){
    bird.x = 120;
    bird.y = H/2 + Math.sin(Date.now()/200)*6;
  }

  // bird rotation
  // Keep it mostly upright; only tilt slightly (no "falling forward").
  bird.rot = Math.max(-0.15, Math.min(0.15, bird.vy / 60));

  // ground/ceiling
  const GROUND_H = 70;
  if(bird.y + bird.r > H-GROUND_H){
    bird.y = H-GROUND_H-bird.r;
    if(state === "playing"){ state = "gameover"; showGameOver(); }
  }
  if(bird.y - bird.r < 0){
    bird.y = bird.r;
    if(state === "playing"){ state = "gameover"; showGameOver(); }
  }

  // pipes
  if(state === "playing"){
    spawnTimer += 1;
    const spawnEvery = currentSpawnEvery();
    if(spawnTimer > spawnEvery){
      spawnPipe();
      spawnTimer = 0;
    }

    const speed = currentPipeSpeed();
    for(const p of pipes){
      p.x -= speed;

      const w = p.w ?? pipeW;
      const gap = p.gap ?? currentPipeGap();

      // Variation E: vertical velocity pipes
      if(p.vy){
        p.baseTopH += p.vy;
        const minTop = p.minTop ?? 70;
        const maxTop = p.maxTop ?? (H - 70 - 70 - gap);
        if(p.baseTopH < minTop || p.baseTopH > maxTop){
          p.vy *= -1;
          p.baseTopH = clamp(p.baseTopH, minTop, maxTop);
        }
      }

      // scoring (skip fake pipes)
      if(!p.fake && !p.passed && p.x + w < bird.x){
        p.passed = true;
        score += 1;
        best = Math.max(best, score);
      }

      // collision (skip fake pipes)
      if(!p.fake){
        const groundY = H - 70;
        const th = Math.round(pipeTopH(p));
        const by = Math.round(th + gap);
        const topRect = {x:p.x, y:0, w:w, h:th};
        const botRect = {x:p.x, y:by, w:w, h:Math.max(0, groundY - by)};

        const tilt = p.tilt || 0;
        if(tilt){
          // Match drawing pivot points for slanted pipes
          const topOx = p.x + w/2;
          const topOy = 0; // top edge pivot
          const botOx = p.x + w/2;
          const botOy = by + botRect.h; // bottom edge pivot

          const hitTop = rectCircleCollideRotated(topRect.x, topRect.y, topRect.w, topRect.h, tilt, topOx, topOy, bird.x, bird.y, bird.r);
          const hitBot = rectCircleCollideRotated(botRect.x, botRect.y, botRect.w, botRect.h, tilt, botOx, botOy, bird.x, bird.y, bird.r);

          if(hitTop || hitBot){
            state = "gameover";
            showGameOver();
          }
        } else {
          if(rectCircleCollide(topRect.x, topRect.y, topRect.w, topRect.h, bird.x, bird.y, bird.r) ||
             rectCircleCollide(botRect.x, botRect.y, botRect.w, botRect.h, bird.x, bird.y, bird.r)){
            state = "gameover";
            showGameOver();
          }
        }
      }
    }

    // cleanup
    while(pipes.length){
      const w0 = pipes[0].w ?? pipeW;
      if(pipes[0].x + w0 < -50) pipes.shift();
      else break;
    }
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // background (sky)
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, "#77c8ff");
  g.addColorStop(1, "#d8f4ff");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // clouds (parallax)
  ctx.globalAlpha = 0.22;
  for(let i=0;i<6;i++){
    const speed = 0.04 + i*0.005;
    const x = (performance.now()*speed + i*140) % (W+220) - 220;
    const y = 70 + i*26;
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.arc(x+0, y, 18, 0, Math.PI*2);
    ctx.arc(x+25, y-10, 22, 0, Math.PI*2);
    ctx.arc(x+52, y, 18, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ground metrics
  const groundH = 70;
  const groundY = H - groundH;

  // pipes
  for(const p of pipes){
    const w = p.w ?? pipeW;
    const gap = p.gap ?? currentPipeGap();

    const th = Math.round(pipeTopH(p));
    const by = Math.round(th + gap);
    const bottomH = Math.max(0, groundY - by);

    // fake pipes: draw lighter so player can see it's decoration
    const alpha0 = ctx.globalAlpha;
    if(p.fake) ctx.globalAlpha = 0.35;

    const tilt = p.tilt || 0;

    // classic Flappy-style pipes (with optional slant)
    const drawPipeSection = (x, y, w0, h0, isTop) => {
      const alphaSave = ctx.globalAlpha;

      const drawContents = () => {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(x, y, w0, h0);

        // lips
        ctx.fillStyle = "#16a34a";
        if(isTop) ctx.fillRect(x-6, y + h0 - 14, w0+12, 14);
        else ctx.fillRect(x-6, y, w0+12, 14);

        // watermark
        if(pipeWatermark && pipeWatermark.complete){
          const wmW = w0 * 0.92;
          const wmH = wmW;
          const wmX = x + (w0 - wmW) / 2;
          ctx.globalAlpha = alphaSave * (p.fake ? 0.34 : 0.46);
          const wmY = isTop
            ? (y + Math.max(10, h0 * 0.55 - wmH / 2))
            : (y + Math.max(10, h0 * 0.40 - wmH / 2));
          ctx.drawImage(pipeWatermark, wmX, wmY, wmW, wmH);
        }

        ctx.globalAlpha = alphaSave;
      };

      if(!tilt){
        drawContents();
        ctx.globalAlpha = alphaSave;
        return;
      }

      // Rotate around the edge that should "stick":
      // - top pipe rotates around its TOP edge
      // - bottom pipe rotates around its BOTTOM edge
      const pivotX = x + w0/2;
      const pivotY = isTop ? y : (y + h0);

      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(tilt);
      ctx.translate(-pivotX, -pivotY);

      drawContents();

      ctx.restore();
      ctx.globalAlpha = alphaSave;
    };

    // top section at y=0
    drawPipeSection(p.x, 0, w, th, true);
    // bottom section at y=by
    drawPipeSection(p.x, by, w, bottomH, false);

    ctx.globalAlpha = alpha0;
  }
  

  // ground (Flappy-style dirt)

  // dirt (static — no scrolling so it doesn't look "sliding")
  ctx.fillStyle = "#e7c58b";
  ctx.fillRect(0, groundY, W, groundH);

  // grass strip (match pipe greens)
  const grassH = 18;
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(0, groundY, W, grassH);

  // darker grass blocks (scrolls slowly like Flappy Bird)
  const tileW = 26;
  const scrollX = (performance.now() * 0.06) % tileW;
  for(let x = -tileW; x < W + tileW; x += tileW){
    const xx = x - scrollX;
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(xx + 3, groundY + 3, tileW - 10, grassH - 6);
    // small accent block
    ctx.fillStyle = "#128a43";
    ctx.fillRect(xx + 8, groundY + 5, 6, grassH - 10);
  }

  // little dirt dots (static pattern)
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for(let i=0;i<22;i++){
    const dx = (i*47) % (W+20) - 10;
    const dy = groundY + grassH + 10 + (i*19 % (groundH - grassH - 16));
    ctx.fillRect(dx, dy, 6, 3);
  }

  // bird/dragon
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);

  const frameIdx = (() => {
    const a = bird.frames;
    if(!bird.useImage || !a || a.length === 0) return -1;
    const t = (state === "gameover") ? 0 : Math.floor(performance.now() / FLAP_ANIM_MS);
    return a.length > 1 ? (t % a.length) : 0;
  })();

  const frame = (frameIdx >= 0 && bird.frames[frameIdx] && bird.frames[frameIdx].complete) ? bird.frames[frameIdx] : null;
  const outline = null;

  if(frame){
    // Draw main sprite (no outer line)
    const size = 84; // base on-screen size (bigger)
    const w = size * 1.40;   // make Ryuku wider
    const h = size * 1.08;   // height boost

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, -w/2, -h/2, w, h);
  } else {
    // fallback circle dragon
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(0,0,bird.r,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(6,-6,3.5,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  // UI
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.fillText(String(score), 18, 42);

  ctx.font = "14px Arial";
  ctx.fillText("BEST: " + best, 18, 62);

  if(state === "ready"){
    ctx.textAlign = "center";
    ctx.font = "bold 22px Arial";
    ctx.fillText("Flappy Ryuku", W/2, H/2 - 55);
    ctx.font = "14px Arial";
    ctx.fillText("Click / Space to start", W/2, H/2 - 28);
    ctx.fillText("Press R to restart anytime", W/2, H/2 - 8);
  }
  if(state === "gameover"){
    ctx.textAlign = "center";
    ctx.font = "bold 26px Arial";
    ctx.fillText("Game Over", W/2, H/2 - 40);
    ctx.font = "14px Arial";
    ctx.fillText("Click / Space to restart", W/2, H/2 - 15);
  }
}

function loop(t){
  const now = t ?? performance.now();
  acc += Math.min(50, now - lastT);
  lastT = now;

  while(acc >= STEP_MS){
    updateStep();
    acc -= STEP_MS;
  }

  draw();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e)=>{
  if(e.code === "Space") flap();
  if(e.code === "KeyR"){
    if(state === 'menu'){
      startGame();
    } else if(state === 'gameover'){
      startGame();
    } else {
      reset();
    }
  }
});
canvas.addEventListener("pointerdown", flap);

// Main sprite frames (smooth) — use the original transparent PNGs for a sharper face
const f1 = new Image(); f1.src = "ryuku1.png";
const f2 = new Image(); f2.src = "ryuku2.png";
const f3 = new Image(); f3.src = "ryuku3.png";
const f4 = new Image(); f4.src = "ryuku4.png";
bird.frames = [f1, f2, f3, f4];

// Outer line disabled
bird.outlines = [];

reset();
requestAnimationFrame(loop);
