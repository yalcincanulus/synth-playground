# Build: typecheck + Vite build, then compile a Bun server with dist/ embedded into one executable.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build \
 && bun server/embed.ts \
 && bun build --compile --minify --sourcemap server/main.ts --outfile synth

# Run: just the executable on a minimal glibc image, as a non-root user.
FROM gcr.io/distroless/base-debian12:nonroot
COPY --from=build /app/synth /synth
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD ["/synth", "health"]
ENTRYPOINT ["/synth"]
