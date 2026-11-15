import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Ajudante, Panela, Tarefa } from '../types'
import {
  desenharSala,
  limpar,
  montarCena,
  papelDe,
  papelDoAgente,
  resumo,
  tempo,
} from './cena'
import type { Cena } from './cena'
import { PAGINA, PASTA_WEB } from './pagina'

const PAINEL = 'salao'
const TITULO = 'Salão'

const tarefas = atom({ plugin: 'salao', key: 'tarefas' } as const, [], { shape: 'tarefas-1' })
const panelas = atom({ plugin: 'salao', key: 'panelas' } as const, [], { shape: 'panelas-1' })
const equipe = atom({ plugin: 'salao', key: 'equipe' } as const, [], { shape: 'equipe-1' })
const fundo = atom({ plugin: 'salao', key: 'fundo' } as const, [], { shape: 'fundo-1' })
const entregues = atom({ plugin: 'salao', key: 'entregues' } as const, 0)
const agora = atom({ plugin: 'salao', key: 'agora' } as const, 0)
const emTurno = atom({ plugin: 'salao', key: 'emTurno' } as const, false)

const VIVOS = new Set(['pending', 'running', 'waiting'])

/** O salão nunca pode atrapalhar o trabalho: erro dele é engolido. */
const quieto = async (fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn()
  } catch {
    // de propósito: o painel só mostra, não decide nada
  }
}

/** Lê do motor quais subagentes estão trabalhando e guarda só se mudou. */
const atualizarEquipe = async ($: EngineInterface): Promise<void> => {
  const lista = await $.agent.list()
  const t = await $.clock.now()

  await update($, equipe, antes => {
    const nova: Ajudante[] = lista
      .filter(a => VIVOS.has(a.status))
      .map(a => ({
        id: a.id,
        papel: papelDoAgente(a.type),
        rotulo: a.description === '' ? a.type : a.description,
        status: a.status,
        inicio: antes.find(x => x.id === a.id)?.inicio ?? t,
        ...(a.parentId === undefined ? {} : { paiId: a.parentId }),
      }))

    return JSON.stringify(nova) === JSON.stringify(antes) ? antes : nova
  })
}

const lerCena = async ($: EngineInterface): Promise<{ cena: Cena; t: number }> => {
  const t = Math.max(await read($, agora), 0)
  const cena = montarCena({
    tarefas: await read($, tarefas),
    panelas: await read($, panelas),
    equipe: await read($, equipe),
    fundo: await read($, fundo),
    emTurno: await read($, emTurno),
    agora: t,
  })

  return { cena, t }
}

/** A cada batida: confere a equipe, tira quem saiu de cena e acerta o relógio. */
let ultimaChave = ''
let ultimaEscrita = 0

/**
 * Escreve a cena num arquivo para a página do navegador (onde o aplicativo
 * não desenha painéis). Só escreve quando algo mudou, ou a cada 6 s como sinal de vida.
 */
async function publicar($: EngineInterface): Promise<void> {
  const { cena } = await lerCena($)
  const feitos = await read($, entregues)
  const corpo = {
    svg: desenharSala(cena),
    nomeNivel: cena.nomeNivel,
    pessoas: cena.pessoas,
    emCena: cena.emCena.slice(0, 14),
    fogo: cena.fogo.slice(0, 10),
    feitos,
  }
  const chave = JSON.stringify(corpo)
  const t = await $.clock.now()

  if (chave === ultimaChave && t - ultimaEscrita < 6000) {
    return
  }

  ultimaChave = chave
  ultimaEscrita = t
  await $.fs.write(`${PASTA_WEB}/cena.json`, JSON.stringify({ ...corpo, escrito: t }))
}

async function bater($: EngineInterface): Promise<void> {
  await atualizarEquipe($)
  const t = await $.clock.now()
  const lista: readonly Tarefa[] = await read($, tarefas)
  const limpa = limpar(lista, t)

  if (limpa.length !== lista.length) {
    await update($, tarefas, atual => limpar(atual, t))
  }

  const fogo = await read($, panelas)
  const gente = await read($, equipe)

  // Parado, o painel não é redesenhado à toa.
  if (lista.length > 0 || fogo.length > 0 || gente.length > 0) {
    await update($, agora, () => t)
  }

  await publicar($)
}

export const register: Register = on => {
  let relogio: Timer | undefined

  on('session.start', async ($, e, next) => {
    await quieto(async () => {
      await $.command.register({
        name: 'salao',
        description: 'Abre o painel Salão: as tarefas em andamento como um restaurante',
      })
      relogio?.cancel()
      relogio = $.clock.every(2000, () => void quieto(() => bater($)))
      const t = await $.clock.now()

      await update($, agora, () => t)
      void $.ui.open({ id: PAINEL, title: TITULO })
      await $.fs.write(`${PASTA_WEB}/index.html`, PAGINA)
      await publicar($)
    })

    return next(e)
  })

  on('command.run', { command: 'salao' }, async $ => {
    const aberto = await $.ui.open({ id: PAINEL, title: TITULO })

    return {
      text: aberto.isPlaced
        ? 'Painel Salão aberto e desenhado pelo aplicativo.'
        : `O aplicativo não desenhou o painel Salão. Motivo informado: ${aberto.reason}`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await quieto(() => update($, emTurno, () => true))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await quieto(async () => {
        await update($, emTurno, () => false)
        await bater($)
      })
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const feito = await next(e)

    await quieto(async () => {
      const id = feito.agentId

      if (e.background && id !== undefined) {
        await update($, fundo, lista => [...lista.filter(x => x !== id), id].slice(-200))
      }

      await atualizarEquipe($)
    })

    return feito
  })

  on('tool.call', async ($, e, next) => {
    const ferramenta = String(e.tool)
    const args = e as unknown as Record<string, unknown>
    const id = String(e.tool_use_id)

    // O subagente aparece como profissional (pela lista de agentes), não como chamada.
    if (ferramenta !== 'Agent') {
      await quieto(async () => {
        const t = await $.clock.now()
        const tarefa: Tarefa = {
          id,
          ...papelDe(ferramenta, args),
          inicio: t,
          ...(e.agentId === undefined ? {} : { agente: e.agentId }),
        }

        await update($, tarefas, lista => [...limpar(lista, t), tarefa].slice(-300))
        await update($, agora, () => t)
        await publicar($)
      })
    }

    try {
      const feito = await next(e)

      await quieto(async () => {
        const t = await $.clock.now()
        const dados = (feito.result ?? {}) as Record<string, unknown>
        const idFundo = dados.backgroundTaskId

        // Comando que ficou rodando sozinho vira panela no fogo baixo.
        if (
          ferramenta === 'Bash' &&
          feito.deny === undefined &&
          (typeof idFundo === 'string' || args.run_in_background === true)
        ) {
          const nova: Panela = {
            id: typeof idFundo === 'string' ? idFundo : id,
            tipo: 'shell',
            rotulo: papelDe('Bash', args).rotulo.replace(/^rodando /, ''),
            inicio: t,
          }

          await update($, panelas, lista => [...lista.filter(p => p.id !== nova.id), nova])
        }

        if (ferramenta === 'TaskStop' && feito.deny === undefined) {
          const parado = args.task_id ?? args.shell_id

          await update($, panelas, lista => lista.filter(p => p.id !== parado))
        }
      })

      return feito
    } finally {
      await quieto(async () => {
        const t = await $.clock.now()

        if (ferramenta === 'Agent') {
          await atualizarEquipe($)
        } else {
          await update($, tarefas, lista =>
            lista.map(x => (x.id === id && x.fim === undefined ? { ...x, fim: t } : x)),
          )
          await update($, entregues, n => n + 1)
        }

        await update($, agora, () => t)
        await publicar($)
      })
    }
  })

  // Ao fim de cada resposta o motor diz o que continua em segundo plano:
  // é a conferência que vale. O que não está na lista terminou.
  on('classic.Stop', async ($, e, next) => {
    const abertos = e.background_tasks

    if (abertos !== undefined) {
      await quieto(async () => {
        const t = await $.clock.now()

        await update($, panelas, antes =>
          abertos
            .filter(b => b.type !== 'subagent')
            .map(
              b =>
                antes.find(p => p.id === b.id) ?? {
                  id: b.id,
                  tipo: b.type,
                  rotulo: (b.command ?? b.name ?? b.description).slice(0, 48),
                  inicio: t,
                },
            ),
        )
        await atualizarEquipe($)
        await update($, agora, () => t)
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { cena } = await lerCena($)
    const n = cena.fogo.length

    return (
      <Box>
        <Text dimColor={cena.pessoas === 0}>
          🍽️ Salão: {cena.nomeNivel}
          {cena.pessoas > 0 ? ` · ${cena.pessoas} em cena` : ''}
          {'   '}
        </Text>
        {n > 0 ? (
          <Text color="yellow" bold>
            🍲 {n} em segundo plano
          </Text>
        ) : (
          <Text dimColor>✅ nada em segundo plano</Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const { cena, t } = await lerCena($)
    const feitos = await read($, entregues)

    return (
      <Box flexDirection="column">
        {'Svg' in ui ? <ui.Svg source={desenharSala(cena)} alt={resumo(cena)} /> : null}
        <Text bold>
          🍽️ {cena.nomeNivel.toUpperCase()}
          {cena.pessoas > 0 ? ` · ${cena.pessoas} em cena` : ''}
        </Text>
        {cena.emCena.length === 0 ? (
          <Text dimColor>Ninguém trabalhando agora.</Text>
        ) : (
          cena.emCena.slice(0, 12).map(l => (
            <Text>
              {l.recuo ? '   └ ' : ''}
              {l.emoji} {l.nome}: {l.rotulo}
              {l.desde === undefined ? '' : `  ${tempo(t - l.desde)}`}
            </Text>
          ))
        )}
        <Text bold color={cena.fogo.length > 0 ? 'yellow' : undefined}>
          {cena.fogo.length > 0
            ? `🍲 FOGO BAIXO: ${cena.fogo.length} em segundo plano`
            : '✅ FOGO APAGADO: nada em segundo plano'}
        </Text>
        {cena.fogo.slice(0, 8).map(f => (
          <Text>
            🍲 {f.rotulo}  há {tempo(t - f.desde)}
          </Text>
        ))}
        <Text dimColor>Pratos entregues nesta sessão: {feitos}</Text>
      </Box>
    )
  })
}
