import type { SVGProps } from "react";

type SocialIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/**
 * Ícones de marca (Instagram, Facebook, YouTube) como SVG inline.
 *
 * A lucide-react (biblioteca usada em todo o resto do Portal via
 * `DynamicIcon`) não inclui logotipos de rede social, só ícones
 * genéricos — pedir esses nomes ao `DynamicIcon` cai no ícone padrão
 * (um círculo vazio). Esses três componentes reproduzem o traço desses
 * logos no mesmo estilo visual dos ícones lucide-react usados no resto
 * do app (viewBox 24x24, `currentColor`, `stroke-width: 2`, cantos
 * arredondados), pra ficarem visualmente consistentes lado a lado.
 *
 * Uso igual a um ícone lucide-react: tamanho via `size` (padrão 24) e
 * cor via classe Tailwind de texto (`text-nord-gray`, por exemplo) ou
 * `style={{ color }}`, porque o traço usa `currentColor`.
 *
 * ```tsx
 * <InstagramIcon size={16} className="text-nord-blue-light" />
 * ```
 */
const BASE_PROPS: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function InstagramIcon({ size = 24, ...props }: SocialIconProps) {
  return (
    <svg width={size} height={size} {...BASE_PROPS} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function FacebookIcon({ size = 24, ...props }: SocialIconProps) {
  return (
    <svg width={size} height={size} {...BASE_PROPS} {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function YoutubeIcon({ size = 24, ...props }: SocialIconProps) {
  return (
    <svg width={size} height={size} {...BASE_PROPS} {...props}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}
