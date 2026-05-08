#!/bin/sh

mkdir -p target
cd ./target
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DCMAKE_INSTALL_PREFIX=/usr/local
cmake --build build --config Release -j
sudo cmake --install build
sudo ldconfig
# rm -rf llama.cpp