#!/bin/bash

MODEL_PATH="./models/gemma-4-E4B-it-Q4_K_M.gguf"
TEMPLATE_FILE="./models/templates/google-gemma-4-31B-it-interleaved.jinja"

llama-server \
  -m "$MODEL_PATH" \
  --chat-template-file "$TEMPLATE_FILE" \
  --cache-ram 2048 \
  -ctxcp 2 \
  -c 8192 \
  --n-gpu-layers 35  # Adjust based on your VRAM