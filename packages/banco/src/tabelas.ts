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
  /** Custo de referência (migração 0019): centavos por `custo_ref_quantidade` na unidade base. */
  custo_ref_centavos: ColumnType<number | null, number | null | undefined, number | null>;
  custo_ref_quantidade: ColumnType<string | null, string | null | undefined, string | null>;
  custo_ref_em: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  /** Alergênicos conferidos (migração 0020): nulo = ainda não conferido. Os dois juntos. */
  alergenicos_conferidos_em: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  alergenicos_conferidos_por: ColumnType<number | null, number | null | undefined, number | null>;
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

type Hora = string; // "HH:MM:SS" (time do PostgreSQL, hora local da unidade)
type Canal = "loja" | "delivery";

export interface CategoriaTabela {
  id: Generated<number>;
  nome: string;
  descricao: string | null;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface ProdutoTabela {
  id: Generated<number>;
  nome: string;
  descricao: string | null;
  categoria_id: number;
  tipo_producao_id: number | null;
  preco_centavos: number;
  tempo_preparo_min: number | null;
  /** Nulo: igual ao preço da loja (migração 0015). */
  preco_delivery_centavos: Generated<number | null>;
  /** Combo montado por partes (migração 0017). */
  combo: Generated<boolean>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

/** Parte de um combo (migração 0017): o cliente escolhe uma opção em cada parte. */
export interface ComboParteTabela {
  id: Generated<number>;
  combo_id: number;
  nome: string;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface ComboOpcaoTabela {
  id: Generated<number>;
  parte_id: number;
  produto_id: number;
  tamanho_id: number | null;
  acrescimo_centavos: Generated<number>;
  acrescimo_delivery_centavos: Generated<number | null>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

/** Tamanho do produto (migração 0015): acréscimo sobre o preço do produto. */
export interface ProdutoTamanhoTabela {
  id: Generated<number>;
  produto_id: number;
  nome: string;
  acrescimo_centavos: Generated<number>;
  acrescimo_delivery_centavos: Generated<number | null>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

/** Grupo de adicionais reutilizável (migração 0015). */
export interface GrupoAdicionalTabela {
  id: Generated<number>;
  nome: string;
  minimo: Generated<number>;
  maximo: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface AdicionalTabela {
  id: Generated<number>;
  grupo_id: number;
  nome: string;
  preco_centavos: Generated<number>;
  preco_delivery_centavos: Generated<number | null>;
  maximo_por_item: Generated<number>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface ProdutoGrupoAdicionalTabela {
  produto_id: number;
  grupo_id: number;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface TipoProducaoTabela {
  id: Generated<number>;
  nome: string;
  area: "cozinha" | "cafeteria";
  capacidade: Generated<number>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface HorarioUnidadeTabela {
  unidade_id: number;
  dia: number;
  aberta: boolean;
  abre: Hora | null;
  ultimo_pedido: Hora | null;
  fecha: Hora | null;
  atualizado_em: Instante;
}

export interface HorarioUnidadeDataTabela {
  id: Generated<number>;
  unidade_id: number;
  data: ColumnType<string, string, string>;
  aberta: boolean;
  abre: Hora | null;
  ultimo_pedido: Hora | null;
  fecha: Hora | null;
  motivo: string;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface HorarioVendaTabela {
  id: Generated<number>;
  unidade_id: number;
  canal: Canal;
  categoria_id: number | null;
  dia: number;
  modo: "segue" | "fechado" | "aberto";
  inicio: Hora | null;
  fim: Hora | null;
  atualizado_em: Instante;
}

export interface HorarioVendaDataTabela {
  id: Generated<number>;
  unidade_id: number;
  canal: Canal;
  categoria_id: number | null;
  data: ColumnType<string, string, string>;
  modo: "fechado" | "aberto";
  inicio: Hora | null;
  fim: Hora | null;
  motivo: string;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface PausaVendaTabela {
  id: Generated<number>;
  unidade_id: number;
  canal: Canal | null;
  categoria_id: number | null;
  inicio: Instante;
  ate: Date | null;
  motivo: string;
  criada_por: number;
  encerrada_em: Date | null;
  encerrada_por: number | null;
}

/** Importação de planilha gravada (migração 0014, decisão 0020). Só inserção. */
export interface ImportacaoPlanilhaTabela {
  id: Generated<number>;
  chave: string;
  assinatura: string;
  tipo: "ingredientes" | "produtos";
  arquivo: string;
  formato: "xlsx" | "csv" | "html";
  linhas_lidas: number;
  criados: number;
  ja_existiam: number;
  puladas: number;
  ids: ColumnType<number[], number[] | undefined, never>;
  usuario_id: number;
  criado_em: ColumnType<Date, never, never>;
}

/** Foto do produto (migração 0016): WebP refeito pelo servidor; uma ativa por produto. */
export interface ProdutoFotoTabela {
  id: Generated<number>;
  produto_id: number;
  tipo: Generated<"image/webp">;
  conteudo: Buffer;
  largura: number;
  altura: number;
  sha256: string;
  ativa: Generated<boolean>;
  enviada_por: number;
  criado_em: Instante;
  atualizado_em: Instante;
}

/** Clube E-MOTION (migração 0018): só as regras que a equipe configura; nada de cliente. */
export interface ClubeRegrasTabela {
  id: Generated<number>;
  ligado: Generated<boolean>;
  desconto_pb: Generated<number>;
  todas_as_categorias: Generated<boolean>;
  teto_desconto_centavos: number | null;
  pontos_por_real: Generated<number>;
  campanhas_por_semana: Generated<number>;
  atualizado_em: Instante;
  atualizado_por: number | null;
}

export interface ClubeCategoriaTabela {
  categoria_id: number;
  ativo: Generated<boolean>;
  atualizado_em: Instante;
}

export interface ClubeHorarioDescontoTabela {
  dia: number;
  modo: "todo_horario" | "sem_desconto" | "janela";
  inicio: Hora | null;
  fim: Hora | null;
  atualizado_em: Instante;
}

export interface ClubePremioTabela {
  id: Generated<number>;
  nome: string;
  descricao: string | null;
  pontos: number;
  produto_id: number | null;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface ClubePresenteTabela {
  tipo: "boas_vindas" | "aniversario" | "sentimos_falta";
  ligado: Generated<boolean>;
  beneficio: "desconto_percentual" | "desconto_valor" | "produto" | "pontos";
  valor: number | null;
  produto_id: number | null;
  dias_sem_pedir: number | null;
  validade_dias: Generated<number>;
  mensagem: string | null;
  atualizado_em: Instante;
  atualizado_por: number | null;
}

export interface ClubeCampanhaTabela {
  id: Generated<number>;
  unidade_id: number;
  titulo: string;
  texto: string;
  publico: "todos" | "aniversariantes_do_mes" | "sem_pedir_30_dias";
  enviar_em: ColumnType<Date, Date | string, Date | string>;
  situacao: Generated<"agendada" | "cancelada" | "enviada">;
  criada_por: number;
  criada_em: Instante;
  atualizada_em: Instante;
  cancelada_por: number | null;
  cancelada_em: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  motivo_cancelamento: string | null;
  enviada_em: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  destinatarios: number | null;
}

/** Fichas técnicas (migração 0019). Versão, item e pendência são só de inserção. */
export interface FichaTabela {
  id: Generated<number>;
  tipo: "produto" | "tamanho" | "adicional" | "preparo";
  produto_id: number | null;
  tamanho_id: number | null;
  adicional_id: number | null;
  nome: string | null;
  unidade_rendimento: "g" | "ml" | "un" | null;
  versao_atual_id: number | null;
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface FichaVersaoTabela {
  id: Generated<number>;
  ficha_id: number;
  numero: number;
  rende: string | null;
  porcao_quantidade: string | null;
  porcao_unidade: "g" | "ml" | "un" | null;
  tempo_min: number | null;
  validade_dias: number | null;
  etapas: ColumnType<{ texto: string; minutos: number | null }[], string | undefined, never>;
  equipamentos: ColumnType<string[], string[] | undefined, never>;
  observacoes: string | null;
  motivo: string | null;
  criada_por: number;
  criada_em: Instante;
}

export interface FichaItemTabela {
  id: Generated<number>;
  versao_id: number;
  ordem: number;
  ingrediente_id: number | null;
  preparo_id: number | null;
  quantidade: string | null;
  opcional: Generated<boolean>;
  medida_caseira: string | null;
  observacao: string | null;
}

export interface FichaPendenciaTabela {
  id: Generated<number>;
  versao_id: number;
  texto: string;
}

export interface FichaConfigTabela {
  id: Generated<number>;
  limite_custo_pb: Generated<number>;
  atualizado_em: Instante;
  atualizado_por: number | null;
}

/** Catálogo de alergênicos (migração 0020; decisão 0026). Código só letras minúsculas e _. */
export interface AlergenicoTabela {
  codigo: string;
  nome: string;
  descricao: string | null;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  /** Criado ou reativado em (migração 0020): conferência anterior não vale para ele. */
  na_lista_desde: Instante;
  criado_em: Instante;
  atualizado_em: Instante;
}

export interface IngredienteAlergenicoTabela {
  ingrediente_id: number;
  alergenico_codigo: string;
  tipo: "contem" | "tracos";
  ativo: Generated<boolean>;
  criado_em: Instante;
  atualizado_em: Instante;
}

type Area = "cozinha" | "bebidas_salao" | "cafeteria" | "sorvete";
type LocalDoEstoque = "em_uso" | "guardado";
/** numeric do PostgreSQL chega como texto (decimal exato); grava texto ou número. */
type DecimalDoEstoque = ColumnType<string, string | number, string | number>;
type Inteirao = ColumnType<string, string | number | bigint, string | number | bigint>;

/** Item de estoque: um ingrediente ou um preparo da casa (migração 0021; decisão 0027). */
export interface EstoqueItemTabela {
  id: Generated<number>;
  ingrediente_id: number | null;
  preparo_id: number | null;
  area_preparo: Area | null;
  quantidade: ColumnType<string, string | number | undefined, string | number>;
  valor_centavos: ColumnType<string, string | number | bigint | undefined, string | number | bigint>;
  ultimo_custo_centavos: Inteirao | null;
  ultimo_custo_quantidade: DecimalDoEstoque | null;
  criado_em: Instante;
  atualizado_em: Instante;
}

export type TipoDeMovimento =
  | "entrada"
  | "saldo_inicial"
  | "transferencia"
  | "perda"
  | "bloqueio"
  | "desbloqueio"
  | "consumo"
  | "producao"
  | "ajuste"
  | "custo"
  | "estorno";

export interface EstoqueMovimentoTabela {
  id: Generated<string>;
  tipo: TipoDeMovimento;
  motivo: string | null;
  observacao: string | null;
  autor_id: number;
  recebido_por: number | null;
  estorno_de: Inteirao | null;
  corrige_custo_de: Inteirao | null;
  chave: string | null;
  assinatura: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  fornecedor_id: number | null;
  nota_numero: string | null;
  nota_data: ColumnType<string, string | null | undefined, string | null> | null;
  ficha_versao_id: number | null;
  previsto: DecimalDoEstoque | null;
  criado_em: Instante;
}

export interface EstoqueLoteTabela {
  id: Generated<number>;
  item_id: number;
  validade: ColumnType<string, string | null | undefined, string | null> | null;
  codigo: string | null;
  movimento_id: Inteirao;
  criado_em: Instante;
}

export interface EstoqueSaldoTabela {
  lote_id: number;
  area: Area;
  local: LocalDoEstoque;
  bloqueado: boolean;
  item_id: number;
  quantidade: DecimalDoEstoque;
}

export interface EstoqueMovimentoItemTabela {
  movimento_id: Inteirao;
  item_id: number;
  quantidade: DecimalDoEstoque;
  valor_centavos: Inteirao;
  quantidade_depois: DecimalDoEstoque;
  valor_depois: Inteirao;
  faltou: ColumnType<string, string | number | undefined, never>;
  custo_estimado: Generated<boolean>;
  /** Só na correção de custo (migração 0022): o valor total certo da linha da entrada. */
  valor_informado: Inteirao | null;
}

/** Foto da nota de compra (migração 0022). */
export interface EstoqueNotaFotoTabela {
  id: Generated<number>;
  movimento_id: Inteirao;
  tipo: Generated<"image/webp">;
  conteudo: Buffer;
  largura: number;
  altura: number;
  sha256: string;
  enviada_por: number;
  criado_em: Instante;
}

export interface EstoqueMovimentoLinhaTabela {
  id: Generated<string>;
  movimento_id: Inteirao;
  item_id: number;
  lote_id: number;
  area: Area;
  local: LocalDoEstoque;
  bloqueado: boolean;
  quantidade: DecimalDoEstoque;
  automatica: Generated<boolean>;
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
  categoria: CategoriaTabela;
  tipo_producao: TipoProducaoTabela;
  produto: ProdutoTabela;
  produto_foto: ProdutoFotoTabela;
  combo_parte: ComboParteTabela;
  combo_opcao: ComboOpcaoTabela;
  produto_tamanho: ProdutoTamanhoTabela;
  grupo_adicional: GrupoAdicionalTabela;
  adicional: AdicionalTabela;
  produto_grupo_adicional: ProdutoGrupoAdicionalTabela;
  horario_unidade: HorarioUnidadeTabela;
  horario_unidade_data: HorarioUnidadeDataTabela;
  horario_venda: HorarioVendaTabela;
  horario_venda_data: HorarioVendaDataTabela;
  pausa_venda: PausaVendaTabela;
  importacao_planilha: ImportacaoPlanilhaTabela;
  clube_regras: ClubeRegrasTabela;
  clube_categoria: ClubeCategoriaTabela;
  clube_horario_desconto: ClubeHorarioDescontoTabela;
  clube_premio: ClubePremioTabela;
  clube_presente: ClubePresenteTabela;
  clube_campanha: ClubeCampanhaTabela;
  ficha: FichaTabela;
  ficha_versao: FichaVersaoTabela;
  ficha_item: FichaItemTabela;
  ficha_pendencia: FichaPendenciaTabela;
  ficha_config: FichaConfigTabela;
  alergenico: AlergenicoTabela;
  ingrediente_alergenico: IngredienteAlergenicoTabela;
  estoque_item: EstoqueItemTabela;
  estoque_movimento: EstoqueMovimentoTabela;
  estoque_lote: EstoqueLoteTabela;
  estoque_saldo: EstoqueSaldoTabela;
  estoque_movimento_item: EstoqueMovimentoItemTabela;
  estoque_movimento_linha: EstoqueMovimentoLinhaTabela;
  estoque_nota_foto: EstoqueNotaFotoTabela;
}
