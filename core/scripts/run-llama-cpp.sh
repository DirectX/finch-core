#!/bin/bash

MODEL_PATH="./core/models/gemma-4-E4B-it-Q4_K_M.gguf"
TEMPLATE_FILE="./core/models/templates/google-gemma-4-31B-it-interleaved.jinja"

llama-server \
  -m "$MODEL_PATH" \
  --chat-template-file "$TEMPLATE_FILE" \
  --cache-ram 2048 \
  --ctx-size 8192 \
  --n-predict 512 \
  --n-gpu-layers 99  # Adjust based on your VRAM