import type { Metadata } from "next";
import {
  Press_Start_2P,
  JetBrains_Mono,
  Courier_Prime,
} from "next/font/google";
import { getSessionUser } from "@/lib/supabase/profiles";
import { Nav } from "./components/nav";
import { UserProvider } from "./components/user-context";
import "./globals.css";

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arcade Retro · Portal Retro",
  description:
    "Plataforma para jugar juegos retro en línea y competir por la puntuación más alta.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolver la sesión aquí es lo que evita el parpadeo de "sin sesión" en la
  // nav: el primer HTML ya sale con el jugador correcto.
  const sessionUser = await getSessionUser();
  const initialUser = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.playerName,
      }
    : null;

  return (
    <html
      lang="es"
      className={`${pressStart.variable} ${jetbrainsMono.variable} ${courierPrime.variable}`}
    >
      <body>
        <div className="av-bg" />
        <div className="av-noise" />
        <div id="root">
          <UserProvider initialUser={initialUser}>
            <Nav />
            <main className="av-main">{children}</main>
            <footer
              style={{
                borderTop: "1px solid var(--line)",
                padding: "20px 32px",
                textAlign: "center",
                color: "var(--ink-faint)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
              }}
            >
              © 2026 ARCADE RETRO · HECHO CON PIXELES Y NEÓN · v2.6.0
            </footer>
          </UserProvider>
        </div>
      </body>
    </html>
  );
}
