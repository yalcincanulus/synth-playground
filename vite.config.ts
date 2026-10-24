import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** The render check's reference results (render.html), kept in the repo so later engines are compared with it. */
const REFERENCE_FILE = resolve(import.meta.dirname, "src/render/reference.json");

/** Dev server only: GET reads the render check's reference, POST replaces it. */
function renderReference(): Plugin {
  return {
    name: "render-reference",
    configureServer(server) {
      server.middlewares.use("/__render-reference", async (req, res) => {
        if (req.method === "POST") {
          let body = "";
          for await (const chunk of req) body += chunk;
          await writeFile(REFERENCE_FILE, JSON.stringify(JSON.parse(body)) + "\n");
          res.statusCode = 204;
          return res.end();
        }
        try {
          res.setHeader("content-type", "application/json");
          res.end(await readFile(REFERENCE_FILE));
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), renderReference()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        probe: resolve(import.meta.dirname, "probe.html"),
        render: resolve(import.meta.dirname, "render.html"),
      },
    },
  },
});
