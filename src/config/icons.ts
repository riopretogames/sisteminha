import {
  Home,
  LayoutDashboard,
  FileBarChart,
  Package,
  ShoppingCart,
  ClipboardList,
  DollarSign,
  FileText,
  Building2,
  Settings,
  TrendingUp,
  Boxes,
  Target,
  Users,
  Truck,
  Wrench,
  ShieldCheck,
  ScrollText,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registry de ícones.
 *
 * O menu guarda o NOME do ícone (string), não o componente. Isso mantém
 * `config/menu.ts` como dado puro e serializável — condição para o menu poder
 * migrar para o banco ou para um JSON remoto sem tocar em componente nenhum.
 *
 * Ícone novo no menu? Importe aqui e registre abaixo. É o único lugar que
 * precisa mudar.
 */
export const ICONS = {
  home: Home,
  dashboard: LayoutDashboard,
  reports: FileBarChart,
  package: Package,
  cart: ShoppingCart,
  clipboard: ClipboardList,
  money: DollarSign,
  file: FileText,
  company: Building2,
  settings: Settings,
  trending: TrendingUp,
  boxes: Boxes,
  target: Target,
  users: Users,
  truck: Truck,
  wrench: Wrench,
  shield: ShieldCheck,
  audit: ScrollText,
  brand: Gamepad2,
} as const;

export type IconName = keyof typeof ICONS;

/** Resolve um nome de ícone. Nome desconhecido cai num ícone neutro. */
export function getIcon(name: IconName | undefined): LucideIcon {
  if (!name) return FileText;
  return ICONS[name] ?? FileText;
}
