"use client";

/**
 * Seção "Foto" da janela do produto (decisão 0022). Mostra a foto atual (quadro 4:3) ou "Sem foto".
 * Quem gerencia (`cadastros.gerenciar`) escolhe uma foto (galeria ou câmera do celular) e tira a
 * foto. Antes de enviar, a tela reduz a foto (`reduzirFoto.ts`); quem confere e refaz é o servidor.
 * - Produto que já existe: a foto vai para o servidor na hora em que é escolhida.
 * - Produto novo: a foto fica em prévia e vai quando a janela pede (`pedidoDeEnvio` muda, logo
 *   depois de o produto ser criado). Se falhar, a prévia fica, com o erro e "Tentar de novo".
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Aviso, Botao } from "@erp/interface";
import { chamar } from "../../chamar";
import { Grupo } from "../../Campo";
import { ErroDaFoto, reduzirFoto, type FotoReduzida } from "./reduzirFoto";
import { TP } from "./textos";

/** Tipos que o seletor oferece. HEIC/HEIF: o Safari do iPhone abre e a tela converte para JPEG. */
const ACEITA = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export const enderecoDaFoto = (id: number) => `/api/cadastros/produtos/foto/${id}`;

type Pendente = FotoReduzida & { url: string };
type Ocupado = "" | "preparando" | "enviando" | "tirando";

export function FotoDoProduto({
  nomeDoProduto,
  produtoId,
  fotoId: fotoInicial,
  podeGerenciar,
  pedidoDeEnvio,
  aoMudarPendente,
  aoGravada,
}: {
  nomeDoProduto: string;
  /** Nulo enquanto o produto não foi criado. */
  produtoId: number | null;
  /** A foto ativa no servidor (nulo = sem foto). */
  fotoId: number | null;
  podeGerenciar: boolean;
  /** Muda quando a janela quer que a prévia vá para o servidor (logo depois de criar o produto). */
  pedidoDeEnvio: number;
  /** Avisa se há prévia esperando para ir junto com o produto novo. */
  aoMudarPendente: (tem: boolean) => void;
  /** O servidor gravou a foto (id) ou tirou (nulo). */
  aoGravada: (fotoId: number | null) => void;
}) {
  const [fotoId, setFotoId] = useState(fotoInicial);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>("");
  const [erro, setErro] = useState("");
  const [podeTentarDeNovo, setPodeTentarDeNovo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const ultimoPedido = useRef(pedidoDeEnvio);

  // A prévia é um endereço local do navegador: libera quando troca ou a janela fecha.
  useEffect(() => () => {
    if (pendente) URL.revokeObjectURL(pendente.url);
  }, [pendente]);

  function mudarPendente(p: Pendente | null) {
    setPendente(p);
    aoMudarPendente(!!p);
  }

  async function enviar(id: number, foto: Pendente, manterSeFalhar: boolean) {
    setOcupado("enviando");
    setErro("");
    setPodeTentarDeNovo(false);
    const r = await chamar<{ id: number }>("/api/cadastros/produtos/foto", "POST", { produtoId: id, arquivo: foto.base64 });
    setOcupado("");
    if (!r.ok || !r.dados) {
      setErro(r.mensagem);
      if (manterSeFalhar) setPodeTentarDeNovo(true);
      else mudarPendente(null);
      return;
    }
    mudarPendente(null);
    setFotoId(r.dados.id);
    aoGravada(r.dados.id);
  }

  // Produto novo acabou de ser criado: manda a prévia.
  useEffect(() => {
    if (pedidoDeEnvio === ultimoPedido.current) return;
    ultimoPedido.current = pedidoDeEnvio;
    if (pendente && produtoId !== null) void enviar(produtoId, pendente, true);
    // Só reage ao pedido; a prévia e o id são lidos no momento.
  }, [pedidoDeEnvio]);

  async function escolhido(e: ChangeEvent<HTMLInputElement>) {
    // A janela não conta a foto como "algo digitado": quem decide isso é aoMudarPendente.
    e.stopPropagation();
    const f = e.target.files?.[0];
    e.target.value = ""; // escolher o mesmo arquivo de novo também dispara
    if (!f) return;
    setErro("");
    setPodeTentarDeNovo(false);
    setConfirmando(false);
    setOcupado("preparando");
    let reduzida: FotoReduzida;
    try {
      reduzida = await reduzirFoto(f);
    } catch (x) {
      setOcupado("");
      return setErro(x instanceof ErroDaFoto ? x.message : TP.foto.naoAbriu);
    }
    setOcupado("");
    const nova: Pendente = { ...reduzida, url: URL.createObjectURL(reduzida.blob) };
    mudarPendente(nova);
    if (produtoId !== null) await enviar(produtoId, nova, false);
  }

  async function tirar() {
    setConfirmando(false);
    if (produtoId === null || fotoId === null) return;
    setOcupado("tirando");
    setErro("");
    const r = await chamar<{ removida: boolean }>("/api/cadastros/produtos/foto/tirar", "POST", { produtoId });
    setOcupado("");
    if (!r.ok) return setErro(r.mensagem);
    setFotoId(null);
    aoGravada(null);
  }

  function pedirParaTirar() {
    setErro("");
    // Prévia que ainda não foi para o servidor: só some (nada foi gravado).
    if (pendente) {
      setPodeTentarDeNovo(false);
      return mudarPendente(null);
    }
    setConfirmando(true);
  }

  const imagem = pendente?.url ?? (fotoId !== null ? enderecoDaFoto(fotoId) : null);
  const status = ocupado === "preparando" ? TP.foto.preparando : ocupado === "enviando" ? TP.foto.enviando : ocupado === "tirando" ? TP.foto.tirando : "";
  const nome = nomeDoProduto.trim() || TP.janela.novo;

  const quadro = (
    <div className={["prod-foto__quadro", !imagem && "prod-foto__quadro--vazio"].filter(Boolean).join(" ")} data-testid="quadro-da-foto" aria-busy={!!ocupado}>
      {imagem ? <img src={imagem} alt={TP.foto.alt(nome)} className="prod-foto__imagem" data-testid="foto-do-produto" /> : <span className="prod-foto__vazio">{TP.foto.semFoto}</span>}
      {status && <span className="prod-foto__status">{status}</span>}
    </div>
  );

  if (!podeGerenciar)
    return (
      <section className="prod-foto" aria-label={TP.foto.legenda}>
        <h3 className="prod-foto__titulo">{TP.foto.legenda}</h3>
        {quadro}
      </section>
    );

  return (
    <Grupo legenda={TP.foto.legenda} explicacao={TP.foto.ajuda} exemplo={TP.foto.exemplo} className="prod-foto" ajudaNoTopo>
      {quadro}
      <div aria-live="polite" className="prod-foto__avisos">
        {pendente && produtoId === null && !erro && <p className="prod-foto__nota">{TP.foto.previa}</p>}
        {erro && (
          <Aviso tipo="perigo">
            {podeTentarDeNovo ? `${TP.foto.criadoSemFoto} ${erro}` : erro}
          </Aviso>
        )}
      </div>
      {confirmando ? (
        <div className="hor-confirmar" role="alertdialog" aria-label={TP.foto.confirmarTirar}>
          <p>{TP.foto.confirmarTirar}</p>
          <div className="cadastros__botoes">
            <Botao variante="perigo" onClick={() => void tirar()}>
              {TP.foto.simTirar}
            </Botao>
            <Botao variante="secundario" onClick={() => setConfirmando(false)}>
              {TP.foto.nao}
            </Botao>
          </div>
        </div>
      ) : (
        <div className="prod-foto__botoes">
          {podeTentarDeNovo && pendente && produtoId !== null && (
            <Botao disabled={!!ocupado} onClick={() => void enviar(produtoId, pendente, true)}>
              {TP.foto.tentarDeNovo}
            </Botao>
          )}
          <Botao variante="secundario" disabled={!!ocupado} onClick={() => arquivo.current?.click()}>
            {TP.foto.escolher}
          </Botao>
          {(pendente || fotoId !== null) && (
            <Botao variante="secundario" disabled={!!ocupado} onClick={pedirParaTirar}>
              {TP.foto.tirar}
            </Botao>
          )}
        </div>
      )}
      {/* Sem `capture`: no celular a pessoa escolhe entre a galeria e a câmera. */}
      <input
        ref={arquivo}
        type="file"
        accept={ACEITA}
        hidden
        aria-label={TP.foto.arquivo}
        data-testid="arquivo-da-foto"
        onChange={(e) => void escolhido(e)}
        onInput={(e) => e.stopPropagation()}
      />
    </Grupo>
  );
}
