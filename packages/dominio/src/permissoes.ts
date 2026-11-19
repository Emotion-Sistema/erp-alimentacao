/**
 * Matriz de cargos e ações (RC-12, decisão 0011). A permissão é SEMPRE conferida no
 * servidor, em cada ação, pelo cargo ATIVO da pessoa.
 * Regra de ouro: o que não está listado para o cargo é recusado.
 *
 * Para mudar: siga a skill `matriz-de-permissoes` (muda aqui, no teste da matriz e na
 * tabela da decisão 0011, tudo no mesmo PR).
 */
export const CARGOS = [
  "dono",
  "administrador",
  "gerente_geral",
  "financeiro",
  "supervisor",
  "atendente",
  "caixa",
  "cozinheira",
  "auxiliar_cozinha",
  "motoboy",
  "contador",
] as const;
export type Cargo = (typeof CARGOS)[number];

export const NOME_DO_CARGO: Readonly<Record<Cargo, string>> = {
  dono: "Dono",
  administrador: "Administrador",
  gerente_geral: "Gerente geral",
  financeiro: "Financeiro",
  supervisor: "Supervisor",
  atendente: "Atendente",
  caixa: "Caixa",
  cozinheira: "Cozinheira",
  auxiliar_cozinha: "Auxiliar de cozinha",
  motoboy: "Motoboy próprio",
  contador: "Contador externo",
};

/**
 * Catálogo de ações. Muitas ainda não têm tela: entram aqui já agora para a matriz ser
 * decidida e testada uma vez; cada etapa futura só liga a rota com `exigir(acao)`.
 */
export const ACOES = [
  // Pessoas e acesso
  "usuarios.ver",
  "usuarios.gerenciar", // criar, dar ou tirar cargo, definir código, desligar
  "codigos.desbloquear",
  "estacoes.gerenciar", // cadastrar e revogar tablets da cozinha
  "estacoes.ver", // tela Geral: quem está em cada estação
  "auditoria.ver",
  "configuracao.gerenciar",
  // Horários (só gerente geral, dono e administrador, 14/11/2026): turnos e margem de troca
  "horarios.gerenciar",
  // Comunicação (RC-18): recados da gerência com confirmação de leitura
  "comunicados.enviar",
  // Cadastros (E07, decisão 0015): ingredientes, unidades, conversões, fornecedores, produtos
  "cadastros.ver",
  "cadastros.gerenciar",
  // Clube E-MOTION (RC-21, decisão 0024): regras do desconto, pontos, prêmios, presentes e campanhas
  "clube.ver",
  "clube.gerenciar",
  // Pedido e atendimento
  "pedidos.lancar",
  "pedidos.ver_proprios",
  "pedidos.ver_todos",
  "pedidos.alterar",
  "pedidos.cancelar",
  "pedidos.marcar_entregue",
  // Produção (telas da cozinha)
  "producao.ver",
  "producao.operar", // fila, iniciar, pronto
  "producao.sensivel", // perda, ajuste, "acabou" (pede o código de novo na estação)
  // Estoque por área (decisão 0008, item 2)
  "estoque.cozinha",
  "estoque.salao", // bebidas do salão, cafeteria e potes de sorvete
  "compras.gerenciar", // compras do estoque (ingredientes, bebidas): gerente geral
  "compras.materiais", // material físico, utensílios, eletrodomésticos (fora do estoque de comida)
  "custos.ver", // custos da área: compras, custo dos itens, perdas, custo do prato
  // Caixa
  "caixa.operar", // a própria sessão e a movimentação do dia
  "pagamento.marcar_pago",
  "caixa.autorizar", // autorizações do caixa e do atendimento
  "motoboys.organizar",
  // Entregas
  "entregas.proprias",
  // Financeiro (nunca para caixa nem gerente geral)
  "financeiro.ver",
  "financeiro.gerenciar",
  "faturamento.ver",
  "caixa.fechamentos_ver",
  "contabil.ver",
] as const;
export type Acao = (typeof ACOES)[number];

/** Dinheiro da empresa. Caixa e gerente geral NUNCA recebem nenhuma destas. */
export const ACOES_FINANCEIRAS: readonly Acao[] = [
  "financeiro.ver",
  "financeiro.gerenciar",
  "faturamento.ver",
  "caixa.fechamentos_ver",
  "contabil.ver",
];

/**
 * Ações exclusivas de quem faz o trabalho. Nem o dono as tem pelo próprio cargo: quem
 * quiser marcar Pago precisa ter o cargo de caixa ATIVO. Assim cada registro diz quem
 * de fato recebeu, produziu ou entregou.
 */
export const ACOES_EXCLUSIVAS: Readonly<Partial<Record<Acao, readonly Cargo[]>>> = {
  "pagamento.marcar_pago": ["caixa"], // só o caixa marca Pago (regra inegociável)
  "caixa.operar": ["caixa"],
  "producao.operar": ["cozinheira", "auxiliar_cozinha"], // supervisor não opera a produção
  "producao.sensivel": ["cozinheira"],
  "pedidos.marcar_entregue": ["atendente", "motoboy"],
  "entregas.proprias": ["motoboy"],
};

const ehExclusiva = (a: Acao) => a in ACOES_EXCLUSIVAS;
const TUDO: readonly Acao[] = ACOES.filter((a) => !ehExclusiva(a));
const sem = (lista: readonly Acao[], ...tirar: (readonly Acao[] | Acao)[]) => {
  const fora = new Set(tirar.flat());
  return lista.filter((a) => !fora.has(a));
};

export const PERMISSOES: Readonly<Record<Cargo, readonly Acao[]>> = {
  dono: TUDO,
  administrador: TUDO,
  // Tudo, exceto financeiro (RC-12, decisão 0008) e configuração do sistema.
  gerente_geral: sem(TUDO, ACOES_FINANCEIRAS, "configuracao.gerenciar"),
  financeiro: ["financeiro.ver", "financeiro.gerenciar", "faturamento.ver", "caixa.fechamentos_ver", "contabil.ver", "custos.ver", "compras.materiais", "cadastros.ver"],
  supervisor: [
    "usuarios.ver",
    "codigos.desbloquear",
    "estacoes.ver",
    "cadastros.ver",
    "pedidos.lancar",
    "pedidos.ver_todos",
    "pedidos.alterar",
    "pedidos.cancelar",
    "producao.ver", // cozinha só para ver
    "estoque.salao",
    "caixa.autorizar",
  ],
  // Atendente altera pedido; os supervisores são avisados e o gerente vê numa aba própria (14/11/2026).
  atendente: ["pedidos.lancar", "pedidos.ver_proprios", "pedidos.alterar", "pedidos.marcar_entregue"],
  caixa: ["caixa.operar", "pagamento.marcar_pago", "motoboys.organizar", "pedidos.ver_todos"],
  cozinheira: ["producao.ver", "producao.operar", "producao.sensivel", "estoque.cozinha", "cadastros.ver"],
  auxiliar_cozinha: ["producao.ver", "producao.operar"],
  motoboy: ["entregas.proprias", "pedidos.marcar_entregue"],
  contador: ["contabil.ver"],
};

/**
 * Quem pode dar cada cargo (criar alguém com ele, acrescentar, tirar ou desligar quem o
 * tem). Lista explícita, decidida na E03 (decisão 0011), no lugar da comparação de ações.
 */
export const QUEM_ATRIBUI: Readonly<Record<Cargo, readonly Cargo[]>> = {
  dono: CARGOS,
  administrador: CARGOS.filter((c) => c !== "dono"),
  gerente_geral: ["supervisor", "atendente", "caixa", "cozinheira", "auxiliar_cozinha", "motoboy"],
  financeiro: [],
  supervisor: [],
  atendente: [],
  caixa: [],
  cozinheira: [],
  auxiliar_cozinha: [],
  motoboy: [],
  contador: [],
};

/** Cargos que exigem segundo fator (código do aplicativo autenticador) ao entrar. */
export const CARGOS_COM_SEGUNDO_FATOR: readonly Cargo[] = ["dono", "administrador"];

/** Cargos que entram na estação da cozinha com o código pessoal. */
export const CARGOS_DA_ESTACAO: readonly Cargo[] = ["cozinheira", "auxiliar_cozinha"];

export function ehCargo(v: string): v is Cargo {
  return (CARGOS as readonly string[]).includes(v);
}

/** Verdadeiro se o cargo ativo permite a ação. Cargo desconhecido ou ausente não dá nada. */
export function pode(cargoAtivo: string | null | undefined, acao: Acao): boolean {
  return !!cargoAtivo && ehCargo(cargoAtivo) && PERMISSOES[cargoAtivo].includes(acao);
}

/** Verdadeiro se quem está no cargo ativo `quem` pode dar ou tirar TODOS os cargos-alvo. */
export function podeAtribuir(quem: string | null | undefined, cargosAlvo: readonly string[]): boolean {
  if (!quem || !ehCargo(quem)) return false;
  return cargosAlvo.every((c) => ehCargo(c) && QUEM_ATRIBUI[quem].includes(c));
}

export function exigeSegundoFator(cargos: readonly string[]): boolean {
  return cargos.some((c) => (CARGOS_COM_SEGUNDO_FATOR as readonly string[]).includes(c));
}
