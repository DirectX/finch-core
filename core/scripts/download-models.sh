#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"

download_if_missing() {
    local url="$1"
    local dest="$2"
    if [ -f "$dest" ]; then
        echo "Already exists, skipping: $dest"
    else
        echo "Downloading: $dest"
        curl -L --max-redirs 5 -o "$dest" "$url"
    fi
}

mkdir -p "$MODELS_DIR/templates"

download_if_missing \
    "https://raw.githubusercontent.com/ggml-org/llama.cpp/refs/heads/master/models/templates/google-gemma-4-31B-it-interleaved.jinja" \
    "$MODELS_DIR/templates/google-gemma-4-31B-it-interleaved.jinja"

# Uncomment to download the model weights (~4 GB):
# download_if_missing \
#     "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf?download=true" \
#     "$MODELS_DIR/gemma-4-E4B-it-Q4_K_M.gguf"
