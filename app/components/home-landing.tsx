"use client";

import Link from "next/link";
import { useEffect } from "react";
import { GAMES, type Game } from "../data";

// Aparición al hacer scroll: añade .in a los .reveal cuando entran al viewport.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function FloatingSilhouettes() {
  // Siluetas pixel decorativas de formas arcade clásicas
  return (
    <div className="home-silos" aria-hidden="true">
      <svg className="silo s1" viewBox="0 0 40 32"><g fill="#00f5ff">
        <rect x="6" y="4" width="4" height="4"/><rect x="30" y="4" width="4" height="4"/>
        <rect x="2" y="8" width="36" height="4"/>
        <rect x="2" y="12" width="4" height="4"/><rect x="14" y="12" width="4" height="4"/><rect x="22" y="12" width="4" height="4"/><rect x="34" y="12" width="4" height="4"/>
        <rect x="2" y="16" width="36" height="4"/>
        <rect x="6" y="20" width="4" height="4"/><rect x="30" y="20" width="4" height="4"/>
      </g></svg>
      <svg className="silo s2" viewBox="0 0 32 32"><g fill="#ff006e">
        <rect x="8" y="0" width="16" height="4"/>
        <rect x="4" y="4" width="24" height="4"/>
        <rect x="0" y="8" width="32" height="12"/>
        <rect x="0" y="20" width="6" height="6"/><rect x="10" y="20" width="4" height="6"/><rect x="18" y="20" width="4" height="6"/><rect x="26" y="20" width="6" height="6"/>
      </g></svg>
      <svg className="silo s3" viewBox="0 0 32 32"><g fill="#f5ff00">
        <rect x="10" y="0" width="12" height="4"/>
        <rect x="6" y="4" width="20" height="4"/>
        <rect x="4" y="8" width="6" height="6"/><rect x="22" y="8" width="6" height="6"/>
        <rect x="2" y="14" width="28" height="10"/>
        <rect x="6" y="24" width="4" height="4"/><rect x="14" y="24" width="4" height="4"/><rect x="22" y="24" width="4" height="4"/>
      </g></svg>
      <svg className="silo s4" viewBox="0 0 24 24"><g fill="#00ff88">
        <rect x="10" y="0" width="4" height="24"/>
        <rect x="0" y="10" width="24" height="4"/>
        <rect x="6" y="6" width="12" height="12" fill="none" stroke="#00ff88" strokeWidth="2"/>
      </g></svg>
      {/* s5: UFO / platillo */}
      <svg className="silo s5" viewBox="0 0 36 24"><g fill="#aa00ff">
        <rect x="14" y="2" width="8" height="4"/>
        <rect x="10" y="6" width="16" height="4"/>
        <rect x="4" y="10" width="28" height="4"/>
        <rect x="0" y="14" width="36" height="4"/>
        <rect x="6" y="18" width="4" height="2"/><rect x="16" y="18" width="4" height="2"/><rect x="26" y="18" width="4" height="2"/>
      </g></svg>
      {/* s6: Moneda */}
      <svg className="silo s6" viewBox="0 0 20 20"><g fill="#ffcf3a">
        <rect x="6" y="0" width="8" height="2"/>
        <rect x="2" y="2" width="16" height="2"/>
        <rect x="0" y="4" width="20" height="12"/>
        <rect x="2" y="16" width="16" height="2"/>
        <rect x="6" y="18" width="8" height="2"/>
        <rect x="8" y="4" width="4" height="12" fill="#0a0a0f"/>
      </g></svg>
      {/* s7: Corazón pixel */}
      <svg className="silo s7" viewBox="0 0 24 22"><g fill="#ff3060">
        <rect x="2" y="2" width="6" height="2"/><rect x="16" y="2" width="6" height="2"/>
        <rect x="0" y="4" width="10" height="4"/><rect x="14" y="4" width="10" height="4"/>
        <rect x="0" y="8" width="24" height="4"/>
        <rect x="2" y="12" width="20" height="2"/>
        <rect x="4" y="14" width="16" height="2"/>
        <rect x="6" y="16" width="12" height="2"/>
        <rect x="8" y="18" width="8" height="2"/>
        <rect x="10" y="20" width="4" height="2"/>
      </g></svg>
      {/* s8: D-pad */}
      <svg className="silo s8" viewBox="0 0 24 24"><g fill="#00d4ff">
        <rect x="8" y="2" width="8" height="6"/>
        <rect x="2" y="8" width="20" height="8"/>
        <rect x="8" y="16" width="8" height="6"/>
        <rect x="11" y="6" width="2" height="2" fill="#0a0a0f"/>
        <rect x="11" y="16" width="2" height="2" fill="#0a0a0f"/>
        <rect x="4" y="11" width="2" height="2" fill="#0a0a0f"/>
        <rect x="18" y="11" width="2" height="2" fill="#0a0a0f"/>
      </g></svg>
    </div>
  );
}

function FeatureIcon({ kind }: { kind: string }) {
  // Iconos pixel 16x16 en SVG a base de rects; el glow lo da el color del padre
  const C = "currentColor";
  if (kind === "GAMEPAD")
    return (
      <svg className="ft-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="2" y="6" width="12" height="6"/>
        <rect x="0" y="8" width="2" height="4"/><rect x="14" y="8" width="2" height="4"/>
        <rect x="3" y="8" width="2" height="2"/><rect x="2" y="9" width="4" height="0.5"/>
        <rect x="11" y="7" width="1.5" height="1.5"/><rect x="11" y="10" width="1.5" height="1.5"/>
      </g></svg>
    );
  if (kind === "FREE")
    return (
      <svg className="ft-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="3" y="3" width="10" height="10" fill="none" stroke={C} strokeWidth="1.5"/>
        <rect x="5" y="6" width="1.5" height="4"/><rect x="5" y="6" width="4" height="1.5"/><rect x="5" y="8" width="3" height="1"/>
        <rect x="10" y="6" width="1.5" height="4"/>
      </g></svg>
    );
  if (kind === "TROPHY")
    return (
      <svg className="ft-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="3" y="2" width="10" height="2"/>
        <rect x="3" y="2" width="2" height="6"/><rect x="11" y="2" width="2" height="6"/>
        <rect x="5" y="8" width="6" height="2"/>
        <rect x="7" y="10" width="2" height="3"/>
        <rect x="5" y="13" width="6" height="1.5"/>
        <rect x="1" y="3" width="2" height="3"/><rect x="13" y="3" width="2" height="3"/>
      </g></svg>
    );
  if (kind === "ROCKET")
    return (
      <svg className="ft-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="7" y="1" width="2" height="2"/>
        <rect x="6" y="3" width="4" height="2"/>
        <rect x="5" y="5" width="6" height="6"/>
        <rect x="4" y="11" width="2" height="2"/><rect x="10" y="11" width="2" height="2"/>
        <rect x="7" y="6" width="2" height="2" fill="#0a0a0f"/>
        <rect x="6" y="13" width="1" height="2"/><rect x="9" y="13" width="1" height="2"/>
      </g></svg>
    );
  return null;
}

function MiniCard({ game }: { game: Game }) {
  return (
    <Link href={`/games/${game.id}`} className="mini-card">
      <div className="mini-cover">
        <div className={"cover-bg " + game.cover}></div>
      </div>
      <div className="mini-meta">
        <div className="mini-title">{game.title}</div>
        <div className="mini-cat">{game.cat}</div>
      </div>
    </Link>
  );
}

const FEATURES = [
  { i: "GAMEPAD", t: "JUEGOS CLÁSICOS", d: "Arkanoid, Tetris, Snake y muchos más. Los mejores arcades de todos los tiempos en un solo lugar.", c: "cyan" },
  { i: "FREE", t: "100% GRATIS", d: "Sin suscripciones, sin pagos ocultos. Todos los juegos disponibles de forma gratuita.", c: "yellow" },
  { i: "TROPHY", t: "LADDER BOARDS", d: "Compite con jugadores de todo el mundo. Escala el ranking y demuestra quién es el mejor.", c: "magenta" },
  { i: "ROCKET", t: "SIEMPRE CRECIENDO", d: "Agregamos nuevos juegos constantemente. Vuelve seguido, siempre habrá algo nuevo que jugar.", c: "green" },
];

export function HomeLanding() {
  useReveal();
  return (
    <div className="home fade-in">
      {/* HERO */}
      <section className="home-hero">
        <FloatingSilhouettes />
        <div className="home-hero-inner">
          <div className="hero-eyebrow pixel neon-yellow">
            ▸ INSERTA UNA MONEDA<span className="blink">_</span>
          </div>
          <h1 className="home-title">
            <span className="line-1">EL ARCADE</span>
            <span className="line-2">CLÁSICO ESTÁ</span>
            <span className="line-3">DE VUELTA</span>
          </h1>
          <p className="home-sub">
            Juega los mejores clásicos directamente en tu navegador.
            <br />
            Sin descargas. Sin costo. Solo diversión.
          </p>
          <div className="home-ctas">
            <Link href="/games" className="btn xl pulse">
              ▶ EXPLORAR JUEGOS
            </Link>
            <Link href="/auth" className="btn xl magenta">
              ✦ CREAR CUENTA
            </Link>
          </div>
          <div className="hero-scroll" aria-hidden="true">
            <span>DESLIZA</span>
            <span className="arrow">▼</span>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="home-section reveal">
        <div className="section-head">
          <div className="kicker pixel neon-magenta">{"// 01"}</div>
          <h2 className="section-title">¿POR QUÉ ARCADE RETRO?</h2>
          <div className="section-rule"></div>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.i}
              className={"feature-card " + f.c}
              style={{ transitionDelay: i * 80 + "ms" }}
            >
              <FeatureIcon kind={f.i} />
              <div className="ft-title pixel">{f.t}</div>
              <div className="ft-desc">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* GAMES PREVIEW */}
      <section className="home-section reveal">
        <div className="section-head">
          <div className="kicker pixel neon-cyan">{"// 02"}</div>
          <h2 className="section-title">JUEGOS DISPONIBLES AHORA</h2>
          <div className="section-rule"></div>
        </div>
        <div className="mini-rail">
          {GAMES.slice(0, 6).map((g) => (
            <MiniCard key={g.id} game={g} />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link href="/games" className="btn lg">
            VER TODOS LOS JUEGOS →
          </Link>
        </div>
      </section>
    </div>
  );
}
