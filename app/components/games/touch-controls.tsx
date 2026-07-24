"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import type { TouchButton } from "./registry";

// Auto-repetición del modo "repeat", imitando el auto-repeat de un teclado físico:
// tras un retardo inicial se re-emite keydown a intervalo fijo mientras se mantiene.
const TOUCH_REPEAT_MS = 120;
const TOUCH_REPEAT_DELAY_MS = 220;

// La cruceta (D-pad) siempre dibuja las 4 direcciones en cruz; las que el juego
// no usa se muestran atenuadas e inertes. Posición fija en la rejilla 3×3.
const DPAD_DIRS = ["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"] as const;
const DPAD_POS: Record<string, { col: number; row: number }> = {
  ArrowUp: { col: 2, row: 1 },
  ArrowLeft: { col: 1, row: 2 },
  ArrowRight: { col: 3, row: 2 },
  ArrowDown: { col: 2, row: 3 },
};
const DPAD_GLYPH: Record<string, string> = {
  ArrowUp: "▲",
  ArrowLeft: "◄",
  ArrowRight: "►",
  ArrowDown: "▼",
};

// Color neón por botón de acción, por orden: el primario (fuego/soltar) queda
// magenta; el secundario (empuje/rotar) cian. Todos sobre cápsula oscura.
const ACTION_COLORS = [
  "var(--cyan)",
  "var(--magenta)",
  "var(--green)",
  "var(--yellow)",
];

// El `key` se deriva del `code` por corrección; los juegos leen e.code, no e.key.
function codeToKey(code: string): string {
  return code === "Space" ? " " : code;
}

function dispatchKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(
    new KeyboardEvent(type, { code, key: codeToKey(code), bubbles: true }),
  );
}

interface TouchControlsProps {
  buttons: TouchButton[];
  paused?: boolean; // al pausar (incl. auto-pausa) se sueltan todos los botones activos
}

// Estado en vivo por botón (por índice). Vive en un ref para no re-renderizar en
// cada toque y para poder limpiar temporizadores en release/pausa/desmontaje.
interface ButtonRuntime {
  active: boolean;
  delayTimer?: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
}

export function TouchControls({ buttons, paused }: TouchControlsProps) {
  const runtimeRef = useRef<Map<number, ButtonRuntime>>(new Map());

  const getRuntime = useCallback((i: number): ButtonRuntime => {
    let rt = runtimeRef.current.get(i);
    if (!rt) {
      rt = { active: false };
      runtimeRef.current.set(i, rt);
    }
    return rt;
  }, []);

  // Soltar/cancelar un botón: emite el keyup pendiente (hold/repeat) y limpia
  // temporizadores. Idempotente vía `active` para tolerar pointerup + touchend.
  const release = useCallback(
    (i: number) => {
      const rt = runtimeRef.current.get(i);
      if (!rt || !rt.active) return;
      const btn = buttons[i];
      if (rt.delayTimer) clearTimeout(rt.delayTimer);
      if (rt.intervalTimer) clearInterval(rt.intervalTimer);
      rt.delayTimer = undefined;
      rt.intervalTimer = undefined;
      rt.active = false;
      // "tap" ya emitió su keyup al presionar; hold/repeat lo emiten aquí.
      if (btn.mode !== "tap") dispatchKey("keyup", btn.code);
    },
    [buttons],
  );

  const press = useCallback(
    (i: number) => {
      const btn = buttons[i];
      const rt = getRuntime(i);
      if (rt.active) return; // evita keydown duplicado (pointerdown + touchstart)
      rt.active = true;
      dispatchKey("keydown", btn.code);
      if (btn.mode === "tap") {
        // una sola acción por toque: keyup inmediato, sin esperar a soltar
        dispatchKey("keyup", btn.code);
        rt.active = false;
        return;
      }
      if (btn.mode === "repeat") {
        rt.delayTimer = setTimeout(() => {
          rt.intervalTimer = setInterval(() => {
            dispatchKey("keydown", btn.code);
          }, TOUCH_REPEAT_MS);
        }, TOUCH_REPEAT_DELAY_MS);
      }
      // "hold": nada más; el keyup llega en release()
    },
    [buttons, getRuntime],
  );

  const releaseAll = useCallback(() => {
    runtimeRef.current.forEach((_rt, i) => release(i));
  }, [release]);

  // Al pausar (incluida la auto-pausa) soltar todo: nunca dejar una tecla pegada.
  useEffect(() => {
    if (paused) releaseAll();
  }, [paused, releaseAll]);

  // Al desmontar, soltar cualquier botón activo.
  useEffect(() => () => releaseAll(), [releaseAll]);

  // Handlers de puntero comunes a toda tecla interactiva (por índice de botón).
  const pointerProps = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      // Captura el puntero: iOS Safari deja de disparar pointerleave/cancel
      // espurios al menor movimiento del dedo, así un "mantener" no se suelta solo.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture puede fallar si el puntero ya no es válido; se ignora.
      }
      press(i);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      release(i);
    },
    onPointerCancel: () => release(i),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Índice de cada dirección presente en el grupo "pad" (para la cruceta).
  const padIndexByCode = new Map<string, number>();
  buttons.forEach((b, i) => {
    if (b.group === "pad") padIndexByCode.set(b.code, i);
  });

  const actions = buttons
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.group === "action");

  return (
    <div className={`gamepad${actions.length ? "" : " gamepad--pad-only"}`}>
      <div className="dpad">
        {DPAD_DIRS.map((code) => {
          const i = padIndexByCode.get(code);
          const pos = DPAD_POS[code];
          const style: CSSProperties = {
            gridColumn: pos.col,
            gridRow: pos.row,
          };
          if (i === undefined) {
            return (
              <div
                key={code}
                className="dpad-key dpad-key--off"
                style={style}
                aria-hidden
              >
                {DPAD_GLYPH[code]}
              </div>
            );
          }
          return (
            <button
              key={code}
              type="button"
              className="dpad-key"
              style={style}
              aria-label={buttons[i].label}
              {...pointerProps(i)}
            >
              {DPAD_GLYPH[code]}
            </button>
          );
        })}
      </div>

      {actions.length > 0 && (
        <div className="gamepad-actions">
          {actions.map(({ b, i }, idx) => {
            // label = "▲ EMPUJE" → glifo + caption. Sin espacio → solo glifo.
            const space = b.label.indexOf(" ");
            const glyph = space === -1 ? b.label : b.label.slice(0, space);
            const caption = space === -1 ? "" : b.label.slice(space + 1);
            const capStyle = {
              "--cap": ACTION_COLORS[idx % ACTION_COLORS.length],
            } as CSSProperties;
            return (
              <div className="action-cap-wrap" key={i}>
                <button
                  type="button"
                  className="action-cap"
                  style={capStyle}
                  aria-label={b.label}
                  {...pointerProps(i)}
                >
                  {glyph}
                </button>
                {caption && <span className="action-cap-label">{caption}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
