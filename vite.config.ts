import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
    plugins: [dts({ exclude: ["tests/**"] })],
    build: {
        lib: {
            entry: "src/index.ts",
            name: "Rux",
            fileName: "index",
            formats: ["es", "cjs"]
        }
    }
})
