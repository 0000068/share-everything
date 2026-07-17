import { assert, loadBrowserScript } from "./harness.mjs";

function createFrameClock(frameCostMs) {
  let now = 0;
  let readingFrameEnd = false;

  return {
    now() {
      if (!readingFrameEnd) {
        readingFrameEnd = true;
        return now;
      }

      readingFrameEnd = false;
      now += frameCostMs;
      return now;
    },
  };
}

function createParticleRuntime({
  width = 1280,
  reducedMotion = false,
  saveData = false,
  hardwareConcurrency = 8,
  deviceMemory = 8,
  frameCostMs = 0.5,
} = {}) {
  const animationFrames = [];
  const canvas = {
    dataset: {},
    style: {},
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width, height: 720 }),
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      fillStyle: "",
      globalAlpha: 1,
    }),
  };
  const reducedMotionQuery = {
    matches: reducedMotion,
    addEventListener: () => {},
    addListener: () => {},
  };
  let nextFrameId = 1;

  const runtime = loadBrowserScript("js/common.js", {
    window: {
      innerWidth: width,
      innerHeight: 720,
      navigator: {
        hardwareConcurrency,
        deviceMemory,
        connection: {
          saveData,
          addEventListener: () => {},
        },
      },
      SiteUtils: {
        createMediaQueryList: () => reducedMotionQuery,
        isNarrowViewport: () => width <= 768,
      },
      addEventListener: () => {},
      requestAnimationFrame: (callback) => {
        animationFrames.push(callback);
        const frameId = nextFrameId;
        nextFrameId += 1;
        return frameId;
      },
      cancelAnimationFrame: () => {},
    },
    document: {
      readyState: "complete",
      hidden: false,
      body: null,
      documentElement: { clientWidth: width, clientHeight: 720 },
      getElementById: (id) => (id === "particles-canvas" ? canvas : null),
      addEventListener: () => {},
    },
    globals: {
      performance: createFrameClock(frameCostMs),
    },
  });

  function flushNextFrame(timestamp) {
    const callback = animationFrames.shift();
    assert.equal(typeof callback, "function", "particle runtime should keep a scheduled animation callback");
    callback(timestamp);
  }

  return {
    ...runtime,
    canvas,
    flushBootstrap() {
      flushNextFrame(0);
    },
    flushAnimationFrames(count, frameStepMs = 1000 / 60) {
      let timestamp = 0;
      for (let index = 0; index < count; index += 1) {
        timestamp += frameStepMs;
        flushNextFrame(timestamp);
      }
    },
  };
}

export function runParticleRuntimeChecks() {
  const fullDesktop = createParticleRuntime();
  assert.deepEqual(
    { ...fullDesktop.window.ParticlesRuntime.getProfile() },
    {
      isNarrow: false,
      prefersReducedMotion: false,
      saveData: false,
      disabled: false,
      reason: "full-capability",
      tier: "high",
      tierIndex: 0,
      count: 350,
      frameIntervalMs: 0,
    },
    "capable desktops should preserve the full particle treatment",
  );
  fullDesktop.flushBootstrap();
  assert.equal(fullDesktop.canvas.dataset.particlesDisabled, "false");
  assert.equal(fullDesktop.canvas.dataset.particlesCount, "350");

  const narrowFinePointer = createParticleRuntime({ width: 320 });
  narrowFinePointer.flushBootstrap();
  assert.equal(
    narrowFinePointer.window.ParticlesRuntime.getProfile().reason,
    "narrow-viewport",
    "particle work should stop at narrow widths even when pointer capability is not coarse",
  );
  assert.equal(narrowFinePointer.canvas.dataset.particlesDisabled, "true");

  const reducedMotion = createParticleRuntime({ reducedMotion: true });
  reducedMotion.flushBootstrap();
  assert.equal(reducedMotion.window.ParticlesRuntime.getProfile().reason, "reduced-motion");
  assert.equal(reducedMotion.canvas.style.display, "none");

  const dataSaver = createParticleRuntime({ saveData: true });
  dataSaver.flushBootstrap();
  assert.equal(dataSaver.window.ParticlesRuntime.getProfile().reason, "save-data");
  assert.equal(dataSaver.canvas.dataset.particlesCount, "0");

  const lowHardware = createParticleRuntime({ hardwareConcurrency: 2, deviceMemory: 2 });
  lowHardware.flushBootstrap();
  assert.equal(lowHardware.window.ParticlesRuntime.getProfile().tier, "economy");
  assert.equal(lowHardware.window.ParticlesRuntime.getProfile().count, 120);
  assert.equal(lowHardware.canvas.dataset.particlesDisabled, "false");

  const slowDesktop = createParticleRuntime({ frameCostMs: 10 });
  slowDesktop.flushBootstrap();
  slowDesktop.flushAnimationFrames(45);
  assert.equal(
    slowDesktop.window.ParticlesRuntime.getProfile().tier,
    "balanced",
    "sustained expensive particle frames should step down one tier",
  );
  assert.equal(slowDesktop.window.ParticlesRuntime.getProfile().reason, "frame-pressure");
  assert.equal(slowDesktop.canvas.dataset.particlesCount, "220");
}
