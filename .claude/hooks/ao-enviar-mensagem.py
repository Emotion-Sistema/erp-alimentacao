#!/usr/bin/env python3
"""Roda a cada mensagem do responsável.
1) Libera a publicação somente no turno em que a mensagem começa com "Publique tudo".
2) Avisa a cada 10% de contexto usado (10%, 20%...), para atualizar o cérebro e compactar
   a conversa, continuando no mesmo chat (decisão 0009).
Nunca bloqueia a mensagem: em caso de erro, sai em silêncio."""
import json, os, re, sys

def main():
    try:
        dados = json.load(sys.stdin)
    except Exception:
        return
    proj = os.environ.get("CLAUDE_PROJECT_DIR") or dados.get("cwd") or "."
    pasta = os.path.join(proj, ".claude")
    avisos = []

    # 1) Publicação
    flag = os.path.join(pasta, ".publicar-autorizado")
    texto = (dados.get("prompt") or "").strip()
    if re.match(r"^publique\s+tudo\b", texto, re.IGNORECASE):
        try:
            open(flag, "w").write("autorizado neste turno\n")
        except Exception:
            pass
        avisos.append("PUBLICAÇÃO AUTORIZADA neste turno pelo responsável. Siga a skill `publicar`.")
    else:
        try:
            os.remove(flag)
        except Exception:
            pass

    # 2) Contexto
    try:
        limite = int(os.environ.get("ERP_CONTEXTO_MAX", "1000000"))
        caminho = dados.get("transcript_path") or ""
        usado = 0
        if caminho and os.path.exists(caminho):
            with open(caminho, "rb") as f:
                f.seek(0, 2)
                tam = f.tell()
                f.seek(max(0, tam - 400000))
                linhas = f.read().decode("utf-8", "ignore").splitlines()
            for linha in reversed(linhas):
                try:
                    u = (json.loads(linha).get("message") or {}).get("usage")
                except Exception:
                    continue
                if u:
                    usado = (u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
                             + u.get("cache_creation_input_tokens", 0) + u.get("output_tokens", 0))
                    break
        pct = int(usado * 100 / limite) if limite else 0
        marca = os.path.join(pasta, ".contexto-" + re.sub(r"\W", "", str(dados.get("session_id", "s")))[:40])
        ja = 0
        if os.path.exists(marca):
            try:
                ja = int(open(marca).read().strip() or 0)
            except Exception:
                ja = 0
        if ja and pct < ja - 5:  # caiu: a conversa foi compactada, recomeça a contagem
            os.remove(marca)
            ja = 0
        nivel = (pct // 10) * 10
        if nivel and nivel > ja:
            open(marca, "w").write(str(nivel))
            avisos.append(
                f"AVISO AUTOMÁTICO: o contexto desta conversa está em cerca de {pct}%. "
                "Continue normalmente e use a skill `encerrar-sessao` no modo compactar: atualize o cérebro "
                "em silêncio e peça /compact só junto da próxima mensagem que já iria ao responsável "
                "(entrega pronta ou decisão dele), nunca numa mensagem só para isso.")
    except Exception:
        pass

    if avisos:
        print("\n".join(avisos))

main()
sys.exit(0)
