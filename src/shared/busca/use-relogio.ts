"use client";

import { useSyncExternalStore } from "react";

// A hora certa só existe no navegador: no servidor (e na hidratação) o relógio vale null e a
// tela mostra um espaço reservado. Assim os dias e horários nunca saem com a data do build.
// O valor muda uma vez por minuto, o bastante para tirar da lista um horário que acabou de passar.
function assinar(avisar: () => void): () => void {
  const intervalo = window.setInterval(avisar, 30_000);
  return () => window.clearInterval(intervalo);
}

const minutoAtual = () => Math.floor(Date.now() / 60_000);
const semRelogio = () => null;

export function useRelogio(): Date | null {
  const minuto = useSyncExternalStore(assinar, minutoAtual, semRelogio);
  return minuto === null ? null : new Date(minuto * 60_000);
}
