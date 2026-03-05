/**
 * AppBackground
 *
 * Aplica um background aleatório (selecionado uma vez por sessão) em toda a
 * aplicação. O background é fixo (não rola com o conteúdo), cobre toda a
 * área visível sem distorção (object-fit: cover) e inclui um overlay
 * semitransparente para garantir legibilidade do conteúdo sobreposto.
 *
 * Uso: envolver o <Router /> em App.tsx.
 */

import { getBackgroundUrl } from "@/hooks/useBackground";
import { useEffect, useRef } from "react";

interface AppBackgroundProps {
  children: React.ReactNode;
}

export function AppBackground({ children }: AppBackgroundProps) {
  const bgUrl = useRef(getBackgroundUrl()).current;

  // Pré-carrega a imagem para evitar flash
  useEffect(() => {
    const img = new Image();
    img.src = bgUrl;
  }, [bgUrl]);

  return (
    <div className="relative min-h-screen w-full">
      {/* Camada de background — fixed para não rolar com o conteúdo */}
      <div
        aria-hidden="true"
        style={{
          backgroundImage: `url("${bgUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
        className="fixed inset-0 -z-10"
      />
      {/* Overlay escuro para legibilidade — ajuste a opacidade conforme necessário */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-black/70"
      />
      {/* Conteúdo da aplicação */}
      {children}
    </div>
  );
}
