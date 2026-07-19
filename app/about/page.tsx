import type { Metadata } from "next";
import { AboutContent } from "../components/about-content";

export const metadata: Metadata = {
  title: "Acerca de — Arcade Retro",
};

export default function AboutPage() {
  return <AboutContent />;
}
