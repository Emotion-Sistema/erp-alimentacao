"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Celula, Etiqueta, Selo, Tabela } from "@erp/interface";
import { BotaoExemplos, Campo, Selecao } from "../Campo";
import { chamar } from "../chamar";

type Usuario = {
  id: number;
  nome: string;
  login: string;
  ativo: boolean;
  cargos: string[];
  codigoDefinido: boolean;
  codigoBloqueado: boolean;
  segundoFatorConfigurado: boolean;
};
type Opcao = { valor: string; texto: string };
type Mensagem = { tipo: "sucesso" | "perigo"; texto: string } | null;

type Props = {
  cargos: Opcao[];
  cargosComSegundoFator: string[];
  verSegundoFator: boolean;
  podeGerenciar: boolean;
  podeDesbloquear: boolean;
};

export function Funcionarios(props: Props) {
  const { cargos, podeGerenciar, verSegundoFator } = props;
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const nomeDoCargo = (c: string) => cargos.find((x) => x.valor === c)?.texto ?? c;

  const carregar = useCallback(async () => {
    const r = await chamar<Usuario[]>("/api/usuarios");
    if (r.ok && r.dados) setLista(r.dados);
    else setMensagem({ tipo: "perigo", texto: r.mensagem });
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Faz uma ação, mostra o resultado (ou a recusa do servidor) e recarrega a lista. */
  async function agir(url: string, metodo: string, corpo: unknown, sucesso: string): Promise<boolean> {
    setMensagem(null);
    const r = await chamar(url, metodo, corpo);
    setMensagem(r.ok ? { tipo: "sucesso", texto: sucesso } : { tipo: "perigo", texto: r.mensagem });
    if (r.ok) await carregar();
    return r.ok;
  }

  return (
    <>
      <h1>Funcionários</h1>
      <BotaoExemplos />
      <div aria-live="polite">{mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}</div>
      {podeGerenciar && <NovoFuncionario cargos={cargos} agir={agir} />}
      {!lista ? (
        <p>Carregando...</p>
      ) : (
        <Tabela aria-label="Funcionários">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>Cargos</th>
              <th>Situação</th>
              <th>Código</th>
              {verSegundoFator && <th>Segundo fator</th>}
              {(podeGerenciar || props.podeDesbloquear) && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} data-testid={`linha-${u.login}`}>
                <Celula rotulo="Nome">{u.nome}</Celula>
                <Celula rotulo="Usuário">{u.login}</Celula>
                <Celula rotulo="Cargos">
                  {u.cargos.length === 0 ? (
                    <span className="erp-vazio">Nenhum cargo</span>
                  ) : (
                    <span className="erp-chips">
                      {u.cargos.map((c) => (
                        <Fragment key={c}>
                          <Selo variante="info">{nomeDoCargo(c)}</Selo>{" "}
                        </Fragment>
                      ))}
                    </span>
                  )}
                </Celula>
                <Celula rotulo="Situação">
                  <Etiqueta tipo={u.ativo ? "sucesso" : "neutro"}>{u.ativo ? "Ativo" : "Desligado"}</Etiqueta>
                </Celula>
                <Celula rotulo="Código">
                  {u.codigoBloqueado ? (
                    <Etiqueta tipo="perigo">Bloqueado</Etiqueta>
                  ) : u.codigoDefinido ? (
                    <Etiqueta tipo="sucesso">Definido</Etiqueta>
                  ) : (
                    <Etiqueta>Não definido</Etiqueta>
                  )}
                </Celula>
                {verSegundoFator && (
                  <Celula rotulo="Segundo fator">
                    {u.cargos.some((c) => props.cargosComSegundoFator.includes(c)) ? (
                      u.segundoFatorConfigurado ? (
                        <Etiqueta tipo="sucesso">Configurado</Etiqueta>
                      ) : (
                        <Etiqueta tipo="atencao">Não configurado</Etiqueta>
                      )
                    ) : (
                      "Não se aplica"
                    )}
                  </Celula>
                )}
                {(podeGerenciar || props.podeDesbloquear) && (
                  <Celula rotulo="Ações">
                    {u.ativo && <Acoes usuario={u} nomeDoCargo={nomeDoCargo} agir={agir} {...props} />}
                  </Celula>
                )}
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </>
  );
}

type Agir = (url: string, metodo: string, corpo: unknown, sucesso: string) => Promise<boolean>;

function NovoFuncionario({ cargos, agir }: { cargos: Opcao[]; agir: Agir }) {
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setEnviando(true);
    const ok = await agir(
      "/api/usuarios",
      "POST",
      { nome: d.get("nome"), login: d.get("login"), senha: d.get("senha"), cargo: d.get("cargo") },
      "Funcionário criado.",
    );
    setEnviando(false);
    if (ok) form.reset();
  }
  return (
    <Cartao>
      <h2>Novo funcionário</h2>
      <form onSubmit={enviar} noValidate>
        <Campo
          rotulo="Nome"
          explicacao="Nome da pessoa como vai aparecer nas telas e nos registros."
          exemplo="Maria Silva (nome inventado)."
          name="nome"
          autoComplete="off"
          required
        />
        <Campo
          rotulo="Usuário (para entrar)"
          explicacao="O nome que a pessoa digita para entrar. Sem espaços e sem letra maiúscula. Cada pessoa tem o seu."
          exemplo="maria.silva"
          name="login"
          autoComplete="off"
          autoCapitalize="none"
          required
        />
        <Campo
          rotulo="Senha inicial"
          explicacao="Senha para o primeiro acesso. Entregue em mãos, sem escrever em mensagem."
          exemplo="Use letras e números misturados, com pelo menos 10 caracteres, como cafe-Quente-482."
          name="senha"
          type="password"
          autoComplete="new-password"
          required
        />
        <Selecao
          rotulo="Cargo"
          explicacao="O cargo define o que a pessoa pode ver e fazer no sistema."
          exemplo="Atendente para quem serve as mesas. Caixa para quem recebe os pagamentos."
          name="cargo"
          defaultValue="atendente"
          opcoes={cargos}
        />
        <Botao type="submit" disabled={enviando}>
          Criar funcionário
        </Botao>
      </form>
    </Cartao>
  );
}

function Acoes({
  usuario: u,
  cargos,
  nomeDoCargo,
  agir,
  podeGerenciar,
  podeDesbloquear,
}: Props & { usuario: Usuario; nomeDoCargo: (c: string) => string; agir: Agir }) {
  const [cargoNovo, setCargoNovo] = useState("atendente");
  const [codigo, setCodigo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const rota = `/api/usuarios/${u.id}`;

  return (
    <details className="acoes">
      <summary>Gerenciar {u.nome}</summary>
      <div className="acoes__corpo">
        {podeGerenciar && (
          <>
            <div>
              <strong>Cargos</strong>
              <ul className="lista-simples">
                {u.cargos.map((c) => (
                  <li key={c} className="acoes__linha">
                    <span>{nomeDoCargo(c)}</span>
                    <Botao
                      variante="secundario"
                      aria-label={`Tirar o cargo ${nomeDoCargo(c)} de ${u.nome}`}
                      onClick={() => void agir(`${rota}/cargos`, "DELETE", { cargo: c }, "Cargo retirado.")}
                    >
                      Tirar
                    </Botao>
                  </li>
                ))}
              </ul>
              <Selecao
                rotulo={`Dar cargo a ${u.nome}`}
                explicacao="Escolha um cargo a mais para esta pessoa e toque em Dar cargo. Ela pode ter vários."
                exemplo="Quem já é atendente e também ajuda no caixa recebe o cargo Caixa."
                value={cargoNovo}
                opcoes={cargos}
                onChange={(e) => setCargoNovo(e.target.value)}
              />
              <Botao variante="secundario" onClick={() => void agir(`${rota}/cargos`, "POST", { cargo: cargoNovo }, "Cargo dado.")}>
                Dar cargo
              </Botao>
            </div>
            <div>
              <Campo
                rotulo={`Código de 4 números de ${u.nome}`}
                explicacao="O código que a pessoa usa no tablet da cozinha. Só números, sem repetir nem sequência."
                exemplo="4827 (não use 1111 nem 1234)."
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
              <Botao
                variante="secundario"
                onClick={async () => {
                  if (await agir(`${rota}/codigo`, "POST", { codigo }, "Código definido.")) setCodigo("");
                }}
              >
                Definir código
              </Botao>
            </div>
            <Botao
              variante="secundario"
              onClick={() => void agir(`${rota}/reiniciar-segundo-fator`, "POST", undefined, "Segundo fator reiniciado: a pessoa configura de novo no próximo acesso.")}
            >
              Reiniciar segundo fator
            </Botao>
          </>
        )}
        {podeDesbloquear && u.codigoBloqueado && (
          <Botao variante="secundario" onClick={() => void agir(`${rota}/desbloquear-codigo`, "POST", undefined, "Código desbloqueado.")}>
            Desbloquear código
          </Botao>
        )}
        {podeGerenciar &&
          (confirmando ? (
            <Aviso tipo="atencao">
              <p>Desligar corta o acesso na hora. Confirmar?</p>
              <Botao variante="perigo" onClick={() => void agir(`${rota}/desligar`, "POST", undefined, `${u.nome} foi desligado(a).`)}>
                Sim, desligar {u.nome}
              </Botao>{" "}
              <Botao variante="secundario" onClick={() => setConfirmando(false)}>
                Cancelar
              </Botao>
            </Aviso>
          ) : (
            <Botao variante="perigo" onClick={() => setConfirmando(true)}>
              Desligar
            </Botao>
          ))}
      </div>
    </details>
  );
}
