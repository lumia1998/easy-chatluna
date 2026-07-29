import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindCss from "@tailwindcss/vite";
import autoprefixer from "autoprefixer";
import type { Connect, Plugin } from "vite";

const LOCAL_AI_PROXY_PATH = "/__easy_chatluna_ai_proxy";

function localAIProxy(): Plugin {
    const middleware: Connect.NextHandleFunction = async (request, response, next) => {
        if (!request.url?.startsWith(LOCAL_AI_PROXY_PATH)) {
            next();
            return;
        }

        try {
            const requestUrl = new URL(request.url, "http://localhost");
            const targetValue = requestUrl.searchParams.get("url");
            if (!targetValue) {
                response.statusCode = 400;
                response.end("Missing target URL");
                return;
            }

            const target = new URL(targetValue);
            if (target.protocol !== "http:" && target.protocol !== "https:") {
                response.statusCode = 400;
                response.end("Unsupported target protocol");
                return;
            }

            const headers = new Headers();
            for (const name of [
                "accept",
                "authorization",
                "content-type",
                "anthropic-version",
                "openai-beta",
                "x-api-key",
                "x-goog-api-key",
            ]) {
                const value = request.headers[name];
                if (typeof value === "string") headers.set(name, value);
            }

            const method = request.method ?? "GET";
            const bodyChunks: Buffer[] = [];
            if (method !== "GET" && method !== "HEAD") {
                for await (const chunk of request) {
                    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
            }

            const upstream = await fetch(target, {
                method,
                headers,
                body: bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined,
                signal: AbortSignal.timeout(5 * 60_000),
            });
            response.statusCode = upstream.status;
            for (const name of ["content-type", "cache-control", "x-request-id"]) {
                const value = upstream.headers.get(name);
                if (value) response.setHeader(name, value);
            }

            if (!upstream.body) {
                response.end();
                return;
            }
            for await (const chunk of upstream.body) {
                response.write(Buffer.from(chunk));
            }
            response.end();
        } catch (error) {
            response.statusCode = 502;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
                error: {
                    message: error instanceof Error
                        ? `本地代理请求失败：${error.message}`
                        : "本地代理请求失败",
                },
            }));
        }
    };

    return {
        name: "easy-chatluna-local-ai-proxy",
        configureServer(server) {
            server.middlewares.use(middleware);
        },
        configurePreviewServer(server) {
            server.middlewares.use(middleware);
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    // Keep production assets relative so the app works from a GitHub Pages
    // project path (for example /easy-chatluna/) as well as a custom domain.
    base: "./",
    css: {
        postcss: {
            plugins: [autoprefixer()],
        },
    },

    plugins: [react(), tailwindCss(), localAIProxy()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        rollupOptions: {
            /*  external: ["react", "react-dom", "react-router"],
            output: {
                format: "cjs",
                globals: {
                    react: "React",
                    "react-dom": "ReactDOM",
                    "react-router": "ReactRouter",
                },
            }, */
        },
    },
});
