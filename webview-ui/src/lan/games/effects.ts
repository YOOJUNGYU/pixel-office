// Visual + sound effects of the arcade (never part of a run: nothing here is replayed).
import {
  GAME_COLORS as C,
  GAME_FLOAT_MS,
  GAME_FONT_BOLD,
  GAME_PARTICLE_GRAVITY,
  GAME_PARTICLE_MS,
  GAME_PARTICLES_MAX,
  GAME_SFX,
  GAME_SHAKE_MS,
  GAME_SOUND_VOLUME,
} from '../../constants.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ms: number;
  color: string;
  size: number;
}
interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  ms: number;
}

/** Particles, floating points and screen shake, in the game's logical px. */
export class Effects {
  parts: Particle[] = [];
  floats: Float[] = [];
  shakeMs = 0;
  shakePx = 0;

  burst(x: number, y: number, color: string, n: number, speed = 0.08): void {
    for (let i = 0; i < n && this.parts.length < GAME_PARTICLES_MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed / 2,
        ms: GAME_PARTICLE_MS * (0.5 + Math.random() / 2),
        color,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  float(x: number, y: number, text: string, color: string = C.accent): void {
    this.floats.push({ x, y, text, color, ms: GAME_FLOAT_MS });
  }

  shake(px: number): void {
    this.shakePx = Math.max(this.shakePx, px);
    this.shakeMs = GAME_SHAKE_MS;
  }

  /** Current shake offset (whole px). */
  offset(): [number, number] {
    if (this.shakeMs <= 0) return [0, 0];
    const k = (this.shakePx * this.shakeMs) / GAME_SHAKE_MS;
    return [Math.round((Math.random() * 2 - 1) * k), Math.round((Math.random() * 2 - 1) * k)];
  }

  update(dt: number): void {
    this.shakeMs = Math.max(0, this.shakeMs - dt);
    if (this.shakeMs === 0) this.shakePx = 0;
    for (const p of this.parts) {
      p.vy += GAME_PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ms -= dt;
    }
    this.parts = this.parts.filter((p) => p.ms > 0);
    for (const f of this.floats) f.ms -= dt;
    this.floats = this.floats.filter((f) => f.ms > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, p.ms / (GAME_PARTICLE_MS / 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.font = GAME_FONT_BOLD;
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const k = f.ms / GAME_FLOAT_MS;
      const y = Math.round(f.y - (1 - k) * 16);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = C.bg;
      ctx.fillText(f.text, f.x + 1, y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.parts = [];
    this.floats = [];
    this.shakeMs = 0;
  }
}

let audio: AudioContext | null = null;

/** A short synth blip (GAME_SFX[kind]); silently nothing where Web Audio is missing. */
export function playSfx(kind: string): void {
  const spec = GAME_SFX[kind];
  if (!spec) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const [from, to, ms, wave] = spec;
    const t0 = audio.currentTime;
    const t1 = t0 + ms / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t1);
    gain.gain.setValueAtTime(GAME_SOUND_VOLUME, t0);
    gain.gain.exponentialRampToValueAtTime(GAME_SOUND_VOLUME / 100, t1);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t1);
  } catch {
    // no audio here: play silent
  }
}
