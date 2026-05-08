#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"
MODEL_PATH="$MODELS_DIR/gemma-4-E4B-it-Q4_K_M.gguf"
TEMPLATE_FILE="$MODELS_DIR/templates/google-gemma-4-31B-it-interleaved.jinja"

llama-server \
  -m "$MODEL_PATH" \
  --chat-template-file "$TEMPLATE_FILE" \
  --cache-ram 4096 \
  --ctx-size 10000 \
  --n-predict 512
