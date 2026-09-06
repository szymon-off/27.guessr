/** Public assets resolve against Vite's base so the build works on a subpath. */
export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

interface Props {
  className?: string;
  alt?: string;
}

/**
 * The splatter "27" mark. It ships white-on-transparent, and the light theme
 * flips it to ink via the --logo-filter token.
 */
export function Logo({ className = 'brand-mark', alt = '27' }: Props) {
  return <img src={assetUrl('logo-27.png')} className={className} alt={alt} />;
}
