#!/usr/bin/env bash
# Confere que a linha de colar-no-terminal.txt é exatamente o inicio.sh (CI).
set -euo pipefail
cd "$(dirname "$0")"
linha="$(cat colar-no-terminal.txt)"
b64="$(sed -E 's/^echo ERP ; echo ([A-Za-z0-9+\/=]+) \| base64 -d.*$/\1/' <<<"$linha")"
cmp <(base64 -d <<<"$b64") inicio.sh && echo "colar-no-terminal.txt confere com inicio.sh"
