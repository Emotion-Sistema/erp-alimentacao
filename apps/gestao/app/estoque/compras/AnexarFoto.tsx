"use client";

/** Anexar a foto da nota a uma entrada. O servidor refaz a foto (WebP) e não duplica a mesma. */
import { useState } from "react";
import { Aviso } from "@erp/interface";
import { chamar } from "../../chamar";
import { Campo } from "../../Campo";
import { lerComoBase64 } from "../comum";
import { TE } from "../textos";

const MAXIMO = 8 * 1024 * 1024;

export function AnexarFoto({ movimentoId, aoAnexar }: { movimentoId: string; aoAnexar?: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "sucesso" | "perigo"; texto: string } | null>(null);
  const [versao, setVersao] = useState(0);

  async function enviar(lista: FileList | null) {
    const f = lista?.[0];
    if (!f) return;
    setAviso(null);
    if (f.size > MAXIMO) return setAviso({ tipo: "perigo", texto: "Foto grande demais: o máximo é 8 MB." });
    setOcupado(true);
    let arquivo: string;
    try {
      arquivo = await lerComoBase64(f);
    } catch {
      setOcupado(false);
      return setAviso({ tipo: "perigo", texto: TE.saldo.semLeitura });
    }
    const r = await chamar<{ repetida: boolean }>("/api/estoque/entradas/foto", "POST", { movimentoId, arquivo });
    setOcupado(false);
    setVersao((v) => v + 1);
    if (!r.ok || !r.dados) return setAviso({ tipo: "perigo", texto: r.mensagem });
    setAviso({ tipo: "sucesso", texto: r.dados.repetida ? TE.entrada.fotoRepetida : TE.entrada.fotoEnviada });
    aoAnexar?.();
  }

  return (
    <div className="est-foto" data-testid={`anexar-foto-${movimentoId}`}>
      <Campo
        key={versao}
        type="file"
        accept="image/*"
        rotulo={TE.entrada.foto}
        explicacao={TE.entrada.fotoAjuda}
        exemplo={TE.entrada.fotoExemplo}
        disabled={ocupado}
        onChange={(e) => void enviar(e.target.files)}
      />
      {ocupado && <p aria-live="polite">{TE.form.gravando}</p>}
      {aviso && (
        <Aviso tipo={aviso.tipo} data-testid="aviso-da-foto">
          {aviso.texto}
        </Aviso>
      )}
    </div>
  );
}
