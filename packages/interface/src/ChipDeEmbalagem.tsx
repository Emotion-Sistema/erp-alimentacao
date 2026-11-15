import { Icone } from "./Icone";
import { Selo } from "./Selo";
import { quantidadeComUnidade } from "./numero";

/**
 * Embalagem em forma de pílula: o nome ("Saco 25 kg") e, ao lado, a equivalência em destaque
 * menor ("= 25.000 g"). Embalagem inativa fica riscada e leva o selo "inativa".
 * `quantidade` é o decimal em texto (ponto ou vírgula); sem ele, o chip avisa que falta.
 */
export function ChipDeEmbalagem({
  nome,
  quantidade,
  unidade,
  inativa,
}: {
  nome: string;
  quantidade?: string | null;
  unidade: string;
  inativa?: boolean;
}) {
  const equivalencia = quantidade ? quantidadeComUnidade(quantidade, unidade) : null;
  return (
    <li className={["erp-chip", inativa && "erp-chip--inativa"].filter(Boolean).join(" ")}>
      <span className="erp-chip__nome">{nome.trim() || "Sem nome"}</span>{" "}
      {equivalencia ? (
        <span className="erp-chip__equivalencia">= {equivalencia}</span>
      ) : (
        <span className="erp-chip__falta">
          <Icone nome="alerta" />
          falta a quantidade
        </span>
      )}
      {inativa && <Selo>inativa</Selo>}
    </li>
  );
}
