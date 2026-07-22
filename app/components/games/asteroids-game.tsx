"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GameComponentHandle, GameComponentProps } from "./registry";

const W = 800;
const H = 600;

const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_DURATION = 5;
const POWERUP_TTL = 12;
const TRIPLE_SPREAD = 0.18;

const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

const CONTROL_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────
class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl = 1.1;
  radius = 2;
  dead = false;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────
class Asteroid {
  x: number;
  y: number;
  size: number;
  radius: number;
  dead = false;
  vx: number;
  vy: number;
  rotSpeed: number;
  rot: number;
  verts: [number, number][] = [];

  constructor(x: number, y: number, size = 3) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = RADII[size];

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    const n = randInt(8, 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split(): Asteroid[] {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── PowerUp ───────────────────────────────────────────────────────────────
class PowerUp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius = 12;
  ttl = POWERUP_TTL;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(20, 40);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt: number) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "#0ff";
    ctx.lineWidth = 2;
    const r = this.radius * pulse;
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.fillStyle = "#0ff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("3x", this.x, this.y);
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────
class Ship {
  x = W / 2;
  y = H / 2;
  angle = -Math.PI / 2;
  vx = 0;
  vy = 0;
  radius = 12;
  thrusting = false;
  invincible = 3;
  shootCooldown = 0;
  dead = false;
  tripleShot = 0;

  reset() {
    this.x = W / 2;
    this.y = H / 2;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.dead = false;
  }

  update(dt: number, keys: Record<string, boolean>) {
    if (this.dead) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot > 0) this.tripleShot -= dt;

    const ROT = 3.5; // rad/s
    const THRUST = 260; // px/s²
    const DRAG = 0.987;

    if (keys["ArrowLeft"]) this.angle -= ROT * dt;
    if (keys["ArrowRight"]) this.angle += ROT * dt;

    this.thrusting = !!keys["ArrowUp"];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot(): Bullet[] {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      return [
        new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0)
      return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo(20, 0); // nariz
    ctx.lineTo(-12, -9); // ala izquierda
    ctx.lineTo(-7, 0); // muesca trasera
    ctx.lineTo(-12, 9); // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8, 4);
      ctx.strokeStyle = "rgba(255, 130, 0, 0.85)";
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ───────────────────────────────────────────────
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Estado del juego ─────────────────────────────────────────────────────
type InternalGameState = "playing" | "dead" | "gameover";

interface GameData {
  ship: Ship;
  bullets: Bullet[];
  asteroids: Asteroid[];
  particles: Particle[];
  powerUps: PowerUp[];
  score: number;
  lives: number;
  level: number;
  state: InternalGameState;
  deadTimer: number;
  powerUpSpawned: boolean;
  killsSinceSpawn: number;
}

function spawnAsteroids(asteroids: Asteroid[], count: number) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function createInitialGameData(): GameData {
  const data: GameData = {
    ship: new Ship(),
    bullets: [],
    asteroids: [],
    particles: [],
    powerUps: [],
    score: 0,
    lives: 3,
    level: 1,
    state: "playing",
    deadTimer: 0,
    powerUpSpawned: false,
    killsSinceSpawn: 0,
  };
  spawnAsteroids(data.asteroids, 4);
  return data;
}

function explode(particles: Particle[], x: number, y: number, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip(data: GameData) {
  explode(data.particles, data.ship.x, data.ship.y, 14);
  data.ship.dead = true;
  data.lives--;
  if (data.lives <= 0) {
    data.state = "gameover";
  } else {
    data.state = "dead";
    data.deadTimer = 2;
  }
}

function nextLevel(data: GameData) {
  data.level++;
  data.bullets = [];
  data.particles = [];
  data.powerUps = [];
  data.powerUpSpawned = false;
  data.killsSinceSpawn = 0;
  data.ship.reset();
  spawnAsteroids(data.asteroids, 3 + data.level);
}

// ── Componente ────────────────────────────────────────────────────────────
export type AsteroidsGameProps = GameComponentProps;
export type AsteroidsGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  lives: number;
  level: number;
  tripleShot: number;
}

export const AsteroidsGame = forwardRef<
  AsteroidsGameHandle,
  AsteroidsGameProps
>(function AsteroidsGame(
  {
    paused,
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
    onExtraStatChange,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<GameData>(createInitialGameData());
  const pausedRef = useRef(paused);
  const callbacksRef = useRef({
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
    onExtraStatChange,
  });
  const reportedRef = useRef<ReportedState>({
    score: 0,
    lives: 3,
    level: 1,
    tripleShot: 0,
  });

  pausedRef.current = paused;
  callbacksRef.current = {
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
    onExtraStatChange,
  };

  const reset = useCallback(() => {
    dataRef.current = createInitialGameData();
    reportedRef.current = { score: 0, lives: 3, level: 1, tripleShot: 0 };
    callbacksRef.current.onScoreChange(0);
    callbacksRef.current.onLivesChange(3);
    callbacksRef.current.onLevelChange(1);
    callbacksRef.current.onExtraStatChange(0);
  }, []);

  const forceGameOver = useCallback(() => {
    const data = dataRef.current;
    if (data.state === "gameover") return;
    data.state = "gameover";
  }, []);

  useImperativeHandle(ref, () => ({ reset, forceGameOver }), [
    reset,
    forceGameOver,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.focus();

    const keys: Record<string, boolean> = {};
    const justPressed: Record<string, boolean> = {};

    function pressed(code: string) {
      const val = justPressed[code];
      justPressed[code] = false;
      return val;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (CONTROL_CODES.has(e.code)) e.preventDefault();
      if (!keys[e.code]) justPressed[e.code] = true;
      keys[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (CONTROL_CODES.has(e.code)) e.preventDefault();
      keys[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    function update(dt: number) {
      const data = dataRef.current;

      if (data.state === "gameover") return;

      if (data.state === "dead") {
        data.deadTimer -= dt;
        data.particles.forEach((p) => p.update(dt));
        data.particles = data.particles.filter((p) => !p.dead);
        data.asteroids.forEach((a) => a.update(dt));
        if (data.deadTimer <= 0) {
          data.state = "playing";
          data.ship.reset();
        }
        return;
      }

      if (pressed("Space")) {
        data.bullets.push(...data.ship.tryShoot());
      }

      data.ship.update(dt, keys);
      data.bullets.forEach((b) => b.update(dt));
      data.asteroids.forEach((a) => a.update(dt));
      data.particles.forEach((p) => p.update(dt));
      data.powerUps.forEach((p) => p.update(dt));

      data.bullets = data.bullets.filter((b) => !b.dead);
      data.particles = data.particles.filter((p) => !p.dead);
      data.powerUps = data.powerUps.filter((p) => !p.dead);

      for (const p of data.powerUps) {
        if (!p.dead && dist(data.ship, p) < data.ship.radius + p.radius) {
          p.dead = true;
          data.ship.tripleShot = POWERUP_DURATION;
        }
      }

      // Bala vs asteroide
      const newAsteroids: Asteroid[] = [];
      for (const b of data.bullets) {
        for (const a of data.asteroids) {
          if (!a.dead && !b.dead && dist(b, a) < a.radius) {
            b.dead = true;
            a.dead = true;
            data.score += POINTS[a.size];
            explode(data.particles, a.x, a.y, a.size * 5);
            newAsteroids.push(...a.split());
            if (!data.powerUpSpawned) {
              data.killsSinceSpawn++;
              const guaranteed = data.killsSinceSpawn >= 5;
              if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
                data.powerUps.push(new PowerUp(a.x, a.y));
                data.powerUpSpawned = true;
              }
            }
          }
        }
      }
      data.asteroids = data.asteroids
        .filter((a) => !a.dead)
        .concat(newAsteroids);
      data.bullets = data.bullets.filter((b) => !b.dead);

      // Nave vs asteroide
      if (data.ship.invincible <= 0) {
        for (const a of data.asteroids) {
          if (dist(data.ship, a) < data.ship.radius + a.radius * 0.82) {
            killShip(data);
            break;
          }
        }
      }

      // Nivel completado
      if (data.asteroids.length === 0) nextLevel(data);
    }

    function draw() {
      const data = dataRef.current;
      ctx!.fillStyle = "#000";
      ctx!.fillRect(0, 0, W, H);

      data.particles.forEach((p) => p.draw(ctx!));
      data.asteroids.forEach((a) => a.draw(ctx!));
      data.powerUps.forEach((p) => p.draw(ctx!));
      data.bullets.forEach((b) => b.draw(ctx!));
      data.ship.draw(ctx!);
    }

    function reportChanges() {
      const data = dataRef.current;
      const reported = reportedRef.current;
      const cb = callbacksRef.current;

      if (data.score !== reported.score) {
        reported.score = data.score;
        cb.onScoreChange(data.score);
      }
      if (data.lives !== reported.lives) {
        reported.lives = data.lives;
        cb.onLivesChange(data.lives);
      }
      if (data.level !== reported.level) {
        reported.level = data.level;
        cb.onLevelChange(data.level);
      }
      const tripleShot = Math.max(
        0,
        Math.round(data.ship.tripleShot * 10) / 10,
      );
      if (tripleShot !== reported.tripleShot) {
        reported.tripleShot = tripleShot;
        cb.onExtraStatChange(tripleShot);
      }
    }

    let lastTime: number | null = null;
    let rafId = 0;
    let wasGameOver = false;

    function loop(ts: number) {
      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      if (!pausedRef.current) update(dt);
      draw();
      reportChanges();

      const data = dataRef.current;
      if (data.state === "gameover") {
        if (!wasGameOver) {
          wasGameOver = true;
          callbacksRef.current.onGameOver(data.score);
        }
      } else {
        wasGameOver = false;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      tabIndex={0}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        outline: "none",
      }}
    />
  );
});
