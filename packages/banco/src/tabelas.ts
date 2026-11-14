import type { ColumnType, Generated } from "kysely";

// Tipos escritos à mão a partir das migrações em ../migracoes. Mantenha em sincronia.
type Instante = ColumnType<Date, Date | string | undefined, Date | string>;

export interface EmpresaTabela {
  id: Generated<number>;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string | null; // CNPJ sempre texto
  criado_em: Generated<Instante>;
}

export interface UnidadeTabela {
  id: Generated<number>;
  empresa_id: number;
  nome: string;
  fuso_horario: Generated<string>;
  criado_em: Generated<Instante>;
}

export interface SetorTabela {
  id: Generated<number>;
  unidade_id: number;
  nome: string;
  criado_em: Generated<Instante>;
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
  criado_em: Generated<Instante>;
  desligado_em: Instante | null;
}

export interface UsuarioPerfilTabela {
  usuario_id: number;
  perfil_codigo: string;
  unidade_id: number;
  criado_em: Generated<Instante>;
}

export interface SessaoTabela {
  id: string; // hash do token; o token em si nunca é gravado
  usuario_id: number;
  criada_em: Generated<Instante>;
  expira_em: Instante;
  revogada_em: Instante | null;
  ip: string | null;
  agente: string | null;
}

export interface AuditoriaTabela {
  id: Generated<string>;
  ocorrido_em: Generated<Instante>;
  usuario_id: number | null;
  acao: string;
  resultado: "permitido" | "recusado" | "falhou";
  alvo_tipo: string | null;
  alvo_id: string | null;
  detalhes: ColumnType<Record<string, unknown>, string | undefined, never>;
  ip: string | null;
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
}
