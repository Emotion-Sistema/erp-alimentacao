export type Papel =
  | 'garcom'
  | 'cozinheiro'
  | 'chapeiro'
  | 'entregador'
  | 'caixa'
  | 'auxiliar'
  | 'linha'
  | 'chef'
  | 'reforco'

/** Uma chamada de ferramenta: em andamento enquanto `fim` não existe. */
export type Tarefa = {
  id: string
  papel: Papel
  rotulo: string
  inicio: number
  fim?: number
  /** Id do subagente em cujo trabalho a chamada aconteceu. */
  agente?: string
}

/** Um processo em segundo plano (comando, monitor, fluxo). */
export type Panela = { id: string; tipo: string; rotulo: string; inicio: number }

/** Um subagente trabalhando. */
export type Ajudante = {
  id: string
  papel: Papel
  rotulo: string
  status: string
  inicio: number
  paiId?: string
}

declare module 'claude-code' {
  interface PluginState {
    salao: {
      tarefas: Shaped<Tarefa[]>
      panelas: Shaped<Panela[]>
      equipe: Shaped<Ajudante[]>
      fundo: Shaped<string[]>
      entregues: number
      agora: number
      emTurno: boolean
    }
  }
}
