/**
 * Shared particle runtime used across pages.
 */
(() => {

const canvas = document.getElementById("particles-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const siteUtils = window.SiteUtils || {};
let width;
let height;
let particles = [];
let rafId = null;
let particleBootstrapTimer = null;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
const MOBILE_PARTICLE_BREAKPOINT = 768;
const DESKTOP_PARTICLE_COUNT = 350;
let particleProfile = getParticleProfileForViewport();
let particleCount = particleProfile.count;
const colors = [
  "rgba(0, 255, 255, 1)",
  "rgba(77, 159, 255, 0.9)",
  "rgba(224, 64, 251, 0.85)",
  "rgba(255, 64, 129, 0.8)",
  "rgba(255, 255, 255, 0.6)",
];

function isMobileParticleViewport() {
  if (typeof siteUtils.isMobileDeviceViewport === "function") {
    return siteUtils.isMobileDeviceViewport();
  }

  return window.innerWidth < MOBILE_PARTICLE_BREAKPOINT
    && window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
}

function shouldDisableMobileParticles() {
  return isMobileParticleViewport();
}

function getParticleProfileForViewport() {
  const isMobile = isMobileParticleViewport();
  const disabled = shouldDisableMobileParticles();
  return {
    isMobile,
    disabled,
    count: isMobile ? 0 : DESKTOP_PARTICLE_COUNT,
  };
}

function refreshParticleProfile() {
  const nextProfile = getParticleProfileForViewport();
  const didChange =
    nextProfile.isMobile !== particleProfile.isMobile ||
    nextProfile.disabled !== particleProfile.disabled ||
    nextProfile.count !== particleProfile.count;
  particleProfile = nextProfile;
  particleCount = nextProfile.count;
  return didChange;
}

function resize() {
  const rect = canvas?.getBoundingClientRect();
  width = Math.max(
    window.innerWidth || 0,
    document.documentElement.clientWidth || 0,
    Math.round(rect?.width || 0),
  );
  height = Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    Math.round(rect?.height || 0),
  );
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
  return width > 0 && height > 0;
}

class Particle {
  constructor() {
    this.spawn(false);
  }

  spawn(isRespawn) {
    this.x =
      (Math.random() - 0.5) * width * (isRespawn ? 1.5 : 2) + width / 2;
    this.y =
      (Math.random() - 0.5) * height * (isRespawn ? 1.5 : 2) + height / 2;
    this.z = isRespawn
      ? 2000 + Math.random() * 500
      : Math.random() * 2000 + 100;
    this.size = Math.random() * 1.5 + 0.5;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.baseVz = Math.random() * -3 - 0.5;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.vz = this.baseVz;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz * speedMultiplier;
    if (
      this.z < 1 ||
      this.x < -width ||
      this.x > width * 2 ||
      this.y < -height ||
      this.y > height * 2
    ) {
      this.spawn(true);
    }
  }

  getDrawData(out) {
    const fov = 300;
    const perspective = fov / (fov + this.z);
    const parallaxX = mouseX * (1000 / this.z) * 0.2;
    const parallaxY = mouseY * (1000 / this.z) * 0.2;
    out.px = (this.x - width / 2) * perspective + width / 2 + parallaxX;
    out.py = (this.y - height / 2) * perspective + height / 2 + parallaxY;
    out.pSize = this.size * perspective * 2;
    out.opacity = Math.min(1, Math.max(0, 1 - this.z / 1500));
    out.color = this.color;
    return out;
  }
}

function initParticles() {
  particles = [];
  const ParticleCtor = Particle;
  for (let i = 0; i < particleCount; i += 1) {
    particles.push(new ParticleCtor());
  }
}

const bucketKeys = colors;
let drawPool = [];
let bucketArrays = {};
let bucketCounts = {};

function rebuildParticleBuffers() {
  drawPool = Array.from({ length: particleCount }, () => ({
    px: 0,
    py: 0,
    pSize: 0,
    opacity: 0,
    color: "",
  }));

  bucketArrays = {};
  bucketCounts = {};
  bucketKeys.forEach((color) => {
    bucketArrays[color] = [];
    bucketCounts[color] = 0;
  });
}

rebuildParticleBuffers();

let speedMultiplier = 1;
let targetSpeedMultiplier = 1;
let particlesBootstrapped = false;

function drawParticlesFrame(advance = true) {
  if (!ctx || !width || !height || particleProfile.disabled) return;
  ctx.clearRect(0, 0, width, height);

  if (advance) {
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;
    speedMultiplier += (targetSpeedMultiplier - speedMultiplier) * 0.08;
  }

  bucketKeys.forEach((color) => {
    bucketCounts[color] = 0;
  });

  for (let i = 0; i < particleCount; i += 1) {
    if (advance) particles[i].update();
    const drawData = particles[i].getDrawData(drawPool[i]);
    const color = drawData.color;
    bucketArrays[color][bucketCounts[color]++] = drawData;
  }

  for (let i = 0; i < bucketKeys.length; i += 1) {
    const color = bucketKeys[i];
    const count = bucketCounts[color];
    if (count === 0) continue;

    ctx.fillStyle = color;

    for (let j = 0; j < count; j += 1) {
      const drawData = bucketArrays[color][j];
      ctx.globalAlpha = drawData.opacity;
      const size = drawData.pSize * 2;
      ctx.fillRect(drawData.px - drawData.pSize, drawData.py - drawData.pSize, size, size);
    }
  }

  ctx.globalAlpha = 1;
}

function stopParticles() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function clearParticleCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width || width || 0, canvas.height || height || 0);
}

function syncParticleCanvasState() {
  if (!canvas) return;

  if (particleProfile.disabled) {
    canvas.dataset.particlesDisabled = "true";
    canvas.style.display = "none";
    return;
  }

  canvas.dataset.particlesDisabled = "false";
  canvas.style.display = "";
}

function clearParticleBootstrapTimer() {
  if (particleBootstrapTimer) {
    clearTimeout(particleBootstrapTimer);
    particleBootstrapTimer = null;
  }
}

function animateParticles() {
  if (!ctx || particleProfile.disabled) return;
  drawParticlesFrame(true);
  rafId = requestAnimationFrame(animateParticles);
}

function bootstrapParticles(force = false) {
  if (!ctx) return false;

  stopParticles();
  clearParticleBootstrapTimer();
  if (refreshParticleProfile()) {
    rebuildParticleBuffers();
  }
  syncParticleCanvasState();

  const hasViewport = resize();
  if (!hasViewport) return false;

  if (particleProfile.disabled) {
    particles = [];
    particlesBootstrapped = false;
    clearParticleCanvas();
    return true;
  }

  if (force || !particlesBootstrapped || particles.length !== particleCount) {
    initParticles();
    particlesBootstrapped = true;
  }

  drawParticlesFrame(false);
  animateParticles();
  return true;
}

function scheduleParticleBootstrap(force = false, attempt = 0) {
  if (!ctx) return;

  requestAnimationFrame(() => {
    const didBootstrap = bootstrapParticles(force);
    if (!didBootstrap && attempt < 6) {
      particleBootstrapTimer = setTimeout(() => {
        particleBootstrapTimer = null;
        scheduleParticleBootstrap(true, attempt + 1);
      }, 80 + attempt * 80);
    } else if (!didBootstrap) {
      console.warn("Particle system failed to bootstrap after maximum retries.");
    }
  });
}

function setPointerTarget(clientX, clientY) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !width || !height) {
    targetMouseX = 0;
    targetMouseY = 0;
    return;
  }

  targetMouseX = (clientX - width / 2) * 2;
  targetMouseY = (clientY - height / 2) * 2;
}

window.ParticlesRuntime = Object.freeze({
  setPointerTarget,
});

function handleParticleContextChange() {
  stopParticles();
  clearParticleBootstrapTimer();
  scheduleParticleBootstrap(true);
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  stopParticles();
  clearParticleBootstrapTimer();
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    if (refreshParticleProfile()) {
      rebuildParticleBuffers();
    }

    bootstrapParticles(true);
  }, 300);
});

window.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") targetSpeedMultiplier = 20;
});
window.addEventListener("pointerup", (event) => {
  if (event.pointerType === "mouse") targetSpeedMultiplier = 1;
});
window.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") targetSpeedMultiplier = 1;
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => scheduleParticleBootstrap(), {
    once: true,
  });
} else {
  scheduleParticleBootstrap();
}

window.addEventListener("load", () => scheduleParticleBootstrap(true), {
  once: true,
});

window.addEventListener("pageshow", () => {
  if (!particlesBootstrapped || !rafId) {
    scheduleParticleBootstrap(true);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopParticles();
    clearParticleBootstrapTimer();
  } else if (ctx) {
    scheduleParticleBootstrap(!particlesBootstrapped || !rafId);
  }
});

if (document.body && typeof MutationObserver === "function") {
  const bodyObserver = new MutationObserver(handleParticleContextChange);
  bodyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-page"],
  });
}

})();
