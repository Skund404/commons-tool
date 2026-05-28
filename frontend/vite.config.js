import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// Frontend dev server runs on 8431 and proxies /api to the Go backend on 8430.
// In production the Go binary serves dist/ over its own HTTP server.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 8431,
        host: "127.0.0.1",
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:8430",
                changeOrigin: false,
            },
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 1024,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ["react", "react-dom"],
                    tanstack: ["@tanstack/react-query"],
                    radix: [
                        "@radix-ui/react-dialog",
                        "@radix-ui/react-dropdown-menu",
                        "@radix-ui/react-popover",
                        "@radix-ui/react-radio-group",
                        "@radix-ui/react-select",
                        "@radix-ui/react-switch",
                        "@radix-ui/react-tabs",
                        "@radix-ui/react-tooltip",
                    ],
                    icons: ["lucide-react"],
                },
            },
        },
    },
});
