"use client";

/**
 * Cabeça do bloco recolhível: título, resumo numa linha ("2 embalagens: Saco 25 kg, Caixa 12 un"
 * ou "Nenhuma"), um alerta quando falta algo e o botão Mostrar/Esconder (aria-expanded).
 */
import { Botao, Icone, Selo } from "@erp/interface";
import { T } from "./textos";

export function ResumoRecolhido({
  titulo,
  resumo,
  alerta,
  aberto,
  idConteudo,
  aoAlternar,
}: {
  titulo: string;
  resumo: string;
  alerta?: string | null;
  aberto: boolean;
  idConteudo: string;
  aoAlternar: () => void;
}) {
  return (
    <div className="emb-resumo">
      <div className="emb-resumo__texto">
        <h3 className="emb-resumo__titulo">
          <Icone nome="caixa" />
          {titulo}
        </h3>
        <p className="emb-resumo__linha" data-testid="resumo-das-embalagens">
          {resumo}
        </p>
        {alerta && (
          <span>
            <Selo variante="alerta" icone="alerta">
              {alerta}
            </Selo>
          </span>
        )}
      </div>
      <Botao variante="secundario" className="emb-resumo__botao" aria-expanded={aberto} aria-controls={idConteudo} onClick={aoAlternar}>
        <span className="emb-seta" aria-hidden="true" />
        {aberto ? T.ingrediente.esconder : T.ingrediente.mostrar}
        <span className="ajuda__so-leitor"> {titulo}</span>
      </Botao>
    </div>
  );
}
