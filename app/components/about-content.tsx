"use client";

import { useEffect } from "react";

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

const HIGHLIGHTS: { i: IconKind; t: string; c: string }[] = [
  { i: "HEART", t: "HECHO CON ❤️ PARA JUGADORES", c: "magenta" },
  { i: "BROWSER", t: "JUEGOS EN HTML — CORREN EN CUALQUIER NAVEGADOR", c: "cyan" },
  { i: "PLANT", t: "PROYECTO EN CONSTANTE CRECIMIENTO", c: "green" },
];

export function AboutContent() {
  useReveal();

  return (
    <div className="about fade-in">
      {/* ABOUT */}
      <section className="about-hero">
        <div className="kicker pixel neon-yellow">▸ ACERCA DE</div>
        <h1 className="about-title">ACERCA DE ARCADE RETRO</h1>
        <p className="about-mission">
          ARCADE RETRO nació del amor por los videojuegos clásicos. Nuestra misión es preservar y
          celebrar los arcades que definieron una generación, haciéndolos accesibles para todos, en
          cualquier lugar y sin costo.
        </p>

        <div className="highlight-row">
          {HIGHLIGHTS.map((h, i) => (
            <div key={i} className={"highlight " + h.c} style={{ transitionDelay: i * 80 + "ms" }}>
              <HighlightIcon kind={h.i} />
              <div className="hl-text pixel">{h.t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* banner divisor */}
      <div className="about-divider reveal" aria-hidden="true">
        <div className="div-bar"></div>
        <div className="div-pixels">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} style={{ animationDelay: i * 80 + "ms" }}></span>
          ))}
        </div>
        <div className="div-bar"></div>
      </div>
    </div>
  );
}

type IconKind = "HEART" | "BROWSER" | "PLANT";

function HighlightIcon({ kind }: { kind: IconKind }) {
  const C = "currentColor";
  if (kind === "HEART")
    return (
      <svg className="hl-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="2" y="3" width="4" height="2"/><rect x="10" y="3" width="4" height="2"/>
        <rect x="1" y="4" width="2" height="4"/><rect x="13" y="4" width="2" height="4"/>
        <rect x="2" y="8" width="2" height="2"/><rect x="12" y="8" width="2" height="2"/>
        <rect x="3" y="9" width="10" height="2"/>
        <rect x="4" y="11" width="8" height="2"/>
        <rect x="5" y="12" width="6" height="2"/>
        <rect x="6" y="13" width="4" height="1"/>
        <rect x="7" y="14" width="2" height="1"/>
      </g></svg>
    );
  if (kind === "BROWSER")
    return (
      <svg className="hl-icon" viewBox="0 0 16 16"><g fill={C}>
        <rect x="1" y="2" width="14" height="12" fill="none" stroke={C} strokeWidth="1.4"/>
        <rect x="1" y="2" width="14" height="3"/>
        <rect x="3" y="3" width="1" height="1" fill="#0a0a0f"/>
        <rect x="5" y="3" width="1" height="1" fill="#0a0a0f"/>
        <rect x="7" y="3" width="1" height="1" fill="#0a0a0f"/>
        <rect x="3" y="7" width="4" height="1"/><rect x="3" y="9" width="6" height="1"/><rect x="3" y="11" width="3" height="1"/>
      </g></svg>
    );
  return (
    <svg className="hl-icon" viewBox="0 0 16 16"><g fill={C}>
      <rect x="7" y="2" width="2" height="10"/>
      <rect x="4" y="4" width="3" height="2"/><rect x="9" y="6" width="3" height="2"/>
      <rect x="3" y="3" width="2" height="2"/><rect x="11" y="5" width="2" height="2"/>
      <rect x="3" y="12" width="10" height="2"/>
      <rect x="4" y="14" width="8" height="1"/>
    </g></svg>
  );
}
