"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Etiqueta } from "@erp/interface";
import { BotaoExemplos, Campo, Marcador } from "../../Campo";
import { chamar } from "../../chamar";
import { cnpjValido, digitarComMascara, mascararDocumento, mascararTelefone, soDigitos } from "../auxiliares";

type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazoEntregaDias: number | null;
  observacao: string | null;
  endereco: string | null;
  ativo: boolean;
};
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

export function Fornecedores({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [lista, setLista] = useState<Fornecedor[] | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  /** "novo" = criação; número = id em edição. */
  const [editando, setEditando] = useState<"novo" | number | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Fornecedor[]>("/api/cadastros/fornecedores");
    if (r.ok && r.dados) setLista(r.dados);
    else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const emEdicao = typeof editando === "number" ? lista?.find((f) => f.id === editando) : undefined;

  return (
    <>
      <h1>Fornecedores</h1>
      <BotaoExemplos />
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && editando === null && (
        <p>
          <Botao
            onClick={() => {
              setMensagem(null);
              setEditando("novo");
            }}
          >
            Novo fornecedor
          </Botao>
        </p>
      )}
      {podeGerenciar && editando !== null && (editando === "novo" || emEdicao) && (
        <FormularioFornecedor
          key={editando === "novo" ? "novo" : emEdicao!.id}
          fornecedor={emEdicao}
          aoSalvar={async (texto) => {
            await carregar();
            setMensagem({ tipo: "sucesso", texto });
            setEditando(null);
          }}
          aoFechar={() => setEditando(null)}
        />
      )}
      {!lista ? (
        !mensagem && <p>Carregando...</p>
      ) : lista.length === 0 ? (
        <p>Nenhum fornecedor cadastrado.</p>
      ) : (
        <ul className="lista-simples" data-testid="lista-fornecedores" aria-label="Fornecedores">
          {lista.map((f) => (
            <li key={f.id} data-testid={`fornecedor-${f.nome}`}>
              <Cartao>
                <h2>
                  {f.nome} {!f.ativo && <Etiqueta>inativo</Etiqueta>}
                </h2>
                <p>
                  {[f.contato, f.telefone, f.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
                  {f.prazoEntregaDias !== null && ` · Entrega em ${f.prazoEntregaDias} ${f.prazoEntregaDias === 1 ? "dia" : "dias"}`}
                </p>
                {f.documento && <p>CPF/CNPJ: {mascararDocumento(f.documento)}</p>}
                {f.endereco && <p>Endereço: {f.endereco}</p>}
                {f.observacao && <p className="cadastros__dica">{f.observacao}</p>}
                {podeGerenciar && (
                  <p>
                    <Botao
                      variante="secundario"
                      aria-label={`Editar ${f.nome}`}
                      onClick={() => {
                        setMensagem(null);
                        setEditando(f.id);
                      }}
                    >
                      Editar
                    </Botao>
                  </p>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type DadosDoCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  ativa: boolean;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
};

function FormularioFornecedor({
  fornecedor,
  aoSalvar,
  aoFechar,
}: {
  fornecedor?: Fornecedor;
  aoSalvar: (texto: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [documento, setDocumento] = useState(mascararDocumento(fornecedor?.documento ?? ""));
  const [contato, setContato] = useState(fornecedor?.contato ?? "");
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const [endereco, setEndereco] = useState(fornecedor?.endereco ?? "");
  const [prazo, setPrazo] = useState(fornecedor?.prazoEntregaDias !== null && fornecedor ? String(fornecedor.prazoEntregaDias) : "");
  const [observacao, setObservacao] = useState(fornecedor?.observacao ?? "");
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Consulta do CNPJ: o que veio, se está buscando e a falha (a pessoa segue à mão).
  const [consulta, setConsulta] = useState<DadosDoCnpj | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroCnpj, setErroCnpj] = useState("");
  const [conflitos, setConflitos] = useState<string[] | null>(null);

  const digitosDoDocumento = soDigitos(documento);
  const podeBuscarCnpj = digitosDoDocumento.length === 14 && cnpjValido(digitosDoDocumento);

  async function buscarCnpj() {
    setErroCnpj("");
    setConsulta(null);
    setConflitos(null);
    setBuscando(true);
    const consultado = digitosDoDocumento;
    const r = await chamar<DadosDoCnpj>(`/api/cadastros/cnpj/${consultado}`);
    setBuscando(false);
    if (!r.ok || !r.dados) return setErroCnpj(r.mensagem);
    setConsulta(r.dados);
  }

  /** O que a consulta traria para cada campo (só o que veio preenchido). */
  function trazido(d: DadosDoCnpj) {
    return {
      nome: d.nomeFantasia ?? d.razaoSocial,
      telefone: d.telefone ? mascararTelefone(d.telefone) : null,
      email: d.email,
      endereco: d.endereco,
    };
  }

  function usarDados(d: DadosDoCnpj, sobrescrever: boolean) {
    const novo = trazido(d);
    const atual = { nome, telefone, email, endereco };
    const aplicar = (campo: keyof typeof atual, valor: string | null, definir: (v: string) => void) => {
      if (valor && (sobrescrever || !atual[campo].trim())) definir(valor);
    };
    aplicar("nome", novo.nome, setNome);
    aplicar("telefone", novo.telefone, setTelefone);
    aplicar("email", novo.email, setEmail);
    aplicar("endereco", novo.endereco, setEndereco);
    setConflitos(null);
    setConsulta(null);
  }

  function pedirParaUsar(d: DadosDoCnpj) {
    const novo = trazido(d);
    const atual = { nome, telefone, email, endereco };
    const rotulos = { nome: "Nome", telefone: "Telefone", email: "E-mail", endereco: "Endereço" } as const;
    const diferentes = (Object.keys(atual) as (keyof typeof atual)[]).filter((c) => atual[c].trim() && novo[c] && atual[c].trim() !== novo[c]);
    if (diferentes.length === 0) return usarDados(d, false);
    setConflitos(diferentes.map((c) => rotulos[c]));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (prazo.trim() !== "" && !/^\d+$/.test(prazo.trim())) return setErro("O prazo de entrega é um número de dias (0 a 90).");
    setEnviando(true);
    const r = await chamar("/api/cadastros/fornecedores", "POST", {
      id: fornecedor?.id,
      nome,
      // O servidor limpa o documento; mandamos só os números.
      documento: digitosDoDocumento || null,
      contato,
      telefone,
      email,
      endereco,
      prazoEntregaDias: prazo.trim() === "" ? null : Number(prazo),
      observacao,
      ativo,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    await aoSalvar(fornecedor ? "Fornecedor salvo." : "Fornecedor criado.");
  }

  return (
    <Cartao>
      <h2>{fornecedor ? `Editar ${fornecedor.nome}` : "Novo fornecedor"}</h2>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      <form onSubmit={enviar} noValidate>
        <div className="cadastros__form-linha">
          <Campo
            rotulo="Nome"
            explicacao="Nome da empresa ou da pessoa que vende para a casa."
            exemplo="Distribuidora Boa Safra."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            required
          />
          <div>
            <Campo
              rotulo="CPF ou CNPJ"
              explicacao="Opcional. Digite só os números: os pontos e o traço aparecem sozinhos. Com 14 números de CNPJ, dá para buscar os dados da empresa."
              exemplo="CNPJ 11.222.333/0001-81 ou CPF 123.456.789-09 (números inventados)."
              value={documento}
              onChange={(e) => setDocumento((antes) => digitarComMascara(e.target.value, antes, mascararDocumento))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
            />
            {podeBuscarCnpj && (
              <Botao variante="secundario" disabled={buscando} onClick={() => void buscarCnpj()}>
                {buscando ? "Buscando..." : "Buscar dados do CNPJ"}
              </Botao>
            )}
          </div>
          <Campo
            rotulo="Contato (pessoa)"
            explicacao="Opcional. Com quem falar na hora de pedir ou reclamar."
            exemplo="Carlos, do atendimento."
            value={contato} onChange={(e) => setContato(e.target.value)} autoComplete="off" />
          <Campo
            rotulo="Telefone"
            explicacao="Opcional. Telefone ou WhatsApp com o DDD. Os parênteses e o traço aparecem sozinhos."
            exemplo="(11) 91234-5678 (número inventado)."
            value={telefone}
            onChange={(e) => setTelefone((antes) => digitarComMascara(e.target.value, antes, mascararTelefone))}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={15}
          />
          <Campo
            rotulo="E-mail"
            explicacao="Opcional. Endereço de e-mail para enviar pedidos."
            exemplo="vendas@boasafra.exemplo.com"
            value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
          <Campo
            rotulo="Prazo de entrega (dias)"
            explicacao="Opcional. Quantos dias, em média, entre o pedido e a chegada. De 0 a 90."
            exemplo="2 = entrega em 2 dias. 0 = entrega no mesmo dia."
            value={prazo} onChange={(e) => setPrazo(e.target.value)} inputMode="numeric" autoComplete="off" />
        </div>
        {(consulta || erroCnpj) && (
          <div aria-live="polite" data-testid="resultado-cnpj">
            {erroCnpj && <Aviso tipo="atencao">{erroCnpj} Você pode seguir preenchendo à mão.</Aviso>}
            {consulta && (
              <Cartao>
                <h3>Dados encontrados para o CNPJ</h3>
                {!consulta.ativa && (
                  <Aviso tipo="perigo">
                    Atenção: a situação deste CNPJ na Receita é <strong>{consulta.situacao ?? "desconhecida"}</strong> (não está ATIVA). Confira antes de comprar desta empresa.
                  </Aviso>
                )}
                <dl className="cnpj__dados">
                  <dt>Razão social</dt>
                  <dd>{consulta.razaoSocial}</dd>
                  <dt>Nome fantasia</dt>
                  <dd>{consulta.nomeFantasia ?? "não informado"}</dd>
                  <dt>Situação</dt>
                  <dd>{consulta.situacao ?? "não informada"}</dd>
                  <dt>Endereço</dt>
                  <dd>{consulta.endereco ?? "não informado"}</dd>
                  <dt>Telefone</dt>
                  <dd>{consulta.telefone ? mascararTelefone(consulta.telefone) : "não informado"}</dd>
                  <dt>E-mail</dt>
                  <dd>{consulta.email ?? "não informado"}</dd>
                </dl>
                {conflitos ? (
                  <Aviso tipo="atencao">
                    <p>
                      Você já digitou: <strong>{conflitos.join(", ")}</strong>. Quer trocar pelo que veio da Receita?
                    </p>
                    <div className="cadastros__botoes">
                      <Botao onClick={() => usarDados(consulta, true)}>Trocar pelo da Receita</Botao>
                      <Botao variante="secundario" onClick={() => usarDados(consulta, false)}>
                        Manter o que digitei
                      </Botao>
                    </div>
                  </Aviso>
                ) : (
                  <div className="cadastros__botoes">
                    <Botao onClick={() => pedirParaUsar(consulta)}>Usar estes dados</Botao>
                    <Botao variante="secundario" onClick={() => setConsulta(null)}>
                      Descartar
                    </Botao>
                  </div>
                )}
              </Cartao>
            )}
          </div>
        )}
        <Campo
          rotulo="Endereço"
          explicacao="Opcional. Onde fica o fornecedor (rua, número, bairro, cidade). Se você buscou o CNPJ, vem preenchido."
          exemplo="Rua das Flores, 120 - Centro - Campinas/SP (endereço inventado)."
          value={endereco} onChange={(e) => setEndereco(e.target.value)} autoComplete="off" maxLength={300} />
        <Campo
          rotulo="Observação"
          explicacao="Opcional. Qualquer lembrete sobre este fornecedor."
          exemplo="Só entrega de segunda a sexta, antes das 10h."
          value={observacao} onChange={(e) => setObservacao(e.target.value)} autoComplete="off" />
        {fornecedor && (
          <Marcador
            rotulo="Ativo (desmarque para tirar de uso; nada é apagado)"
            explicacao="Marcado, o fornecedor aparece para escolha. Desmarcado, deixa de aparecer, mas o histórico fica guardado."
            exemplo="Desmarque um fornecedor com quem a casa parou de comprar."
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
        )}
        <div className="cadastros__botoes">
          <Botao type="submit" disabled={enviando}>
            {fornecedor ? "Salvar fornecedor" : "Criar fornecedor"}
          </Botao>
          <Botao variante="secundario" onClick={aoFechar}>
            {fornecedor ? "Fechar" : "Cancelar"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
