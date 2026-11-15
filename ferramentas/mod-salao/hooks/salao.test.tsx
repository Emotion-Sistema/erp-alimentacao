import { expect, test } from 'claude-code/testing'

const PAINEL = {
  plugin: 'salao',
  component: 'Pane',
  requestId: 'salao',
  props: {
    title: 'Salão',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const FAIXA = {
  plugin: 'salao',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

test('comando em segundo plano acende o fogo; o fim da resposta confere e apaga', async ($, on) => {
  let relogio = 1_000_000
  on('command.register', () => ({ value: { command: 'salao' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: (relogio += 10) }))
  on('tool.call', (_, e) => ({
    result: e.tool === 'Bash' && e.run_in_background === true ? { backgroundTaskId: 'b1' } : {},
  }))
  on('classic.Stop', () => ({}))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let faixa = await $.ui.mount({ ...FAIXA, surface: 'desktop' })
  expect((await faixa.find({ type: 'Text', text: /segundo plano/ }))?.text).toBe(
    '✅ nada em segundo plano',
  )
  await faixa.unmount()

  await $.tool.call({ tool: 'Bash', command: 'pnpm dev', run_in_background: true })
  await $.tool.call({ tool: 'Read', file_path: '/x/cerebro/00-estado-atual.md' })

  faixa = await $.ui.mount({ ...FAIXA, surface: 'desktop' })
  expect((await faixa.find({ type: 'Text', text: /segundo plano/ }))?.text).toBe(
    '🍲 1 em segundo plano',
  )
  await faixa.unmount()

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const painel = await $.ui.mount({ ...PAINEL, surface })
    expect((await painel.find({ type: 'Text', text: /FOGO BAIXO/ }))?.text).toBe(
      '🍲 FOGO BAIXO: 1 em segundo plano',
    )
    expect((await painel.find({ type: 'Text', text: /pnpm dev/ }))?.text).toMatch(/^🍲 pnpm dev {2}há /)
    // A sala desenhada só existe onde o aplicativo desenha SVG.
    expect((await painel.find({ type: 'Svg' })) !== undefined).toBe(surface !== 'terminal')
    await painel.unmount()
  }

  // O motor diz, ao fim da resposta, que nada continua aberto: a panela sai.
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })

  const painel = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await painel.find({ type: 'Text', text: /FOGO/ }))?.text).toBe(
    '✅ FOGO APAGADO: nada em segundo plano',
  )
  await painel.unmount()
})

test('subagente em segundo plano aparece como profissional e como panela', async ($, on) => {
  let relogio = 2_000_000
  on('agent.list', () => ({
    value: [
      { id: 'a1', description: 'tela Turnos', type: 'construtor', status: 'running' },
      { id: 'a2', description: 'antigo', type: 'revisor', status: 'completed' },
    ],
  }))
  on('clock.now', () => ({ value: (relogio += 10) }))
  on('classic.Stop', () => ({}))

  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [
      { id: 'a1', type: 'subagent', status: 'running', description: 'tela Turnos', agent_type: 'construtor' },
    ],
  })

  const painel = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect((await painel.find({ type: 'Text', text: /Coz\. de linha: tela Turnos {2}h/ })) !== undefined).toBe(true)
  expect((await painel.find({ type: 'Text', text: /FOGO BAIXO/ }))?.text).toBe(
    '🍲 FOGO BAIXO: 1 em segundo plano',
  )
  expect(await painel.find({ type: 'Text', text: /antigo/ })).toBe(undefined)
  await painel.unmount()
})
