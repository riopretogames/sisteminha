import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // ONDE O SISTEMA MORA NO ENDEREÇO.
  //
  // Decisão do Felipe em 14/09: o sisteminha vai para a internet DENTRO do
  // site da loja, em www.riopretogames.com.br/sisteminha — o botão "Login" do
  // site leva para lá. Para isso, todo arquivo que a página pede (scripts,
  // ícones) precisa começar com /sisteminha/, senão o navegador procura na
  // raiz do site e não acha.
  //
  // No dia a dia nada muda: sem a variável, a base é "/" e o endereço continua
  // http://localhost:8080. A variável só é ligada na publicação (Vercel), e
  // fica em variável de ambiente — não no código — para o mesmo build servir
  // aos dois lugares sem ninguém precisar lembrar de trocar.
  base: process.env.VITE_BASE_PATH || '/',
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
