"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { SkinId } from "./games/registry";

// Usuario de la sesión de Supabase. La sesión vive en cookies, no en
// localStorage: el servidor la conoce y por eso no hay parpadeo al cargar.
export interface User {
  id: string;
  email: string;
  name: string; // player_name del perfil
}

const LEGACY_USER_KEY = "av_user"; // usuario simulado del sistema anterior
const SKIN_KEY = "av_skin"; // preferencia GLOBAL de skin (un solo control para todos los juegos)
const DEFAULT_SKIN: SkinId = "clasico";
const VALID_SKINS: SkinId[] = ["clasico", "neon", "retro"];

interface UserContextValue {
  user: User | null; // null = sin sesión
  loading: boolean; // true hasta resolver la sesión en cliente
  signOut: () => Promise<void>;
  // Skin es una preferencia global (no ligada a la cuenta): persiste aunque no
  // haya sesión y se comparte entre todos los juegos que adoptan el sistema.
  skin: SkinId;
  setSkin: (s: SkinId) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

/** Identidad por valor: el layout crea un objeto nuevo en cada render. */
function keyOf(user: User | null): string {
  return user ? `${user.id}:${user.name}` : "";
}

export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // Arranca con lo que resolvió el layout en el servidor: el primer render ya
  // sabe si hay sesión.
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(true);

  // El servidor manda: cuando el layout se vuelve a renderizar con otra sesión
  // (tras login, logout o router.refresh()), el contexto la adopta. Ajuste de
  // estado durante el render, que es el patrón de React para derivar de props.
  const [serverKey, setServerKey] = useState(() => keyOf(initialUser));
  if (keyOf(initialUser) !== serverKey) {
    setServerKey(keyOf(initialUser));
    setUser(initialUser);
  }

  // Mismo patrón hydrate-after-mount de antes: la skin sí sigue en localStorage.
  const [skin, setSkinState] = useState<SkinId>(DEFAULT_SKIN);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_USER_KEY);
    } catch {}
    try {
      const stored = localStorage.getItem(SKIN_KEY) as SkinId | null;
      if (stored && VALID_SKINS.includes(stored)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación post-montaje intencional
        setSkinState(stored);
      }
    } catch {}
  }, []);

  const lastUserId = useRef<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(false);

      const sessionUser = session?.user ?? null;
      const nextId = sessionUser?.id ?? null;

      setUser((current) =>
        sessionUser
          ? {
              id: sessionUser.id,
              email: sessionUser.email ?? "",
              // El player_name definitivo lo trae el layout; el de la metadata
              // sirve mientras llega el refresh.
              name:
                current?.id === sessionUser.id
                  ? current.name
                  : (sessionUser.user_metadata?.player_name ?? ""),
            }
          : null,
      );

      // Revalidar el árbol de servidor solo cuando de verdad cambia quién eres:
      // los refrescos periódicos de token no deben provocar recargas.
      if (nextId !== lastUserId.current) {
        lastUserId.current = nextId;
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    lastUserId.current = null;
    router.refresh();
  };

  const setSkin = (s: SkinId) => {
    setSkinState(s);
    try {
      localStorage.setItem(SKIN_KEY, s);
    } catch {}
  };

  return (
    <UserContext.Provider value={{ user, loading, signOut, skin, setSkin }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser debe usarse dentro de <UserProvider>");
  return ctx;
}
