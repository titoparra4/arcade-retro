import { headers } from "next/headers";

export interface RateLimitRule {
  limit: number; // intentos permitidos en la ventana
  windowMs: number; // tamaño de la ventana
}

/** Una regla por acción pública. Los nombres son las claves del limitador. */
export const RATE_LIMITS = {
  signUp: { limit: 5, windowMs: 60 * 60 * 1000 },
  signIn: { limit: 10, windowMs: 15 * 60 * 1000 },
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000 },
  contact: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Mensaje único; no revela cuánto falta para poder reintentar. */
export const RATE_LIMIT_ERROR = "DEMASIADOS INTENTOS. ESPERA UNOS MINUTOS.";

/**
 * Clave "<acción>:<ip>" → marcas de tiempo de los intentos aún dentro de la
 * ventana. Vive en la memoria del proceso: reiniciar el servidor lo vacía y no
 * se comparte entre instancias. Decisión explícita del SPEC 15.
 */
const hits = new Map<string, number[]>();

/** A partir de aquí se barre el mapa entero buscando claves ya muertas. */
const MAX_KEYS = 10_000;

/** Todos los clientes sin IP comparten cubo: es lo conservador. */
const UNKNOWN_IP = "desconocida";

/**
 * IP del cliente según las cabeceras del proxy.
 *
 * Ojo: `x-forwarded-for` la puede falsificar quien llame si no hay un proxy de
 * confianza delante que la reescriba. Este limitador frena el abuso casual, no
 * a alguien decidido a rotar el valor de la cabecera.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return headerList.get("x-real-ip")?.trim() || UNKNOWN_IP;
}

/**
 * Borra las claves que ya no tienen ninguna marca viva. Sin esto, quien rote
 * direcciones IP hace crecer el mapa hasta agotar la memoria: el limitador
 * sería su propio vector de denegación de servicio.
 */
function pruneStaleKeys(now: number): void {
  for (const [key, marks] of hits) {
    const action = key.slice(0, key.indexOf(":")) as RateLimitAction;
    const rule = RATE_LIMITS[action];

    if (!rule || marks.every((mark) => now - mark >= rule.windowMs)) {
      hits.delete(key);
    }
  }
}

/**
 * Registra un intento y dice si se permite. `true` = adelante.
 * Resuelve la IP internamente con headers(); la acción no le pasa nada del
 * formulario.
 *
 * Ventana deslizante, no cubo fijo: en cada llamada se descartan las marcas más
 * viejas que `windowMs` y se cuenta lo que queda. Con cubos fijos alguien puede
 * gastar el doble de intentos a caballo entre dos ventanas.
 *
 * Se cuenta el intento, no el fallo: un inicio de sesión correcto también
 * consume cupo. Contar solo los fallos deja abierta la enumeración de
 * contraseñas correctas.
 */
export async function checkRateLimit(
  action: RateLimitAction,
): Promise<boolean> {
  const rule = RATE_LIMITS[action];
  const now = Date.now();
  const key = `${action}:${await clientIp()}`;

  if (hits.size > MAX_KEYS) pruneStaleKeys(now);

  const fresh = (hits.get(key) ?? []).filter(
    (mark) => now - mark < rule.windowMs,
  );

  if (fresh.length >= rule.limit) {
    // Se guarda la lista ya podada, pero no se añade esta marca: el intento
    // rechazado no alarga el bloqueo, o quien insista no saldría nunca.
    hits.set(key, fresh);
    return false;
  }

  fresh.push(now);
  hits.set(key, fresh);
  return true;
}
