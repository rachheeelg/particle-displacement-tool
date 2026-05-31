const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const dz = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const ui = document.getElementById('ui');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let W = canvas.width, H = canvas.height;

let mouse = { x: -9999, y: -9999, active: false };
let particles = [];
let animId = null;
let video = null;

const S = 600;
const offscreen = document.createElement('canvas');
const octx = offscreen.getContext('2d', { willReadFrequently: true });

let densityStep  = 3;
let repelRadius  = 50;
let repelForce   = 5;
let trailAlpha   = 40;
let particleSize = 1.2;

// live resample throttle
let lastResample = 0;
const RESAMPLE_INTERVAL = 150; // ms — lower = smoother colours, slightly heavier

// ─────────────────────────────────────────
// DROP ZONE
// ─────────────────────────────────────────
dz.addEventListener('click', () => fileInput.click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('video/')) loadVideo(f);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadVideo(fileInput.files[0]);
});

// ─────────────────────────────────────────
// VIDEO
// ─────────────────────────────────────────
function loadVideo(file) {
  // clean up previous
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (video) { video.pause(); video.src = ''; video = null; }

  video = document.createElement('video');
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(file);
  // append to DOM so browser treats it as active media
  video.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;';
  document.body.appendChild(video);

  video.addEventListener('loadeddata', () => {
    dz.style.display = 'none';
    ui.style.display = 'flex';
    canvas.classList.add('loaded');
    video.play();

    // wait 500ms then sample — bulletproof fallback
    setTimeout(() => {
      buildParticles();
      lastResample = performance.now();
      animate();
    }, 500);
  }, { once: true });
}

// ─────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────
function getLayout() {
  if (!video) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(W / vw, H / vh);
  const dw = Math.floor(vw * scale);
  const dh = Math.floor(vh * scale);
  const ox = Math.floor((W - dw) / 2);
  const oy = Math.floor((H - dh) / 2);
  return { dw, dh, ox, oy };
}

// ─────────────────────────────────────────
// BUILD PARTICLES
// ─────────────────────────────────────────
function buildParticles() {
  if (!video) return;
  const layout = getLayout();
  if (!layout) return;
  const { dw, dh, ox, oy } = layout;
  const sh = Math.floor(S * dh / dw);

  offscreen.width = S;
  offscreen.height = sh;

  try {
    octx.drawImage(video, 0, 0, S, sh);
  } catch(e) {
    console.warn('drawImage failed:', e);
    return;
  }

  let imgData;
  try { imgData = octx.getImageData(0, 0, S, sh); }
  catch(e) { console.warn('getImageData failed:', e); return; }

  const data = imgData.data;
  particles = [];

  for (let y = 0; y < sh; y += densityStep) {
    for (let x = 0; x < S; x += densityStep) {
      const i = (y * S + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 20) continue;
      if (r * 0.299 + g * 0.587 + b * 0.114 < 10) continue;

      const wx = ox + Math.floor((x / S) * dw);
      const wy = oy + Math.floor((y / sh) * dh);

      particles.push({
        ox: wx, oy: wy,
        x: wx + (Math.random() - 0.5) * W * 0.5,
        y: wy + (Math.random() - 0.5) * H * 0.5,
        vx: 0, vy: 0, r, g, b,
        sz:     Math.random() * particleSize * 0.8 + particleSize * 0.4,
        spring: Math.random() * 0.035 + 0.03,
        damp:   Math.random() * 0.03  + 0.84,
      });
    }
  }

  console.log('built', particles.length, 'particles');
}

// ─────────────────────────────────────────
// LIVE RESAMPLE — called inside animate()
// ─────────────────────────────────────────
function liveResample() {
  if (!video || !particles.length) return;
  const layout = getLayout();
  if (!layout) return;
  const { dw, dh, ox, oy } = layout;
  const sh = Math.floor(S * dh / dw);

  offscreen.width = S;
  offscreen.height = sh;
  try { octx.drawImage(video, 0, 0, S, sh); } catch(e) { return; }

  let imgData;
  try { imgData = octx.getImageData(0, 0, S, sh); } catch(e) { return; }

  const data = imgData.data;
  let pi = 0;

  for (let y = 0; y < sh && pi < particles.length; y += densityStep) {
    for (let x = 0; x < S && pi < particles.length; x += densityStep) {
      const i = (y * S + x) * 4;
      const p = particles[pi];
      p.r  = data[i];
      p.g  = data[i+1];
      p.b  = data[i+2];
      p.ox = ox + Math.floor((x / S) * dw);
      p.oy = oy + Math.floor((y / sh) * dh);
      pi++;
    }
  }
}

// ─────────────────────────────────────────
// ANIMATION LOOP
// ─────────────────────────────────────────
function animate() {
  const now = performance.now();

  // Resample live video frame into particle colours/origins on a throttle
  if (now - lastResample > RESAMPLE_INTERVAL) {
    liveResample();
    lastResample = now;
  }

  ctx.fillStyle = `rgba(0,0,0,${trailAlpha / 255})`;
  ctx.fillRect(0, 0, W, H);

  const rr = repelRadius * repelRadius;
  const mx = mouse.x, my = mouse.y, active = mouse.active;

  // batch particles by quantised color — reduces fillStyle switches massively
  const buckets = {};

  for (const p of particles) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const d2 = dx * dx + dy * dy;

    if (active && d2 < rr) {
      const d = Math.sqrt(d2) || 1;
      const f = ((repelRadius - d) / repelRadius) * repelForce;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }

    p.vx += (p.ox - p.x) * p.spring;
    p.vy += (p.oy - p.y) * p.spring;
    p.vx *= p.damp;
    p.vy *= p.damp;
    p.x += p.vx;
    p.y += p.vy;

    // quantise color into buckets (~4 shades per channel)
    const key = `${p.r >> 2},${p.g >> 2},${p.b >> 2}`;
    if (!buckets[key]) buckets[key] = { r: p.r, g: p.g, b: p.b, pts: [] };
    buckets[key].pts.push(p);
  }

  // draw each bucket as a single path — one fill call per color group
  for (const key in buckets) {
    const { r, g, b, pts } = buckets[key];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    for (const p of pts) {
      ctx.moveTo(p.x + p.sz, p.y);
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  animId = requestAnimationFrame(animate);
}

// ─────────────────────────────────────────
// REBUILD
// ─────────────────────────────────────────
function rebuild() {
  if (animId) cancelAnimationFrame(animId);
  ctx.clearRect(0, 0, W, H);
  buildParticles();
  lastResample = performance.now();
  animate();
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
const toast = document.createElement('div');
toast.id = 'info';
toast.textContent = 'move cursor to scatter · particles return on leave';
document.body.appendChild(toast);

let toastTimer = null;
let toastShown = false;

function showToast() {
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
}

// ─────────────────────────────────────────
// MOUSE & TOUCH
// ─────────────────────────────────────────
window.addEventListener('mousemove', e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (!mouse.active && canvas.classList.contains('loaded') && !toastShown) {
    toastShown = true;
    showToast();
  }
  mouse.active = true;
});
window.addEventListener('mouseleave', () => { mouse.active = false; });
window.addEventListener('touchmove', e => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
  mouse.active = true;
}, { passive: false });
window.addEventListener('touchend', () => { mouse.active = false; });

// ─────────────────────────────────────────
// SLIDERS
// ─────────────────────────────────────────
document.getElementById('densitySlider').addEventListener('input', function () {
  densityStep = parseInt(this.value); updateThumb(this);
});
document.getElementById('repelSlider').addEventListener('input', function () {
  repelRadius = parseInt(this.value); updateThumb(this);
});
document.getElementById('forceSlider').addEventListener('input', function () {
  repelForce = parseFloat(this.value); updateThumb(this);
});
document.getElementById('trailSlider').addEventListener('input', function () {
  trailAlpha = parseInt(this.value); updateThumb(this);
});
document.getElementById('sizeSlider').addEventListener('input', function () {
  particleSize = parseFloat(this.value); updateThumb(this);
});
document.getElementById('resetBtn').addEventListener('click', rebuild);

// ─────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────
window.addEventListener('resize', () => {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  if (video) rebuild();
  document.querySelectorAll('.slider-wrap input[type=range]').forEach(updateThumb);
});

// ─────────────────────────────────────────
// CUSTOM THUMB POSITIONING
// ─────────────────────────────────────────
function updateThumb(slider) {
  const wrap = slider.closest('.slider-wrap');
  if (!wrap) return;
  const thumb = wrap.querySelector('.thumb');
  const pct = (parseFloat(slider.value) - parseFloat(slider.min)) / (parseFloat(slider.max) - parseFloat(slider.min));
  thumb.style.left = (pct * wrap.offsetWidth) + 'px';
}

function initThumbs() {
  document.querySelectorAll('.slider-wrap input[type=range]').forEach(updateThumb);
}

const uiObserver = new MutationObserver(() => {
  if (ui.style.display !== 'none') setTimeout(initThumbs, 50);
});
uiObserver.observe(ui, { attributes: true, attributeFilter: ['style'] });