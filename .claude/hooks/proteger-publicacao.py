#!/usr/bin/env python3
"""Rede de segurança antes de comandos e ferramentas.
- push forçado: sempre bloqueado
- push direto na main: sempre bloqueado (use PR)
- push para producao, comando de publicação e alteração na hospedagem:
  só no turno em que o responsável escreveu "Publique tudo"."""
import json, os, re, subprocess, sys

def bloquear(msg):
    print("BLOQUEADO pelas regras do projeto: " + msg, file=sys.stderr)
    sys.exit(2)

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

proj = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or "."
autorizado = os.path.exists(os.path.join(proj, ".claude", ".publicar-autorizado"))
ferramenta = d.get("tool_name") or ""
SEM_FRASE = ('isto vai para o ar e o responsável não escreveu "Publique tudo" nesta mensagem. '
             "Deixe pronto, explique o que seria publicado e peça a frase.")

if ferramenta.startswith("mcp__"):
    if "hostinger" in ferramenta.lower():
        acao = ferramenta.split("__")[-1].lower()
        leitura = re.search(r"(get|list|read|show|status|search|check)", acao) and not re.search(
            r"(create|update|delete|remove|set|start|stop|restart|reset|recreate|purchase|install|attach|restore|activate|deactivate)", acao)
        if not leitura and not autorizado:
            bloquear(SEM_FRASE)
    sys.exit(0)

cmd = ((d.get("tool_input") or {}).get("command")) or ""
if not cmd:
    sys.exit(0)

if re.search(r"(infra/publicar|publicar-producao|deploy[-_ ]prod)", cmd) and not autorizado:
    bloquear(SEM_FRASE)
if re.search(r"gh\s+workflow\s+run", cmd) and re.search(r"(prod|publicar)", cmd, re.I) and not autorizado:
    bloquear(SEM_FRASE)

if re.search(r"git\s+push", cmd):
    if re.search(r"(--force|--force-with-lease|\s-f(\s|$)|\s\+\S+)", cmd):
        bloquear("push forçado não é permitido.")
    if re.search(r"(\s|:)(main|master)(\s|$)", cmd):
        bloquear("push direto na main não é permitido. Use branch e PR.")
    try:
        atual = subprocess.run(["git", "-C", proj, "rev-parse", "--abbrev-ref", "HEAD"],
                               capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        atual = ""
    if atual in ("main", "master"):
        bloquear("você está na main. Use branch e PR.")
    if (re.search(r"(\s|:)producao(\s|$)", cmd) or atual == "producao") and not autorizado:
        bloquear(SEM_FRASE)
sys.exit(0)
