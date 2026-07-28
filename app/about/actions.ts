"use server";

import { Resend } from "resend";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";

export type ContactInput = {
  name: string;
  email: string;
  msg: string;
};

export type ContactResult = { ok: true } | { ok: false; error: string };

// Sandbox de Resend: solo entrega al correo de la cuenta; salir del sandbox
// (dominio verificado) tiene su propio spec futuro.
const TO = "tito.parra4@hotmail.com";
const FROM = "Arcade Retro <onboarding@resend.dev>";

const GENERIC_ERROR = "NO SE PUDO TRANSMITIR EL MENSAJE. INTENTA DE NUEVO.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendContactEmail(
  input: ContactInput,
): Promise<ContactResult> {
  if (!(await checkRateLimit("contact"))) {
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  const name = input.name?.trim();
  const email = input.email?.trim();
  const msg = input.msg?.trim();

  // La validación del cliente es solo UX: la action es invocable desde fuera del formulario.
  if (!name || !email || !msg || !EMAIL_RE.test(email)) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendContactEmail: falta RESEND_API_KEY (ver .env.template)");
    return { ok: false, error: GENERIC_ERROR };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `[Arcade Retro] Mensaje de ${name}`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\n${msg}`,
    });
    if (error) {
      console.error("sendContactEmail: Resend respondió con error:", error);
      return { ok: false, error: GENERIC_ERROR };
    }
    return { ok: true };
  } catch (err) {
    console.error("sendContactEmail: fallo inesperado:", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
