// Lógica pura do salão: quem entra em cena e o desenho isométrico (SVG).
// Sem `$`: tudo aqui é testável sozinho.
import type { Ajudante, Panela, Papel, Tarefa } from '../types'

export const NOMES: Record<Papel, string> = {
  garcom: 'Garçom',
  cozinheiro: 'Cozinheiro',
  chapeiro: 'Chapeiro',
  entregador: 'Entregador',
  caixa: 'Caixa',
  auxiliar: 'Auxiliar',
  linha: 'Coz. de linha',
  chef: 'Chef',
  reforco: 'Reforço',
}

export const EMOJI: Record<Papel, string> = {
  garcom: '🧑‍💼',
  cozinheiro: '👨‍🍳',
  chapeiro: '🔥',
  entregador: '🛵',
  caixa: '🧾',
  auxiliar: '🧽',
  linha: '🍳',
  chef: '👩‍🍳',
  reforco: '🧑‍🍳',
}

/** Por quanto tempo quem terminou continua visível (evita piscar). */
export const PERMANENCIA_MS = 6000
/** Chamada sem fim há mais que isto é tratada como perdida. */
const VALIDADE_MS = 2 * 60 * 60 * 1000

const curto = (texto: string, max: number): string => {
  const limpo = texto.replace(/\s+/g, ' ').trim()

  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo
}

const arquivo = (caminho: unknown): string =>
  typeof caminho === 'string' ? (caminho.split('/').pop() ?? caminho) : 'arquivo'

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '')

/** Qual profissional cuida de uma chamada de ferramenta, e o que ele está fazendo. */
export const papelDe = (
  ferramenta: string,
  args: Record<string, unknown>,
): { papel: Papel; rotulo: string } => {
  if (ferramenta.startsWith('mcp__github__')) {
    return {
      papel: 'caixa',
      rotulo: `GitHub: ${ferramenta.slice('mcp__github__'.length).replace(/_/g, ' ')}`,
    }
  }

  if (ferramenta.startsWith('mcp__')) {
    const partes = ferramenta.split('__')

    return {
      papel: 'entregador',
      rotulo: curto(`buscando fora: ${partes.slice(1).join(' ').replace(/_/g, ' ')}`, 48),
    }
  }

  switch (ferramenta) {
    case 'Read':
      return { papel: 'garcom', rotulo: `lendo ${arquivo(args.file_path)}` }
    case 'Grep':
      return { papel: 'garcom', rotulo: curto(`procurando "${texto(args.pattern)}"`, 48) }
    case 'Glob':
      return { papel: 'garcom', rotulo: curto(`procurando arquivos ${texto(args.pattern)}`, 48) }
    case 'Edit':
    case 'NotebookEdit':
      return {
        papel: 'cozinheiro',
        rotulo: `editando ${arquivo(args.file_path ?? args.notebook_path)}`,
      }
    case 'Write':
      return { papel: 'cozinheiro', rotulo: `escrevendo ${arquivo(args.file_path)}` }
    case 'Bash': {
      const comando = texto(args.command)
      const eGit = /^\s*(git|gh)\s/.test(comando)

      return {
        papel: eGit ? 'caixa' : 'chapeiro',
        rotulo: curto(`rodando ${comando}`, 48),
      }
    }
    case 'Monitor':
      return { papel: 'chapeiro', rotulo: 'vigiando um processo' }
    case 'WebFetch':
    case 'WebSearch':
      return {
        papel: 'entregador',
        rotulo: curto(`buscando na internet ${texto(args.query ?? args.url)}`, 48),
      }
    default:
      return { papel: 'garcom', rotulo: curto(`atendendo: ${ferramenta}`, 48) }
  }
}

/** Qual profissional é um subagente, pelo tipo. */
export const papelDoAgente = (tipo: string): Papel => {
  switch (tipo) {
    case 'ajudante':
      return 'auxiliar'
    case 'construtor':
      return 'linha'
    case 'revisor':
      return 'chef'
    default:
      return 'reforco'
  }
}

/** Tira o que já saiu de cena. */
export const limpar = (lista: readonly Tarefa[], agora: number): Tarefa[] =>
  lista.filter(t =>
    t.fim === undefined ? agora - t.inicio < VALIDADE_MS : agora - t.fim < PERMANENCIA_MS,
  )

export const tempo = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const resto = String(s % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${resto}` : `${m}:${resto}`
}

export type Figura = {
  papel: Papel
  /** Trabalhando agora (mexe-se) ou acabou de terminar (parado). */
  ativo: boolean
  /** Da equipe de um subagente: desenhado menor. */
  menor: boolean
  quantos: number
}

export type LinhaCena = { emoji: string; nome: string; rotulo: string; desde?: number; recuo: boolean }

export type Cena = {
  nivel: 0 | 1 | 2 | 3
  nomeNivel: string
  figuras: Figura[]
  emCena: LinhaCena[]
  /** Segundo plano: comandos e subagentes que seguem sem o Claude esperar. */
  fogo: { rotulo: string; desde: number }[]
  pessoas: number
}

const NIVEIS = ['casa vazia', 'movimento leve', 'casa cheia', 'rush'] as const

export const montarCena = (dados: {
  tarefas: readonly Tarefa[]
  panelas: readonly Panela[]
  equipe: readonly Ajudante[]
  fundo: readonly string[]
  emTurno: boolean
  agora: number
}): Cena => {
  const tarefas = limpar(dados.tarefas, dados.agora)
  const figuras = new Map<string, Figura>()
  const somar = (papel: Papel, ativo: boolean, menor: boolean): void => {
    const chave = `${papel}:${menor ? 'm' : 'g'}`
    const ja = figuras.get(chave)

    if (ja === undefined) {
      figuras.set(chave, { papel, ativo, menor, quantos: 1 })
    } else {
      ja.quantos += 1
      ja.ativo = ja.ativo || ativo
    }
  }

  const emCena: LinhaCena[] = []

  for (const a of dados.equipe) {
    somar(a.papel, a.status !== 'waiting', a.paiId !== undefined)
    emCena.push({
      emoji: EMOJI[a.papel],
      nome: NOMES[a.papel],
      rotulo: a.status === 'waiting' ? `${a.rotulo} (aguardando)` : a.rotulo,
      desde: a.inicio,
      recuo: a.paiId !== undefined,
    })

    for (const t of tarefas) {
      if (t.agente === a.id && t.fim === undefined) {
        emCena.push({
          emoji: EMOJI[t.papel],
          nome: NOMES[t.papel],
          rotulo: t.rotulo,
          desde: t.inicio,
          recuo: true,
        })
      }
    }
  }

  for (const t of tarefas) {
    somar(t.papel, t.fim === undefined, t.agente !== undefined)

    if (t.agente === undefined && t.fim === undefined) {
      emCena.push({
        emoji: EMOJI[t.papel],
        nome: NOMES[t.papel],
        rotulo: t.rotulo,
        desde: t.inicio,
        recuo: false,
      })
    }
  }

  // Subagente é segundo plano quando foi lançado assim, ou quando continua
  // trabalhando depois que a resposta principal terminou.
  const fogo = [
    ...dados.panelas.map(p => ({ rotulo: p.rotulo, desde: p.inicio })),
    ...dados.equipe
      .filter(a => dados.fundo.includes(a.id) || !dados.emTurno)
      .map(a => ({ rotulo: `${NOMES[a.papel]}: ${a.rotulo}`, desde: a.inicio })),
  ]

  const lista = [...figuras.values()]
  const pessoas = lista.reduce((n, f) => n + f.quantos, 0)
  const temEquipeDeAgente = lista.some(f => f.menor)
  const nivel = pessoas === 0 ? 0 : pessoas === 1 ? 1 : pessoas >= 4 || temEquipeDeAgente ? 3 : 2

  return { nivel, nomeNivel: NIVEIS[nivel], figuras: lista, emCena, fogo, pessoas }
}

// ---------------------------------------------------------------------------
// Desenho isométrico
// ---------------------------------------------------------------------------

const TW = 44
const TH = 22
const OX = 200
const OY = 94
const LARGURA = 444
const ALTURA = 318
const PAREDE = 62

type P = readonly [number, number]

const iso = (x: number, y: number, z = 0): P => [
  Math.round((OX + ((x - y) * TW) / 2) * 10) / 10,
  Math.round((OY + ((x + y) * TH) / 2 - z) * 10) / 10,
]

const pts = (lista: readonly P[]): string => lista.map(p => p.join(',')).join(' ')

const poli = (lista: readonly P[], fill: string, extra = ''): string =>
  `<polygon points="${pts(lista)}" fill="${fill}" ${extra}/>`

type Peca = { fundo: number; svg: string; nome?: string }

/** Caixa isométrica, cortada em fatias para a ordem de desenho ficar certa. */
const bloco = (
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  cores: readonly [string, string, string],
): Peca[] => {
  const pecas: Peca[] = []

  for (let x0 = x; x0 < x + w - 0.001; x0 += 1) {
    const x1 = Math.min(x0 + 1, x + w)
    const topo = poli([iso(x0, y, h), iso(x1, y, h), iso(x1, y + d, h), iso(x0, y + d, h)], cores[0])
    const frente = poli(
      [iso(x0, y + d, 0), iso(x1, y + d, 0), iso(x1, y + d, h), iso(x0, y + d, h)],
      cores[1],
    )
    const lado =
      x1 >= x + w - 0.001
        ? poli([iso(x1, y, 0), iso(x1, y + d, 0), iso(x1, y + d, h), iso(x1, y, h)], cores[2])
        : ''

    pecas.push({ fundo: (x0 + x1) / 2 + y + d / 2, svg: frente + lado + topo })
  }

  return pecas
}

const POSTOS: Record<Papel, readonly [number, number]> = {
  chapeiro: [2.0, 1.3],
  linha: [3.7, 1.7],
  cozinheiro: [5.2, 1.3],
  chef: [7.0, 2.0],
  auxiliar: [0.5, 2.6],
  garcom: [3.5, 5.3],
  reforco: [6.0, 5.6],
  entregador: [1.0, 6.9],
  caixa: [9.1, 6.0],
}

const CORPO: Record<Papel, string> = {
  garcom: '#23262e',
  cozinheiro: '#f4f4f0',
  chapeiro: '#f4f4f0',
  linha: '#e9eef2',
  chef: '#ffffff',
  auxiliar: '#4d8fd1',
  entregador: '#e8742c',
  caixa: '#3f9d6b',
  reforco: '#8d6cc4',
}

const chapeu = (papel: Papel): string => {
  switch (papel) {
    case 'chef':
      return '<rect x="-5" y="-42" width="10" height="9" rx="2" fill="#fff"/><ellipse cx="0" cy="-42" rx="7" ry="4" fill="#fff"/>'
    case 'cozinheiro':
    case 'linha':
      return '<rect x="-6" y="-36" width="12" height="5" rx="2" fill="#fff"/>'
    case 'chapeiro':
      return '<path d="M-6.5 -31 a6.5 6.5 0 0 1 13 0 z" fill="#c8382c"/>'
    case 'auxiliar':
      return '<path d="M-6.5 -31 a6.5 6.5 0 0 1 13 0 l3 1 h-16 z" fill="#2c5f96"/>'
    case 'entregador':
      return '<path d="M-7 -29 a7 7 0 0 1 14 0 z" fill="#f2b632"/><rect x="5" y="-19" width="7" height="11" rx="2" fill="#b3521a"/>'
    case 'caixa':
      return '<path d="M-7 -30 h14 l2 2 h-18 z" fill="#1f6b45"/>'
    case 'garcom':
      return '<path d="M-3 -19 l3 2 l3 -2 v4 l-3 -2 l-3 2 z" fill="#c8382c"/><rect x="-11" y="-14" width="6" height="2" rx="1" fill="#eee"/>'
    default:
      return ''
  }
}

const avental = (papel: Papel): string =>
  papel === 'cozinheiro' || papel === 'chapeiro' || papel === 'linha' || papel === 'auxiliar'
    ? '<rect x="-4" y="-15" width="8" height="12" rx="2" fill="#d9dde2" opacity=".9"/>'
    : papel === 'garcom'
      ? '<rect x="-4" y="-17" width="8" height="8" rx="1" fill="#f4f4f0"/>'
      : ''

const pessoa = (figura: Figura, indice: number): Peca => {
  const base = POSTOS[figura.papel]
  // A equipe do subagente fica um passo ao lado, menor.
  const x = base[0] + (figura.menor ? 0.75 : 0)
  const y = base[1] + (figura.menor ? 0.45 : 0)
  const [sx, sy] = iso(x, y)
  const escala = figura.menor ? 0.74 : 1
  const balanco = figura.ativo
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.6;0 0" dur="${(0.62 + (indice % 3) * 0.09).toFixed(2)}s" repeatCount="indefinite"/>`
    : ''
  const selo =
    figura.quantos > 1
      ? `<g transform="translate(11 -34)"><circle r="6.5" fill="#f2b632"/><text y="2.6" font-size="7.5" font-weight="700" text-anchor="middle" fill="#23262e">${figura.quantos}</text></g>`
      : ''
  const corpo = `<g opacity="${figura.ativo ? 1 : 0.72}">${balanco}<rect x="-7" y="-22" width="14" height="20" rx="6" fill="${CORPO[figura.papel]}" stroke="#23262e" stroke-opacity=".35" stroke-width=".8"/>${avental(figura.papel)}<circle cx="0" cy="-27" r="6" fill="#f0c49c" stroke="#23262e" stroke-opacity=".3" stroke-width=".8"/>${chapeu(figura.papel)}${selo}</g>`
  const acima = figura.papel === 'linha' || figura.papel === 'chef'
  const nome = figura.menor
    ? ''
    : `<text x="${sx}" y="${sy + (acima ? -47 : 10)}" font-size="7.5" font-weight="600" text-anchor="middle" fill="#fff" stroke="#1a1d24" stroke-width="2.4" paint-order="stroke">${NOMES[figura.papel]}</text>`

  return {
    fundo: x + y + 0.02,
    svg: `<g transform="translate(${sx} ${sy}) scale(${escala})"><ellipse cx="0" cy="0" rx="9" ry="4" fill="#000" opacity=".28"/>${corpo}</g>`,
    nome,
  }
}

const mesa = (x: number, y: number, ocupada: boolean): Peca => {
  const [sx, sy] = iso(x, y)
  const prato = ocupada
    ? '<ellipse cx="-5" cy="-16" rx="5" ry="2.5" fill="#fff"/><ellipse cx="6" cy="-14" rx="5" ry="2.5" fill="#fff"/><circle cx="6" cy="-14.5" r="2" fill="#e8742c"/>'
    : ''

  return {
    fundo: x + y,
    svg: `<g transform="translate(${sx} ${sy})"><ellipse cx="0" cy="1" rx="15" ry="7" fill="#000" opacity=".22"/><rect x="-2.5" y="-14" width="5" height="14" fill="#6d4a2c"/><ellipse cx="0" cy="-12" rx="19" ry="9.5" fill="#7a2e2a"/><ellipse cx="0" cy="-15" rx="19" ry="9.5" fill="${ocupada ? '#f6efe2' : '#d8cfbf'}"/>${prato}</g>`,
  }
}

const QUEIMADORES: readonly (readonly [number, number])[] = [
  [7.55, 0.55],
  [8.4, 0.55],
  [9.25, 0.55],
]

const panela = (x: number, y: number, acesa: boolean, i: number): Peca => {
  const [sx, sy] = iso(x, y, 19)

  if (!acesa) {
    return {
      fundo: x + y + 0.7,
      svg: `<ellipse cx="${sx}" cy="${sy}" rx="8" ry="4" fill="none" stroke="#6b7078" stroke-width="1.6"/>`,
    }
  }

  const d = (0.45 + i * 0.07).toFixed(2)
  const vapor = [0, 1].map(k => {
    const atraso = (k * 0.7 + i * 0.3).toFixed(1)

    return `<circle cx="${k === 0 ? -3 : 3}" cy="-12" r="2.6" fill="#fff" opacity="0"><animate attributeName="cy" values="-12;-30" dur="1.6s" begin="${atraso}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.55;0" dur="1.6s" begin="${atraso}s" repeatCount="indefinite"/></circle>`
  })

  return {
    fundo: x + y + 0.7,
    svg: `<g transform="translate(${sx} ${sy})"><ellipse cx="0" cy="1" rx="10" ry="5" fill="#ff8a1e"><animate attributeName="rx" values="9;11.5;9" dur="${d}s" repeatCount="indefinite"/><animate attributeName="fill" values="#ff8a1e;#ffd23e;#ff8a1e" dur="${d}s" repeatCount="indefinite"/></ellipse><path d="M-9 -9 v7 a9 4.5 0 0 0 18 0 v-7 z" fill="#3b4048"/><ellipse cx="0" cy="-9" rx="9" ry="4.5" fill="#c9793a"/><ellipse cx="0" cy="-9" rx="9" ry="4.5" fill="none" stroke="#5a606a" stroke-width="1.4"/><rect x="9" y="-8" width="7" height="2" rx="1" fill="#23262e"/>${vapor.join('')}</g>`,
  }
}

const fumaca = (x: number, y: number): Peca => {
  const [sx, sy] = iso(x, y, 20)
  const bolhas = [0, 1, 2].map(
    k =>
      `<circle cx="${(k - 1) * 7}" cy="0" r="3.4" fill="#e9e9e9" opacity="0"><animate attributeName="cy" values="0;-26" dur="1.8s" begin="${(k * 0.55).toFixed(2)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.6;0" dur="1.8s" begin="${(k * 0.55).toFixed(2)}s" repeatCount="indefinite"/></circle>`,
  )

  return { fundo: x + y + 0.7, svg: `<g transform="translate(${sx} ${sy})">${bolhas.join('')}</g>` }
}

/** A sala inteira, como um documento SVG. Depende só da cena (não do relógio). */
export const desenharSala = (cena: Cena): string => {
  const tem = (papel: Papel): boolean => cena.figuras.some(f => f.papel === papel && f.ativo)
  const acesas = cena.fogo.length
  const pecas: Peca[] = []

  // Cozinha (encostada nas paredes do fundo)
  pecas.push(...bloco(1, 0.1, 2, 0.9, 19, ['#5a606a', '#8c929b', '#737981'])) // chapa
  pecas.push(...bloco(4, 0.1, 2, 0.9, 19, ['#d9b98a', '#a8763f', '#8e6233'])) // bancada
  pecas.push(...bloco(7, 0.1, 2.8, 0.9, 19, ['#2c3038', '#4a4f58', '#3b4048'])) // fogão
  pecas.push(...bloco(0.1, 0.9, 0.8, 1, 19, ['#9fc3d8', '#7d8791', '#69727b'])) // pia
  // Passa-pratos, entre a cozinha e o salão
  pecas.push(...bloco(1.6, 3, 6.4, 0.45, 21, ['#e4d2b0', '#9a6a3a', '#80562d']))

  for (const [i, x] of [2.4, 4.4, 6.4].entries()) {
    const [sx, sy] = iso(x, 3.22, 21)

    pecas.push({
      fundo: x + 3.25,
      svg: `<ellipse cx="${sx}" cy="${sy}" rx="6" ry="3" fill="${cena.nivel > i ? '#fff' : '#cdbf9f'}"/>`,
    })
  }

  // Salão
  pecas.push(mesa(2.3, 5.6, tem('garcom')))
  pecas.push(mesa(4.9, 6.9, cena.nivel >= 2))
  pecas.push(mesa(7.3, 5.0, cena.nivel >= 3))
  pecas.push(...bloco(8.5, 6.7, 1.3, 0.7, 19, ['#d9b98a', '#7c5530', '#684626'])) // caixa

  const [cx, cy] = iso(9.1, 7.0, 19)

  pecas.push({
    fundo: 9.1 + 7.05,
    svg: `<g transform="translate(${cx} ${cy})"><rect x="-6" y="-9" width="12" height="9" rx="1.5" fill="#23262e"/><rect x="-4" y="-7.5" width="8" height="3.5" fill="${tem('caixa') ? '#7dffb0' : '#4c6b5a'}"/></g>`,
  })

  QUEIMADORES.forEach(([x, y], i) => pecas.push(panela(x, y, i < acesas, i)))

  if (tem('chapeiro')) {
    pecas.push(fumaca(2, 0.55))
  }

  cena.figuras.forEach((f, i) => pecas.push(pessoa(f, i)))
  pecas.sort((a, b) => a.fundo - b.fundo)

  // Chão: cozinha em ladrilho claro, salão em madeira.
  const chao =
    poli([iso(0, 0), iso(10, 0), iso(10, 3), iso(0, 3)], '#d5d8d2') +
    poli([iso(0, 3), iso(10, 3), iso(10, 8), iso(0, 8)], '#b8895a')
  let linhas = ''

  for (let x = 1; x < 10; x += 1) {
    linhas += `<line x1="${iso(x, 0)[0]}" y1="${iso(x, 0)[1]}" x2="${iso(x, 8)[0]}" y2="${iso(x, 8)[1]}"/>`
  }

  for (let y = 1; y < 8; y += 1) {
    linhas += `<line x1="${iso(0, y)[0]}" y1="${iso(0, y)[1]}" x2="${iso(10, y)[0]}" y2="${iso(10, y)[1]}"/>`
  }

  const paredes =
    poli([iso(0, 0), iso(0, 8), iso(0, 8, PAREDE), iso(0, 0, PAREDE)], '#d9c7a6') +
    poli([iso(0, 0), iso(10, 0), iso(10, 0, PAREDE), iso(0, 0, PAREDE)], '#efe2c6') +
    // azulejo da cozinha na parede do fundo
    poli([iso(0, 0, 19), iso(10, 0, 19), iso(10, 0, 40), iso(0, 0, 40)], '#f8f4ea', 'opacity=".7"') +
    // porta da rua, na parede esquerda
    poli([iso(0, 6.3), iso(0, 7.5), iso(0, 7.5, 46), iso(0, 6.3, 46)], '#6d4a2c') +
    poli([iso(0, 6.5, 24), iso(0, 7.3, 24), iso(0, 7.3, 40), iso(0, 6.5, 40)], '#bfe3f2')

  // Placa e lâmpada do fogo baixo, na parede acima do fogão.
  const [lx, ly] = iso(8.4, 0, 50)
  const lampada =
    acesas > 0
      ? `<circle cx="${lx - 44}" cy="${ly - 9}" r="4.5" fill="#ff5a2e"><animate attributeName="opacity" values="1;.35;1" dur="1s" repeatCount="indefinite"/></circle>`
      : `<circle cx="${lx - 44}" cy="${ly - 9}" r="4.5" fill="#6b7078"/>`
  const placa = `<g>${lampada}<rect x="${lx - 36}" y="${ly - 17}" width="88" height="16" rx="3" fill="#23262e" opacity=".88"/><text x="${lx + 8}" y="${ly - 6}" font-size="8.5" font-weight="700" text-anchor="middle" fill="${acesas > 0 ? '#ffb347' : '#9aa0a8'}">${acesas > 0 ? `FOGO BAIXO · ${acesas}` : 'FOGO APAGADO'}</text></g>`

  const clima = [
    '<rect width="100%" height="100%" rx="10" fill="#0d1017" opacity=".34"/>',
    '',
    `<polygon points="${pts([iso(0, 0), iso(10, 0), iso(10, 8), iso(0, 8)])}" fill="#ffb347" opacity=".08"/>`,
    `<polygon points="${pts([iso(0, 0), iso(10, 0), iso(10, 8), iso(0, 8)])}" fill="#ff8a1e" opacity=".16"><animate attributeName="opacity" values=".1;.22;.1" dur="1.4s" repeatCount="indefinite"/></polygon>`,
  ][cena.nivel]
  const faixa =
    cena.nivel === 3
      ? `<g><rect x="${LARGURA - 66}" y="10" width="54" height="18" rx="9" fill="#c8382c"><animate attributeName="opacity" values="1;.55;1" dur=".9s" repeatCount="indefinite"/></rect><text x="${LARGURA - 39}" y="22.5" font-size="10" font-weight="800" text-anchor="middle" fill="#fff">RUSH</text></g>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}" height="${ALTURA}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">` +
    `<rect width="100%" height="100%" rx="10" fill="#1c2029"/>` +
    paredes +
    chao +
    `<g stroke="#000" stroke-opacity=".09" stroke-width="1">${linhas}</g>` +
    placa +
    pecas.map(p => p.svg).join('') +
    pecas.map(p => p.nome ?? '').join('') +
    clima +
    faixa +
    `</svg>`
  )
}

/** Uma frase para quem não vê o desenho, e para a faixa. */
export const resumo = (cena: Cena): string => {
  const cenaTxt = cena.pessoas === 0 ? cena.nomeNivel : `${cena.nomeNivel} · ${cena.pessoas} em cena`
  const fogoTxt =
    cena.fogo.length === 0
      ? 'fogo apagado (nada em segundo plano)'
      : `${cena.fogo.length} ${cena.fogo.length === 1 ? 'panela' : 'panelas'} no fogo (segundo plano)`

  return `Salão: ${cenaTxt} · ${fogoTxt}`
}
