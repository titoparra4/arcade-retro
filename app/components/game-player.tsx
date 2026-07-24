"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Game } from "@/lib/supabase/games";
import { createClient } from "@/lib/supabase/client";
import {
  GAME_REGISTRY,
  SKINS,
  type GameComponentHandle,
} from "./games/registry";
import { TouchControls } from "./games/touch-controls";
import { useUser } from "./user-context";

export function GamePlayer({ game }: { game: Game }) {
  const router = useRouter();
  const { user, skin, setSkin } = useUser();
  const gameEntry = GAME_REGISTRY[game.id];
  const GameComponent = gameEntry?.Component;
  const gameRef = useRef<GameComponentHandle>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [extraStat, setExtraStat] = useState(0);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [customName, setCustomName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // El usuario llega tras montar (localStorage); solo pisa el nombre si no lo editó el jugador.
  const name = customName ?? user?.name ?? "INVITADO";

  // Simulación decorativa de puntuación/nivel — solo para los juegos que aún no tienen juego real.
  useEffect(() => {
    if (GameComponent || over || paused) return;
    const t = setInterval(() => {
      setScore((s) => {
        const next = s + Math.floor(10 + Math.random() * 90);
        if (next % 2500 < 100) setLevel((l) => l + 1);
        return next;
      });
    }, 220);
    return () => clearInterval(t);
  }, [GameComponent, over, paused]);

  const endGame = () => {
    if (GameComponent) {
      gameRef.current?.forceGameOver();
    } else {
      setOver(true);
    }
  };

  const restart = () => {
    setPaused(false);
    setOver(false);
    setWon(false);
    setSaved(false);
    setSaveError(null);
    if (GameComponent) {
      gameRef.current?.reset();
    } else {
      setScore(0);
      setLevel(1);
    }
  };

  const handleGameOver = (finalScore: number, won = false) => {
    setScore(finalScore);
    setWon(won);
    setOver(true);
  };

  const handleSaveScore = async () => {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("scores")
      .insert({ game_id: game.id, player_name: name, score });
    setSaving(false);
    if (error) {
      setSaveError("No se pudo guardar la puntuación. Intenta de nuevo.");
      return;
    }
    setSaved(true);
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(level).padStart(2, "0")}</div>
          </div>
          {GameComponent && gameEntry?.extraStatLabel && extraStat > 0 && (
            <div className="hud-stat">
              <div className="l">{gameEntry.extraStatLabel}</div>
              <div className="v" style={{ color: "var(--cyan)" }}>
                {extraStat.toFixed(1)}s
              </div>
            </div>
          )}
        </div>
        <div className="hud-actions">
          {GameComponent && gameEntry?.supportsSkins && (
            <div className="hud-skin">
              <span className="hud-skin-label">Skin</span>
              <div className="tetris-select-wrap">
                <select
                  className="tetris-select"
                  value={skin}
                  onChange={(e) =>
                    setSkin(e.target.value as (typeof SKINS)[number]["value"])
                  }
                  aria-label="Seleccionar skin"
                >
                  {SKINS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <button
            className="btn yellow hud-pause"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button className="btn magenta" onClick={endGame}>
            FIN
          </button>
          <button
            className="btn ghost"
            onClick={() => router.push(`/games/${game.id}`)}
          >
            SALIR
          </button>
        </div>
      </div>

      <div className={`crt${GameComponent ? " crt--fit" : ""}`}>
        <div className="crt-screen">
          {GameComponent ? (
            <GameComponent
              ref={gameRef}
              paused={paused}
              skin={skin}
              onScoreChange={setScore}
              onLivesChange={setLives}
              onLevelChange={setLevel}
              onGameOver={handleGameOver}
              onExtraStatChange={setExtraStat}
            />
          ) : (
            <div className="game-arena">
              <div className="grid-floor"></div>
              <div className="enemy e1"></div>
              <div className="enemy e2"></div>
              <div className="enemy e3"></div>
              <div className="player-ship"></div>
            </div>
          )}
          {paused && (
            <div
              className="crt-content"
              style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginTop: 10,
                    letterSpacing: "0.16em",
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {GameComponent && gameEntry?.touchControls && (
        <div className="game-console">
          <TouchControls buttons={gameEntry.touchControls} paused={paused} />
          <div className="game-console-bar">
            <button
              className="btn yellow console-pause"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "REANUDAR" : "PAUSA"}
            </button>
            {gameEntry?.supportsSkins && (
              <div className="tetris-select-wrap console-skin">
                <select
                  className="tetris-select"
                  value={skin}
                  onChange={(e) =>
                    setSkin(e.target.value as (typeof SKINS)[number]["value"])
                  }
                  aria-label="Seleccionar skin"
                >
                  {SKINS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>{won ? "¡VICTORIA!" : "FIN DEL JUEGO"}</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setCustomName(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                />
                <button
                  className="btn yellow"
                  disabled={saving}
                  onClick={handleSaveScore}
                >
                  {saving ? "GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            {saveError && (
              <div className="toast-saved" style={{ color: "var(--magenta)" }}>
                ▸ {saveError}
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <button
                className="btn magenta"
                onClick={() => router.push("/games")}
              >
                VOLVER AL ARCADE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
