import L from 'leaflet';
import { rasterizeFlow } from './flowRaster';
import { KNOTS_PER_MS, sampleWind, windColor, type WindField, type WindFrame } from './windField';

interface Particle { lat: number; lon: number; age: number }

export interface FlowSample { east: number; north: number; value: number; period?: number }
export interface FlowCanvasOptions {
  opacity: number;
  night: boolean;
  animate: boolean;
  onCoverage: (available: boolean) => void;
  color: (value: number) => [number, number, number];
  paneName?: string;
  motion?: 'particles' | 'crests' | 'none';
  speedMultiplier?: number;
}

/** Shared bounded Canvas renderer. Motion is illustrative, never a physical phase simulation. */
export function mountFlowCanvas(map: L.Map, sample: (lat: number, lon: number) => FlowSample | null, options: FlowCanvasOptions): () => void {
  const pane = map.getPane(options.paneName ?? 'windFlowPane') ?? map.createPane(options.paneName ?? 'windFlowPane');
  pane.style.zIndex = '350'; // Below overlayPane (400), ENC, AIS, soundings and aids.
  pane.style.pointerEvents = 'none';
  const gradient = L.DomUtil.create('canvas', '', pane);
  const trails = L.DomUtil.create('canvas', '', pane);
  for (const canvas of [gradient, trails]) {
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
  }
  const context = gradient.getContext('2d');
  const trail = trails.getContext('2d');
  if (!context || !trail) {
    gradient.remove(); trails.remove(); options.onCoverage(false);
    return () => {};
  }
  const animated = options.animate && options.motion !== 'none';
  let particles: Particle[] = [];
  let raf = 0;
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let last = 0;
  let moving = false;
  let disposed = false;
  let available = false;
  let width = 0;
  let height = 0;
  let visualScale = 1;
  const spawn = (): Particle => {
    const position = map.containerPointToLatLng([Math.random() * width, Math.random() * height]);
    return { lat: position.lat, lon: position.lng, age: Math.random() * 100 };
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
  const draw = (time: number) => {
    raf = 0;
    if (disposed || moving || document.hidden || !animated || !available) return;
    if (last && time - last < 32) { raf = requestAnimationFrame(draw); return; }
    const dt = last ? Math.min((time - last) / 1000, 0.08) : 0.032;
    last = time;
    trail.globalCompositeOperation = 'destination-in';
    trail.fillStyle = `rgba(0,0,0,${Math.pow(options.motion === 'crests' ? 0.65 : 0.9, dt / 0.032)})`;
    trail.fillRect(0, 0, width, height);
    trail.globalCompositeOperation = 'source-over';
    trail.strokeStyle = options.night ? 'rgba(175,195,215,0.55)' : 'rgba(235,250,255,0.85)';
    trail.lineWidth = 1.1;
    trail.beginPath();
    particles.forEach((particle, i) => {
      const wind = sample(particle.lat, particle.lon);
      if (!wind || particle.age > 100 || (options.motion === 'crests' && wind.value <= 0)) { particles[i] = spawn(); return; }
      const start = map.latLngToContainerPoint([particle.lat, particle.lon]);
      const frequency = options.motion === 'crests' ? 6 / Math.max(0.1, wind.period ?? 6) : 1;
      const displacement = dt * visualScale * (options.speedMultiplier ?? 1) * frequency;
      const nextLat = particle.lat + wind.north * displacement / 111320;
      const nextLon = particle.lon + wind.east * displacement / (111320 * Math.cos(particle.lat * Math.PI / 180));
      if (!sample(nextLat, nextLon)) { particles[i] = spawn(); return; }
      const end = map.latLngToContainerPoint([nextLat, nextLon]);
      if (end.x < 0 || end.y < 0 || end.x > width || end.y > height) { particles[i] = spawn(); return; }
      if (options.motion === 'crests') {
        const length = Math.hypot(wind.east, wind.north);
        if (length > 0.001) {
          const tangentX = wind.north / length;
          const tangentY = wind.east / length;
          const halfWidth = 4 + Math.min(4, wind.value) * 1.5;
          trail.moveTo(end.x - tangentX * halfWidth, end.y - tangentY * halfWidth);
          trail.quadraticCurveTo(start.x, start.y, end.x + tangentX * halfWidth, end.y + tangentY * halfWidth);
        }
      } else {
        trail.moveTo(start.x, start.y); trail.lineTo(end.x, end.y);
      }
      particle.lat = nextLat; particle.lon = nextLon; particle.age += dt * 12;
    });
    trail.stroke();
    raf = requestAnimationFrame(draw);
  };
  const start = () => {
    if (!raf && !disposed && !moving && !document.hidden && animated && available) raf = requestAnimationFrame(draw);
  };
  const rebuild = async () => {
    const version = ++generation;
    moving = false;
    stop();
    const size = map.getSize(); width = size.x; height = size.y;
    if (width <= 0 || height <= 0) {
      available = false;
      options.onCoverage(false);
      return;
    }
    // Bound raster work even on large external bridge displays.
    const spacing = Math.max(8, Math.ceil(Math.sqrt(width * height / 22000)));
    const raster = document.createElement('canvas');
    raster.width = Math.max(1, Math.ceil(width / spacing));
    raster.height = Math.max(1, Math.ceil(height / spacing));
    const rasterContext = raster.getContext('2d');
    if (!rasterContext) return;
    const image = rasterContext.createImageData(raster.width, raster.height);
    const result = await rasterizeFlow(raster.width, raster.height, (x, y) => {
      const location = map.containerPointToLatLng([(x + 0.5) * spacing, (y + 0.5) * spacing]);
      const vector = sample(location.lat, location.lng);
      return vector ? options.color(vector.value) : null;
    }, () => !disposed && !moving && version === generation);
    if (!result) return;
    image.data.set(result.pixels);
    const valid = result.valid;
    // At most four million backing pixels per surface, including on 4K/Retina displays.
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));
    for (const canvas of [gradient, trails]) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      canvas.style.visibility = 'visible';
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    trail.setTransform(dpr, 0, 0, dpr, 0, 0);
    rasterContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.globalAlpha = options.opacity * (options.night ? 0.55 : 1);
    context.drawImage(raster, 0, 0, width, height);
    available = valid > 0;
    options.onCoverage(available);
    particles = Array.from({ length: options.motion === 'crests' ? Math.min(280, Math.floor(width * height / 3200)) : Math.min(600, Math.floor(width * height / 1800)) }, spawn);
    visualScale = Math.max(100, map.distance(map.containerPointToLatLng([0, height / 2]), map.containerPointToLatLng([100, height / 2])) / 100 * 4);
    moving = false; start();
  };
  const beginMove = () => {
    generation++;
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    layoutTimer = null;
    moving = true; stop();
    gradient.style.visibility = 'hidden'; trails.style.visibility = 'hidden';
  };
  const queueRebuild = () => {
    beginMove();
    layoutTimer = setTimeout(() => { layoutTimer = null; void rebuild(); }, 160);
  };
  const visibility = () => { if (document.hidden) stop(); else start(); };
  map.on('movestart zoomstart', beginMove);
  map.on('moveend resize', queueRebuild);
  document.addEventListener('visibilitychange', visibility);
  void rebuild();
  return () => {
    disposed = true; stop();
    generation++;
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    map.off('movestart zoomstart', beginMove);
    map.off('moveend resize', queueRebuild);
    document.removeEventListener('visibilitychange', visibility);
    gradient.remove(); trails.remove();
  };
}

/** Backwards-compatible wind adapter: U/V in m/s, legend in knots. */
export function mountWindFlow(map: L.Map, field: WindField, frame: WindFrame, options: {
  opacity: number; night: boolean; animate: boolean; onCoverage: (available: boolean) => void;
}): () => void {
  return mountFlowCanvas(map, (lat, lon) => {
    const wind = sampleWind(field, frame, lat, lon);
    return wind ? { east: wind.u, north: wind.v, value: Math.hypot(wind.u, wind.v) * KNOTS_PER_MS } : null;
  }, { ...options, color: windColor });
}