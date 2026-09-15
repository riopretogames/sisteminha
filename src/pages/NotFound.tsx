import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * A página de "não existe".
 *
 * Duas coisas mudaram em 14/09, na revisão antes de publicar:
 *
 *   • O link de volta era um `<a href="/">` cru. Com o sistema morando em
 *     www.riopretogames.com.br/sisteminha, "/" é a raiz do SITE DA LOJA — o
 *     link jogaria a pessoa para fora do sistema. `<Link>` respeita a base.
 *   • O texto era em inglês ("Oops! Page not found"), numa tela que só quem
 *     não é programador vai ver: o vendedor que digitou o endereço errado.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: tentativa de abrir uma tela que não existe:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Essa tela não existe.</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Voltar para o início
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
