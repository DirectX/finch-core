# Typst WASM Integration Plan

## Overview
This document outlines the plan for integrating Typst WASM into the finch-core web application for real-time client-side preview of legal documents.

## Current State
- ✅ Rust backend has full Typst rendering capabilities (`core/src/renderers/typst_renderer.rs`)
- ✅ Backend can render Typst to PDF via CLI
- ✅ `@brief-jetzt/wasm-typst` package installed in web app
- ⏳ Client-side WASM integration pending

## Goals
1. Enable real-time preview of Typst documents in the browser
2. Reduce server load by moving rendering to the client
3. Provide instant feedback during document editing
4. Support incremental compilation for large documents

## Implementation Steps

### Phase 1: Basic WASM Integration
1. **Initialize WASM Module**
   - Load `@brief-jetzt/wasm-typst` in a React component
   - Handle async module initialization
   - Set up error boundaries for WASM failures

2. **Font Management**
   - Bundle required fonts or load from CDN
   - Configure font fallbacks
   - Handle font loading states

3. **Basic Rendering**
   - Compile simple Typst content to SVG
   - Display SVG output in preview component
   - Handle compilation errors gracefully

### Phase 2: Advanced Features
1. **Incremental Compilation**
   - Debounce compilation on content changes
   - Cache compilation results
   - Show compilation progress

2. **Multi-page Support**
   - Render documents with multiple pages
   - Add page navigation controls
   - Support page zoom and pan

3. **Resource Management**
   - Handle image references in Typst documents
   - Support bibliography files
   - Manage external resources

### Phase 3: Integration with Clause System
1. **Clause Highlighting**
   - Map clause IDs to rendered positions
   - Highlight clauses on hover
   - Sync scroll between source and preview

2. **Interactive Annotations**
   - Show review status on rendered clauses
   - Display comments inline
   - Enable click-to-review workflow

## Technical Considerations

### WASM Package Options
1. **@brief-jetzt/wasm-typst** (Currently installed)
   - Pros: Simple, lightweight, direct Typst bindings
   - Cons: Limited documentation, basic features
   - Size: ~16.7MB WASM file

2. **typst.ts** (Alternative)
   - Pros: Comprehensive, multiple rendering modes, better docs
   - Cons: Larger bundle, more complex setup
   - Features: SSR support, incremental rendering, artifact format

### Performance Optimization
- Lazy load WASM module (code splitting)
- Use Web Workers for compilation
- Implement virtual scrolling for large documents
- Cache compiled outputs in IndexedDB

### Browser Compatibility
- Target modern browsers with WASM support
- Provide fallback to server-side rendering
- Test on Chrome, Firefox, Safari, Edge

## Alternative Approach: Server-Side Rendering
If WASM integration proves too complex, consider:
1. Use existing Rust backend for rendering
2. Implement SSE for incremental updates
3. Cache rendered PDFs/SVGs on server
4. Stream updates to client

## Resources
- [Typst Documentation](https://typst.app/docs/)
- [@brief-jetzt/wasm-typst on npm](https://www.npmjs.com/package/@brief-jetzt/wasm-typst)
- [typst.ts GitHub](https://github.com/Myriad-Dreamin/typst.ts)
- [WASM Typst Studio Example](https://github.com/automataIA/wasm-typst-studio-rs)

## Next Steps
1. Create a proof-of-concept with basic Typst compilation
2. Benchmark WASM vs server-side rendering performance
3. Decide on final architecture based on results
4. Implement chosen approach incrementally

## Status
- **Current Phase**: Planning / Package Installation
- **Blocker**: Requires dedicated development time for WASM integration
- **Recommendation**: Start with server-side rendering, add WASM as enhancement
