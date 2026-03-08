#!/bin/bash
# Run CRE workflow simulation with env vars loaded
# Requires: bun (https://bun.sh), cre (https://cre.chain.link/install.sh)
export PATH="$HOME/.bun/bin:$HOME/.cre/bin:$PATH"
set -a && source .env && set +a
cre workflow simulate ./workflow --target local-simulation --non-interactive --trigger-index 0 "$@"
