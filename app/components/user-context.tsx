"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Clave "av_user" en localStorage — usuario simulado, null si no hay sesión
export interface User {
  name: string; // máx. 10 caracteres, mayúsculas
}

interface UserContextValue {
  user: User | null;
  login: (u: User) => void;
  signOut: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  // Inicia en null y lee localStorage tras montar: el servidor no conoce
  // localStorage y así el render inicial es consistente (sin desajuste de hidratación).
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      setUser(JSON.parse(localStorage.getItem("av_user") || "null"));
    } catch {
      setUser(null);
    }
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

  return (
    <UserContext.Provider value={{ user, login, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser debe usarse dentro de <UserProvider>");
  return ctx;
}
