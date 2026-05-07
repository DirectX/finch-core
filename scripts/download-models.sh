#!/bin/sh

# cd ./models
# curl -L --max-redirs 5 -O https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf?download=true

mkdir -p templates
cd ./templates
curl -L -o google-gemma-4-31B-it-interleaved.jinja https://raw.githubusercontent.com/ggml-org/llama.cpp/refs/heads/master/models/templates/google-gemma-4-31B-it-interleaved.jinja