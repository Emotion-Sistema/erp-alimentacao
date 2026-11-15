// Página do salão para o navegador: usada onde o aplicativo não desenha
// painéis de mod. Lê cena.json (escrito pelo mod) a cada segundo.
export const PASTA_WEB = '/tmp/salao-web'

export const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salão</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #12151c; color: #eef0f3; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 28px; }
  #sala svg { width: 100%; height: auto; display: block; }
  h1 { font-size: 17px; margin: 12px 0 6px; letter-spacing: .02em; }
  #fogo-titulo.aceso { color: #ffb347; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 3px 0; display: flex; gap: 8px; }
  li.recuo { padding-left: 22px; opacity: .85; }
  li span.t { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .7; white-space: nowrap; }
  li span.r { overflow-wrap: anywhere; }
  .fraco { opacity: .6; }
  #sinal { position: fixed; right: 10px; bottom: 8px; font-size: 12px; opacity: .65; }
  #sinal.ruim { color: #ff7a66; opacity: 1; }
</style>
</head>
<body>
<main>
  <div id="sala"></div>
  <h1 id="titulo">Salão</h1>
  <ul id="cena"></ul>
  <h1 id="fogo-titulo"></h1>
  <ul id="fogo"></ul>
  <p class="fraco" id="pe"></p>
</main>
<div id="sinal">ligando…</div>
<script>
  let svgAtual = '', dados = null, recebido = 0, escritoVisto = 0
  const el = id => document.getElementById(id)
  const tempo = ms => {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
    const r = String(s % 60).padStart(2, '0')
    return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + r : m + ':' + r
  }
  const linha = (texto, desde, recuo) => {
    const li = document.createElement('li')
    if (recuo) li.className = 'recuo'
    const r = document.createElement('span'); r.className = 'r'; r.textContent = texto; li.append(r)
    if (desde !== undefined) {
      const t = document.createElement('span'); t.className = 't'
      t.textContent = tempo(dados.escrito - desde + (Date.now() - recebido)); li.append(t)
    }
    return li
  }
  const pintar = () => {
    if (!dados) return
    const parado = Date.now() - recebido > 25000
    el('sinal').textContent = parado ? 'sem sinal do Claude há ' + tempo(Date.now() - recebido) : 'ao vivo'
    el('sinal').className = parado ? 'ruim' : ''
    el('titulo').textContent = '🍽️ ' + dados.nomeNivel.toUpperCase() + (dados.pessoas > 0 ? ' · ' + dados.pessoas + ' em cena' : '')
    const cena = el('cena'); cena.replaceChildren()
    if (dados.emCena.length === 0) { const li = linha('Ninguém trabalhando agora.'); li.className = 'fraco'; cena.append(li) }
    for (const l of dados.emCena) cena.append(linha(l.emoji + ' ' + l.nome + ': ' + l.rotulo, l.desde, l.recuo))
    const n = dados.fogo.length
    el('fogo-titulo').textContent = n > 0 ? '🍲 FOGO BAIXO: ' + n + ' em segundo plano' : '✅ FOGO APAGADO: nada em segundo plano'
    el('fogo-titulo').className = n > 0 ? 'aceso' : ''
    const fogo = el('fogo'); fogo.replaceChildren()
    for (const f of dados.fogo) fogo.append(linha('🍲 ' + f.rotulo, f.desde, false))
    el('pe').textContent = 'Pratos entregues nesta sessão: ' + dados.feitos
    document.title = (n > 0 ? '🍲 ' + n + ' · ' : '') + 'Salão'
  }
  const buscar = async () => {
    try {
      const novo = await (await fetch('cena.json?' + Date.now(), { cache: 'no-store' })).json()
      if (novo.escrito !== escritoVisto) { escritoVisto = novo.escrito; recebido = Date.now(); dados = novo }
      // O desenho só é trocado quando muda, para a animação não recomeçar.
      if (novo.svg !== svgAtual) { svgAtual = novo.svg; el('sala').innerHTML = novo.svg }
    } catch { /* tenta de novo na próxima batida */ }
    pintar()
  }
  buscar(); setInterval(buscar, 1000)
</script>
</body>
</html>
`
