import type { ColumnType, Generated } from "kysely";

// Tipos escritos à mão a partir das migrações em ../migracoes. Mantenha em sincronia.
type Instante = ColumnType<Date, Date | string | undefined, Date | string>;

export interface EmpresaTabela {
  id: Generated<number>;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string | null; // CNPJ sempre texto
  criado_em: Instante;
}

export interface UnidadeTabela {
  id: Generated<number>;
  empresa_id: number;
  nome: string;
  fuso_horario: Generated<string>;
  fim_turno: Generated<string>; // "HH:MM:SS", hora local da unidade
  margem_troca_turno: Generated<string>; // intervalo, ex. "00:30:00"
  criado_em: Instante;
}

export interface SetorTabela {
  id: Generated<number>;
  unidade_id: number;
  nome: string;
  criado_em: Instante;
}

export interface PerfilTabela {
  codigo: string;
  nome: string;
}

export interface UsuarioTabela {
  id: Generated<number>;
  nome: string;
  login: string;
  senha_hash: string | null;
  ativo: Generated<boolean>;
  criado_em: Instante;
  desligado_em: Instante | null;
  senha_erros: Generated<number>;
  senha_bloqueada_ate: Instante | null;
  codigo_hash: string | null;
  codigo_erros: Generated<number>;
  codigo_bloqueado_em: Instante | null;
  totp_segredo: string | null; // cifrado
  totp_pendente: string | null; // cifrado, enquanto a pessoa configura
  totp_ultimo_passo: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  totp_erros: Generated<number>;
  totp_bloqueado_ate: Instante | null;
}

export interface UsuarioPerfilTabela {
  id: Generated<number>;
  usuario_id: number;
  perfil_codigo: string;
  unidade_id: number;
  criado_em: Instante;
  criado_por: number | null;
  removido_em: Instante | null;
  removido_por: number | null;
}

export interface SessaoTabela {
  id: string; // hash do token; o token em si nunca é gravado
  usuario_id: number;
  criada_em: Instante;
  expira_em: Instante;
  revogada_em: Instante | null;
  ip: string | null;
  agente: string | null;
  cargo_ativo: string | null;
  segundo_fator_ok: Generated<boolean>;
  turno_ate: Instante | null; // "Continuo no turno": vale até o fim deste turno
}

export interface EstacaoTabela {
  id: Generated<number>;
  unidade_id: number;
  nome: string;
  tipo: Generated<"cozinha">;
  token_hash: string;
  criada_em: Instante;
  criada_por: number;
  revogada_em: Instante | null;
  revogada_por: number | null;
}

export interface EstacaoPresencaTabela {
  id: Generated<string>;
  estacao_id: number;
  usuario_id: number;
  cargo: string;
  entrou_em: Instante;
  expira_em: Instante;
  ativa_desde: Instante | null;
  saiu_em: Instante | null;
  motivo_saida: "saiu" | "outra_estacao" | "desligado" | "estacao_revogada" | "expirou" | null;
  prorrogacoes: Generated<number>;
}

export interface AvisoTabela {
  id: Generated<string>;
  criado_em: Instante;
  unidade_id: number;
  para_cargos: string[];
  tipo: string;
  texto: string;
  dados: ColumnType<Record<string, unknown>, string | undefined, never>;
  prioridade: Generated<"urgente" | "normal" | "informativo">;
  natureza: Generated<"operacional" | "comunicado">;
  autor_id: number | null;
  para_usuario_id: number | null;
  expira_em: Instante | null;
}

export interface AvisoDestinoTabela {
  aviso_id: string;
  usuario_id: number;
  cargo: string;
  entregue_em: Instante;
  visto_em: Instante | null;
  resolvido_em: Instante | null;
}

export interface TurnoTabela {
  id: Generated<number>;
  unidade_id: number;
  nome: string;
  inicio: string; // "HH:MM:SS", hora local da unidade
  fim: string; // "24:00:00" = meia-noite
}

export interface AuditoriaTabela {
  id: Generated<string>;
  ocorrido_em: Instante;
  usuario_id: number | null;
  acao: string;
  resultado: "permitido" | "recusado" | "falhou";
  alvo_tipo: string | null;
  alvo_id: string | null;
  detalhes: ColumnType<Record<string, unknown>, string | undefined, never>;
  ip: string | null;
}

// Decimal exato (numeric): o driver devolve texto; nunca vira float no caminho.
type Decimal = ColumnType<string, string, string>;

export interface UnidadeMedidaTabela {
  codigo: string;
  nome: string;
  grandeza: "massa" | "volume" | "contagem";
  fator: Decimal;
  apelidos: string[];
}

export interface FornecedorTabela {
  id: Generated<number>;
  nome: string;
  documento: string | null; // CPF ou CNPJ, só dígitos, texto
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazo_entrega_dias: number | null;
  observacao: string | null;
  endereco: string | null;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface IngredienteTabela {
  id: Generated<number>;
  nome: string;
  unidade_base: "g" | "ml" | "un";
  /** Como a pessoa vê e informa as quantidades (migração 0008); o gatilho põe a base se faltar. */
  unidade_exibicao: ColumnType<"g" | "kg" | "ml" | "l" | "un" | "dz", "g" | "kg" | "ml" | "l" | "un" | "dz" | undefined, "g" | "kg" | "ml" | "l" | "un" | "dz">;
  area_estoque: "cozinha" | "bebidas_salao" | "cafeteria" | "sorvete";
  fornecedor_id: number | null;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface IngredienteConversaoTabela {
  id: Generated<number>;
  ingrediente_id: number;
  /** De que modelo do catálogo veio (migração 0009); nulo se foi digitada. */
  modelo_id: ColumnType<number | null, number | null | undefined, number | null>;
  nome: string;
  quantidade_base: Decimal;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface EmbalagemModeloTabela {
  id: Generated<number>;
  tipo: string;
  tamanho: Decimal | null;
  unidade: string | null;
  fornecedor_id: number | null;
  /** Gerado pelo banco (nome_do_modelo). */
  nome: ColumnType<string, never, never>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface BancoTabelas {
  empresa: EmpresaTabela;
  unidade: UnidadeTabela;
  setor: SetorTabela;
  perfil: PerfilTabela;
  usuario: UsuarioTabela;
  usuario_perfil: UsuarioPerfilTabela;
  sessao: SessaoTabela;
  auditoria: AuditoriaTabela;
  estacao: EstacaoTabela;
  estacao_presenca: EstacaoPresencaTabela;
  aviso: AvisoTabela;
  aviso_destino: AvisoDestinoTabela;
  turno: TurnoTabela;
  unidade_medida: UnidadeMedidaTabela;
  fornecedor: FornecedorTabela;
  ingrediente: IngredienteTabela;
  ingrediente_conversao: IngredienteConversaoTabela;
  embalagem_modelo: EmbalagemModeloTabela;
}
