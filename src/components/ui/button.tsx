import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Verde = SALVAR, confirmar, aprovar, concluir. Regra do Felipe
        // (09/08, revista em 23/08): a cor do botão ensina o que ele faz, no
        // sistema inteiro. Ver `lib/acoes.ts`.
        //
        // Em 23/08 o "salvar" MUDOU de azul para verde, e essa troca sozinha
        // resolve o "tudo azul": salvar é a ação mais comum do sistema, então
        // enquanto ela foi azul, quase todo botão era azul.
        sucesso: "bg-emerald-600 text-white hover:bg-emerald-700",
        // Âmbar = ação que interrompe sem destruir (recusar orçamento, colocar
        // em espera). Nem verde, nem vermelho.
        alerta: "bg-amber-500 text-white hover:bg-amber-600",
        // Preto = ação neutra de peso: imprimir, exportar, gerar. Não confirma
        // nada e não desfaz nada, mas também não é secundária.
        neutra: "bg-slate-800 text-white hover:bg-slate-900",
        // Vermelho contornado = CANCELAR de diálogo. É vermelho, como o Felipe
        // pediu, sem competir com o botão principal ao lado: sair de um
        // formulário não é o mesmo peso que apagar um cadastro, e dois botões
        // sólidos brigando fazem a pessoa clicar no errado com pressa.
        cancelar:
          "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
