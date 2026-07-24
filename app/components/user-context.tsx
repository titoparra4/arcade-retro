"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SkinId } from "./games/registry";

// Clave "av_user" en localStorage — usuario simulado, null si no hay sesión
export interface User {
  name: string; // máx. 10 caracteres, mayúsculas
}

const SKIN_KEY = "av_skin"; // preferencia GLOBAL de skin (un solo control para todos los juegos)
const DEFAULT_SKIN: SkinId = "clasico";
const VALID_SKINS: SkinId[] = ["clasico", "neon", "retro"];

interface UserContextValue {
  user: User | null;
  login: (u: User) => void;
  signOut: () => void;
  // Skin es una preferencia global (no ligada al usuario): persiste aunque no
  // haya sesión y se comparte entre todos los juegos que adoptan el sistema.
  skin: SkinId;
  setSkin: (s: SkinId) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  // Inicia en null y lee localStorage tras montar: el servidor no conoce
  // localStorage y así el render inicial es consistente (sin desajuste de hidratación).
  const [user, setUser] = useState<User | null>(null);
  // Mismo patrón hydrate-after-mount que `user`: arranca en el default y lee
  // localStorage tras montar para no desajustar la hidratación servidor/cliente.
  const [skin, setSkinState] = useState<SkinId>(DEFAULT_SKIN);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación post-montaje intencional
      setUser(JSON.parse(localStorage.getItem("av_user") || "null"));
    } catch {
      setUser(null);
    }
    try {
      const stored = localStorage.getItem(SKIN_KEY) as SkinId | null;
      if (stored && VALID_SKINS.includes(stored)) {
        setSkinState(stored);
      }
    } catch {}
  }, []);

  const login = (u: User) => {
    setUser(u);
    try {
      localStorage.setItem("av_user", JSON.stringify(u));
    } catch {}
  };

  const signOut = () => {
    setUser(null);
    try {
      localStorage.removeItem("av_user");
    } catch {}
  };

  const setSkin = (s: SkinId) => {
    setSkinState(s);
    try {
      localStorage.setItem(SKIN_KEY, s);
    } catch {}
  };

  return (
    <UserContext.Provider value={{ user, login, signOut, skin, setSkin }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser debe usarse dentro de <UserProvider>");
  return ctx;
}
