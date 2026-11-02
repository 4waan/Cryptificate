# Cryptificate in one image: the pinned Lean toolchain with the built
# certificate library (Mathlib's compiled library included), the Rust engine,
# the Rust toolchain and C linker that native experiments compile with, the
# local service and the workbench.
#
#   docker build -t cryptificate .
#   docker run --rm -p 127.0.0.1:4173:4173 cryptificate serve --host 0.0.0.0
#
# The service binds 127.0.0.1 inside the container unless --host or
# CRYPTIFICATE_HOST says otherwise. Change its port with -e PORT=…, which the
# health check also reads, not with --port. Usage and limits: docs/docker.md.

# Base images, pinned by tag and by the digest of their multi-platform index.
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4
ARG RUST_IMAGE=rust:1.97.1-slim-trixie@sha256:8e8cf8f7fd54a2d23d5a743b3a03f56e26b6c774276c33fa0595111704ebb15c
ARG NODE_IMAGE=node:22.23.4-trixie-slim@sha256:2117f713a417f3aff682ac8f5bc2ebbdf1beed51f36e67ab1e0fd3866b6d2d8f

# ---------------------------------------------------------------- Lean
# elan, the toolchain named in lean/lean-toolchain, Mathlib's build cache and
# `lake build` of the certificate library, as in scripts/setup.sh.
FROM ${DEBIAN_IMAGE} AS lean
ARG TARGETARCH
ARG ELAN_VERSION=4.2.4
ARG ELAN_SHA256_AMD64=42b94d4244e8353142c456ec0e4ca6528fd898a6c604d4059f494e706e431f63
ARG ELAN_SHA256_ARM64=05febd124d84ebf994b2e7479922a5650b1e950c17ae3bd1ddd776b65bb72bf9
ENV ELAN_HOME=/opt/elan \
    PATH=/opt/elan/bin:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) arch=x86_64; sum="$ELAN_SHA256_AMD64" ;; \
      arm64) arch=aarch64; sum="$ELAN_SHA256_ARM64" ;; \
      *) echo "no elan release pinned for ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -sSfL -o /tmp/elan.tar.gz \
      "https://github.com/leanprover/elan/releases/download/v${ELAN_VERSION}/elan-${arch}-unknown-linux-gnu.tar.gz"; \
    echo "${sum}  /tmp/elan.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/elan.tar.gz -C /tmp; \
    /tmp/elan-init -y --default-toolchain none --no-modify-path; \
    rm -f /tmp/elan.tar.gz /tmp/elan-init
WORKDIR /opt/cryptificate/lean
COPY lean/lean-toolchain lean/lakefile.toml lean/lake-manifest.json ./
RUN elan toolchain install "$(tr -d '[:space:]' < lean-toolchain)"
# Clones the pinned packages and downloads Mathlib's compiled library.
RUN lake exe cache get
COPY lean/ ./
RUN lake build

# ---------------------------------------------------------------- Rust
# The engine in release mode, plus every crate in Cargo.lock in the cargo
# cache, so that native variants build later without network access.
FROM ${RUST_IMAGE} AS engine
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
RUN cargo build --release --locked --bin cryptificate-engine \
 && cargo fetch --locked

# ---------------------------------------------------------------- Node
# The schema package, the service and the workbench.
FROM ${NODE_IMAGE} AS web
WORKDIR /src
COPY package.json package-lock.json ./
# npm ci runs the schema package's `prepare` (tsc), so its sources come first.
COPY packages/schema/ packages/schema/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY assets/brand/ assets/brand/
COPY apps/ apps/
RUN npm run build -w packages/schema \
 && npm run build -w apps/server \
 && npm run build -w apps/web

# ---------------------------------------------------------------- Node binary
FROM ${NODE_IMAGE} AS node

# ---------------------------------------------------------------- Runtime
FROM ${DEBIAN_IMAGE} AS runtime
ARG CRYPTIFICATE_VERSION=0.1.0
ARG CRYPTIFICATE_REVISION=
LABEL org.opencontainers.image.title="Cryptificate" \
      org.opencontainers.image.description="Lean-checked certificates for cipher diffusion layers and their circuits, with native Rust measurements and replayable evidence bundles" \
      org.opencontainers.image.source="https://github.com/4waan/Cryptificate" \
      org.opencontainers.image.url="https://github.com/4waan/Cryptificate" \
      org.opencontainers.image.documentation="https://github.com/4waan/Cryptificate/blob/main/docs/docker.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${CRYPTIFICATE_VERSION}" \
      org.opencontainers.image.revision="${CRYPTIFICATE_REVISION}" \
      org.opencontainers.image.base.name="docker.io/library/debian:trixie-slim"

# git: Lake checks each package's revision with git before `lake env lean`.
#   Copying between stages changes inodes and ctimes but keeps mtimes, so git
#   compares mtime and size only and does not rehash the packages on every check.
# gcc, libc6-dev: the linker rustc uses for the generated native variants.
# tini: forwards signals to the service and reaps Lean and cargo processes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git gcc libc6-dev tini \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system core.checkStat minimal \
 && git config --system core.trustctime false \
 && groupadd --gid 1000 cryptificate \
 && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin cryptificate \
 && install -d -o 1000 -g 1000 /var/lib/cryptificate /work

ENV ELAN_HOME=/opt/elan \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    CARGO_NET_OFFLINE=true \
    PATH=/opt/elan/bin:/usr/local/cargo/bin:$PATH \
    CRYPTIFICATE_ROOT=/opt/cryptificate \
    CRYPTIFICATE_HOME=/var/lib/cryptificate \
    CRYPTIFICATE_ENGINE=/usr/local/bin/cryptificate-engine \
    CRYPTIFICATE_LEAN_DIR=/opt/cryptificate/lean \
    CRYPTIFICATE_REVISION=${CRYPTIFICATE_REVISION} \
    CRYPTIFICATE_CONTAINER=1 \
    PORT=4173

COPY --from=node /usr/local/bin/node /usr/local/bin/node
# The Rust toolchain and the cargo cache; cargo writes its lock files under CARGO_HOME.
COPY --from=engine --chown=1000:1000 /usr/local/rustup /usr/local/rustup
COPY --from=engine --chown=1000:1000 /usr/local/cargo /usr/local/cargo
COPY --from=engine /src/target/release/cryptificate-engine /usr/local/bin/cryptificate-engine
# The Lean toolchain, and lean/ with its .lake: the packages (Mathlib's compiled
# library included) and the built certificate library.
COPY --from=lean --chown=1000:1000 /opt/elan /opt/elan
COPY --from=lean --chown=1000:1000 /opt/cryptificate/lean /opt/cryptificate/lean

WORKDIR /opt/cryptificate
COPY package.json Cargo.lock LICENSE ./
# Recorded with native results: the kernels every variant links against and the harness.
COPY crates/kernels/ crates/kernels/
COPY crates/native/ crates/native/
# The digest the refinement proofs were extracted from. The proofs themselves are
# not checked in the image, so rust.refinement reads not_established here.
COPY refinement/extract.sha256 refinement/extract.sha256
COPY examples/designs/ examples/designs/
COPY examples/programs/ examples/programs/
COPY --from=web /src/packages/schema/package.json packages/schema/package.json
COPY --from=web /src/packages/schema/dist/src/ packages/schema/dist/src/
COPY --from=web /src/apps/server/package.json apps/server/package.json
COPY --from=web /src/apps/server/dist/src/ apps/server/dist/src/
COPY --from=web /src/apps/web/dist/ apps/web/dist/
RUN mkdir -p node_modules/@cryptificate \
 && ln -s ../../packages/schema node_modules/@cryptificate/schema

USER 1000:1000
# Fail the build early if, as the runtime user and from these files alone, Lake
# cannot resolve the pinned packages or the service cannot load.
RUN cd /opt/cryptificate/lean && lake env lean --version \
 && node /opt/cryptificate/apps/server/dist/src/cli.js --version
WORKDIR /work
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '4173') + '/api/capabilities').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/cryptificate/apps/server/dist/src/cli.js"]
CMD ["serve"]
