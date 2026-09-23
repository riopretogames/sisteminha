import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // O padrão do Vitest é 5 segundos, e o PRIMEIRO teste de cada tela estoura
    // isso quando a suíte inteira roda junta: é ele que paga a compilação do
    // módulo, e são 40+ arquivos disputando a máquina. Rodando o arquivo
    // sozinho o mesmo teste leva ~1s. Aumentar o limite evita a falha que
    // aparece e some sem ninguém ter mexido em nada.
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
