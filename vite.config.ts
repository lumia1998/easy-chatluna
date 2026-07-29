import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindCss from "@tailwindcss/vite";
import autoprefixer from "autoprefixer";

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

    plugins: [react(), tailwindCss()],
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
