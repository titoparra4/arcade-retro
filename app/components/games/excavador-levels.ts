// ===== Excavador (Dig Dug) — layouts de nivel =====
// Geometría de la grilla y los 3 layouts hardcodeados que consume
// excavador-game.tsx. Vive en su propio módulo para que el componente de juego
// no cargue con 100 líneas de coordenadas.
//
// Convención de la grilla (SPEC excavador-01-clasico):
//   - 16 columnas × 12 filas, celda de 50px → canvas 800×600.
//   - Filas 0–1 son "cielo": siempre transitables, nunca se cavan.
//   - Filas 2–11 nacen como tierra sólida; `preCarved` abre los túneles y
//     cámaras iniciales de cada nivel.
//
// Regla de diseño de cada layout: los pasillos pre-cavados conectan SIEMPRE las
// posiciones iniciales de los Pooka con la celda de inicio del excavador. Si no
// fuera así, los monstruos quedarían encerrados en su cámara (solo se mueven por
// túneles ya abiertos) y el nivel sería trivial.

export const COLS = 16;
export const ROWS = 12;
export const CELL = 50;
export const SKY_ROWS = 2; // filas 0..1 = cielo; la tierra empieza en la fila 2

export interface GridPos {
  col: number; // 0..COLS-1
  row: number; // 0..ROWS-1
}

export interface LevelLayout {
  startCell: GridPos; // dónde nace (y respawnea) el excavador
  preCarved: GridPos[]; // túnel de salida + cámaras de monstruos ya abiertas
  rocks: GridPos[]; // rocas iniciales (ocupan una celda de tierra sin cavar)
  enemies: GridPos[]; // posiciones iniciales de los Pooka
}

// ── Helpers de trazado ──────────────────────────────────────────────────────
// Los layouts se describen como tramos de túnel, no como listas de celdas
// sueltas: es lo que se quiere leer al ajustar un nivel en el playtest.

/** Tramo horizontal en `row`, de `fromCol` a `toCol` (ambos inclusive). */
function hRun(row: number, fromCol: number, toCol: number): GridPos[] {
  const cells: GridPos[] = [];
  for (let col = fromCol; col <= toCol; col++) cells.push({ col, row });
  return cells;
}

/** Tramo vertical en `col`, de `fromRow` a `toRow` (ambos inclusive). */
function vRun(col: number, fromRow: number, toRow: number): GridPos[] {
  const cells: GridPos[] = [];
  for (let row = fromRow; row <= toRow; row++) cells.push({ col, row });
  return cells;
}

/** Une tramos y descarta celdas repetidas en los cruces. */
function carve(...runs: GridPos[][]): GridPos[] {
  const seen = new Set<string>();
  const cells: GridPos[] = [];
  for (const run of runs) {
    for (const cell of run) {
      const key = `${cell.col},${cell.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

// ── Los 3 niveles ───────────────────────────────────────────────────────────

// Nivel 1 — 4 Pooka, 2 rocas. Trazado simétrico y poco profundo: un pozo de
// entrada al centro, una galería horizontal y dos cámaras gemelas en la fila 7.
// Las rocas cuelgan sobre la fila 7, así que el excavador que cave por debajo
// para llegar a las cámaras se arriesga a que le caigan encima.
const LEVEL_1: LevelLayout = {
  startCell: { col: 8, row: 3 },
  preCarved: carve(
    vRun(8, 2, 4), // pozo de entrada desde el cielo
    hRun(5, 4, 12), // galería principal
    vRun(4, 6, 7), // bajada a la cámara izquierda
    hRun(7, 2, 4), // cámara izquierda
    vRun(12, 6, 7), // bajada a la cámara derecha
    hRun(7, 12, 14), // cámara derecha
  ),
  rocks: [
    { col: 6, row: 6 },
    { col: 10, row: 6 },
  ],
  enemies: [
    { col: 2, row: 7 },
    { col: 3, row: 7 },
    { col: 13, row: 7 },
    { col: 14, row: 7 },
  ],
};

// Nivel 2 — 5 Pooka, 3 rocas. Entrada desplazada a la izquierda y trazado
// asimétrico en zigzag: el excavador nace lejos de la cámara grande y tiene que
// recorrer toda la galería (o abrir su propio atajo) para llegar a los Pooka.
const LEVEL_2: LevelLayout = {
  startCell: { col: 2, row: 3 },
  preCarved: carve(
    vRun(2, 2, 4), // pozo de entrada
    hRun(4, 2, 8), // galería superior
    vRun(8, 5, 7), // bajada central
    hRun(7, 8, 13), // galería inferior hacia la derecha
    vRun(13, 8, 9), // bajada a la cámara derecha
    hRun(9, 11, 13), // cámara derecha (3 Pooka)
    vRun(4, 5, 8), // bajada izquierda
    hRun(8, 2, 4), // bolsillo izquierdo (2 Pooka)
  ),
  rocks: [
    { col: 6, row: 6 },
    { col: 10, row: 5 },
    { col: 6, row: 9 },
  ],
  enemies: [
    { col: 2, row: 8 },
    { col: 3, row: 8 },
    { col: 11, row: 9 },
    { col: 12, row: 9 },
    { col: 13, row: 9 },
  ],
};

// Nivel 3 — 6 Pooka, 3 rocas. Cámaras en la fila 10, casi al fondo de la
// grilla: los Pooka tardan más en subir, pero llegan en tromba por dos pozos
// laterales. Las tres rocas cuelgan en el centro, sobre la ruta más corta.
const LEVEL_3: LevelLayout = {
  startCell: { col: 8, row: 3 },
  preCarved: carve(
    vRun(8, 2, 5), // pozo de entrada, más largo
    hRun(5, 5, 11), // galería central
    vRun(5, 6, 10), // pozo lateral izquierdo
    hRun(10, 2, 5), // cámara profunda izquierda
    vRun(11, 6, 10), // pozo lateral derecho
    hRun(10, 11, 14), // cámara profunda derecha
  ),
  rocks: [
    { col: 7, row: 7 },
    { col: 9, row: 7 },
    { col: 8, row: 9 },
  ],
  enemies: [
    { col: 2, row: 10 },
    { col: 3, row: 10 },
    { col: 4, row: 10 },
    { col: 12, row: 10 },
    { col: 13, row: 10 },
    { col: 14, row: 10 },
  ],
};

export const LEVELS: LevelLayout[] = [LEVEL_1, LEVEL_2, LEVEL_3];
