# syntax=docker/dockerfile:1
#
# teaman in a box: the CLI and its whole toolchain, nothing else. Mount a vault
# at /vault and run any teaman command against it.
#
#   docker build -t teaman .
#   docker run --rm -v "$PWD:/vault" -u "$(id -u):$(id -g)" teaman teaman build
#   docker run --rm -it -v "$PWD:/vault" -u "$(id -u):$(id -g)" teaman   # a shell
#
# The image is built from `npm pack`, so it contains exactly the published
# package (the `files` list in package.json) plus its runtime dependencies —
# no repo source, no dev dependencies, no test tooling.

# ── stage 1: pack the engine exactly as npm publishes it ──────────────────
FROM node:24-slim AS pack
WORKDIR /src
COPY . .
RUN mkdir -p /pack && npm pack --pack-destination /pack

# ── stage 2: the image itself ─────────────────────────────────────────────
# Debian slim, not Alpine: pagefind and the typst compiler ship glibc-only
# prebuilt binaries for linux-x64/arm64, so a musl base would have no engine
# to run for the search and reference-PDF stages.
FROM node:24-slim

# The CLI runs Astro/Slidev with cwd = the engine dir and caches build
# artifacts there (.astro/, .diagram-cache/, .reference-cache/), and every
# other scratch path derives from HOME/TMPDIR. Keeping all of them world
# writable is what lets the container run as an arbitrary `--user`, so the
# files it writes into a mounted vault are owned by the caller.
ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_ENV=production

COPY --from=pack /pack/*.tgz /tmp/teaman.tgz
RUN npm install --prefix /opt/teaman --omit=dev --no-audit --no-fund --loglevel=error /tmp/teaman.tgz \
    && ln -s /opt/teaman/node_modules/.bin/teaman /usr/local/bin/teaman \
    && rm -rf /tmp/teaman.tgz /tmp/.npm /root/.npm /opt/teaman/node_modules/.cache \
    && find /opt/teaman/node_modules -name '*.map' -type f -delete \
    && mkdir -p /opt/teaman/node_modules/@zshoham/teaman/.diagram-cache \
                /opt/teaman/node_modules/@zshoham/teaman/.reference-cache \
    && chmod -R a+rwX /opt/teaman

# `teaman dev` / `teaman preview`, given `--host`, serve on this port.
EXPOSE 4321

# Default vault mount point: a bare `teaman build` builds the cwd.
WORKDIR /vault

# No entrypoint wrapper: the image is a machine with teaman installed. The
# default command is a shell, so `docker run -it` drops you in with the CLI on
# PATH, and any command after the image name runs instead.
CMD ["bash"]
