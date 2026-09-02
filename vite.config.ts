import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    // 8080 e o endereco de sempre (http://localhost:8080) — nada muda no dia
    // a dia. A variavel PORT existe so para quando ja ha um servidor de pe
    // nessa porta e e preciso subir um segundo em paralelo, para comparar duas
    // versoes lado a lado. Sem a variavel definida, cai no 8080 de sempre.
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
