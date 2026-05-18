# syntax=docker/dockerfile:1

# ─── Stage 1: Install all dependencies ─────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Install curl + ca-certificates for any HTTP fetches during build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/client/package*.json ./apps/client/
COPY apps/server/package*.json ./apps/server/

RUN npm ci

# ─── Stage 2: Build client + server ──────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY apps/client ./apps/client
COPY apps/server ./apps/server

# Vite env vars must be present at build time to bake into the client bundle.
# Pass these with: fly deploy --build-arg VITE_CLERK_PUBLISHABLE_KEY=xxx ...
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Build both workspaces
RUN npm run build -w apps/client && npm run build -w apps/server

# Verify client build exists
RUN test -f apps/client/dist/index.html || (echo "Client build failed: index.html not found" && exit 1)

# ─── Stage 3: Build Elements C++ UI library ──────────────────────
FROM node:20-slim AS elements-builder
WORKDIR /build

# Install build dependencies for Elements
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    git \
    pkg-config \
    g++ \
    build-essential \
    libasio-dev \
    libgtk-3-dev \
    libcairo2-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone and build Elements (static library)
RUN git clone --depth 1 https://github.com/cycfi/elements.git \
    && cd elements \
    && mkdir build && cd build \
    && cmake .. \
        -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
        -DELEMENTS_HOST_UI_LIBRARY=gtk \
        -DELEMENTS_BUILD_EXAMPLES=OFF \
        -DCMAKE_BUILD_TYPE=Release \
    && make -j$(nproc) \
    && mkdir -p /usr/local/lib /usr/local/include /usr/local/include/ghc /usr/local/include/nonstd \
    && find . -name libelements.a -exec cp {} /usr/local/lib/ \; \
    && cp -r ../lib/include/elements /usr/local/include/ \
    && cp -r ../lib/include/elements.hpp /usr/local/include/ \
    && cp -r _deps/cycfi_infra-src/include/infra /usr/local/include/ \
    && find _deps/cycfi_infra-src/include -maxdepth 1 -name '*.hpp' -exec cp {} /usr/local/include/ \; \
    && GHC_HEADER_DIR="$(dirname "$(find /build/elements -path '*/ghc/filesystem.hpp' | head -n 1)")" \
    && if [ -n "$GHC_HEADER_DIR" ]; then cp -r "$(dirname "$GHC_HEADER_DIR")" /usr/local/include/; fi \
    && NONSTD_HEADER_DIR="$(dirname "$(find /build/elements -path '*/nonstd/string_view.hpp' | head -n 1)")" \
    && if [ -n "$NONSTD_HEADER_DIR" ]; then cp -r "$(dirname "$NONSTD_HEADER_DIR")" /usr/local/include/; fi \
    && ASIO_HEADER_DIR="$(dirname "$(find /build/elements -path '*/asio.hpp' | head -n 1)")" \
    && if [ -n "$ASIO_HEADER_DIR" ]; then \
         if [ -d "$ASIO_HEADER_DIR/asio" ]; then cp -r "$ASIO_HEADER_DIR/asio" /usr/local/include/; fi; \
         cp "$ASIO_HEADER_DIR/asio.hpp" /usr/local/include/; \
       fi

RUN if [ ! -f /usr/local/include/ghc/filesystem.hpp ]; then \
      git clone --depth 1 https://github.com/gulrak/filesystem.git /tmp/gulrak-filesystem \
      && cp -r /tmp/gulrak-filesystem/include/ghc /usr/local/include/ \
      && rm -rf /tmp/gulrak-filesystem; \
    fi
RUN if [ ! -f /usr/local/include/nonstd/string_view.hpp ]; then \
      git clone --depth 1 https://github.com/martinmoene/string-view-lite.git /tmp/string-view-lite \
      && cp -r /tmp/string-view-lite/include/nonstd /usr/local/include/ \
      && rm -rf /tmp/string-view-lite; \
    fi

RUN test -f /usr/local/include/ghc/filesystem.hpp \
    || (echo "Missing ghc/filesystem.hpp in elements-builder image" && exit 1)
RUN test -f /usr/local/include/nonstd/string_view.hpp \
    || (echo "Missing nonstd/string_view.hpp in elements-builder image" && exit 1)
RUN printf '#include <asio.hpp>\n' | g++ -E -xc++ - >/dev/null \
    || (echo "Missing compiler-visible asio.hpp in elements-builder image" && exit 1)

# Clone CLAP SDK (headers only)
RUN git clone --depth 1 https://github.com/free-audio/clap.git /tmp/clap \
    && mkdir -p /usr/local/include/clap \
    && cp -r /tmp/clap/include/* /usr/local/include/ \
    && rm -rf /tmp/clap

# Clone clap-helpers (headers only)
RUN git clone --depth 1 https://github.com/free-audio/clap-helpers.git /tmp/clap-helpers \
    && cp -r /tmp/clap-helpers/include/* /usr/local/include/ \
    && rm -rf /tmp/clap-helpers

# Clone DPF (DISTRHO Plugin Framework)
RUN git clone --depth 1 --recursive https://github.com/DISTRHO/DPF.git /usr/local/share/dpf

# ─── Stage 4: Production runtime ─────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVER_PORT=8080
ENV DPF_PATH=/usr/local/share/dpf
ENV FAUST_INCLUDE_PATH=/usr/share/faust
ENV ELEMENTS_INCLUDE_PATH=/usr/local/include
ENV ELEMENTS_LIB_PATH=/usr/local/lib
ENV CLAP_INCLUDE_PATH=/usr/local/include

# Install Faust compiler + C++ toolchain + Elements runtime deps + Python analysis tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    faust \
    faust-common \
    g++ \
    build-essential \
    libc6-dev \
    cmake \
    pkg-config \
    libasio-dev \
    libgtk-3-dev \
    libcairo2-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libwebp-dev \
    python3 \
    python3-numpy \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Copy Elements headers and static library from builder
COPY --from=elements-builder /usr/local/include/elements /usr/local/include/elements
COPY --from=elements-builder /usr/local/include/elements.hpp /usr/local/include/elements.hpp
COPY --from=elements-builder /usr/local/lib/libelements.a /usr/local/lib/libelements.a
COPY --from=elements-builder /usr/local/include/infra /usr/local/include/infra
COPY --from=elements-builder /usr/local/include/ghc /usr/local/include/ghc
COPY --from=elements-builder /usr/local/include/nonstd /usr/local/include/nonstd
COPY --from=elements-builder /usr/local/include/clap /usr/local/include/clap

# Copy DPF from builder
COPY --from=elements-builder /usr/local/share/dpf /usr/local/share/dpf

RUN test -f /usr/local/include/ghc/filesystem.hpp \
    || (echo "Missing ghc/filesystem.hpp in runtime image" && exit 1)
RUN test -f /usr/local/include/nonstd/string_view.hpp \
    || (echo "Missing nonstd/string_view.hpp in runtime image" && exit 1)
RUN printf '#include <asio.hpp>\n' | g++ -E -xc++ - >/dev/null \
    || (echo "Missing compiler-visible asio.hpp in runtime image" && exit 1)

# Sanity check: fail build if faust is missing
RUN faust --version

# Install custom render / analysis binaries
COPY apps/server/scripts/hayashi-faust-render.py /usr/local/bin/hayashi-faust-render
COPY apps/server/scripts/hayashi-essentia-analyze.py /usr/local/bin/hayashi-essentia-analyze
RUN chmod +x /usr/local/bin/hayashi-faust-render /usr/local/bin/hayashi-essentia-analyze

# Only runtime deps
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
RUN npm ci -w apps/server --omit=dev && npm cache clean --force

# Built artifacts
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/src/export/*.cpp ./apps/server/dist/export/

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/server.js"]
