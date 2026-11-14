"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso } from "@erp/interface";
import { chamar } from "../chamar";
import { ConfirmarCodigoDoAplicativo } from "../CampoCodigo6";

export function ConfigurarSegundoFator({ jaConfigurado }: { jaConfigurado: boolean }) {
  const [dados, setDados] = useState<{ segredo: string; qrSvg: string } | null>(null);
  const [erro, setErro] = useState("");
  const iniciou = useRef(false);

  useEffect(() => {
    if (jaConfigurado || iniciou.current) return;
    iniciou.current = true; // evita gerar dois segredos
    void chamar<{ segredo: string; qrSvg: string }>("/api/segundo-fator", "POST").then((r) => {
      if (r.ok && r.dados) setDados(r.dados);
      else setErro(r.mensagem);
    });
  }, [jaConfigurado]);

  const irParaInicio = () => window.location.assign("/");

  if (jaConfigurado) {
    return (
      <>
        <p>Digite o código que aparece no aplicativo autenticador do seu celular.</p>
        <ConfirmarCodigoDoAplicativo aoConfirmar={irParaInicio} />
      </>
    );
  }

  return (
    <>
      <p>Seu cargo precisa de uma segunda proteção. Faça uma vez só:</p>
      <ol className="passos">
        <li>Instale um aplicativo autenticador no celular (por exemplo, Google Authenticator ou Microsoft Authenticator).</li>
        <li>Abra o aplicativo e leia o desenho (QR) abaixo. Se não conseguir ler, digite o código escrito abaixo dele.</li>
        <li>Digite aqui os 6 números que o aplicativo mostrar.</li>
      </ol>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!dados && !erro && <p>Preparando...</p>}
      {dados && (
        <>
          {/* O SVG é gerado pelo nosso servidor (biblioteca qrcode), não vem de usuário. */}
          <div className="qr" aria-label="QR do aplicativo autenticador" dangerouslySetInnerHTML={{ __html: dados.qrSvg }} />
          <p>
            Código para digitar à mão: <code data-testid="segredo-2fa" className="segredo">{dados.segredo}</code>
          </p>
          <ConfirmarCodigoDoAplicativo aoConfirmar={irParaInicio} />
        </>
      )}
    </>
  );
}
