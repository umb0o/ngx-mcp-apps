import { type ApplicationBuilderOptions } from '@angular/build';

type Optimization = ApplicationBuilderOptions['optimization'];

/**
 * The same optimization, without critical CSS inlining. In a single file every style is inline already,
 * and the critical copy would embed the fonts and images of the first screen twice.
 */
export function withoutCriticalCss(optimization: Optimization): NonNullable<Optimization> {
  const all = optimization ?? true;
  const { scripts, styles, fonts } =
    typeof all === 'object' ? all : { scripts: all, styles: all, fonts: all };
  const minify = typeof styles === 'object' ? styles.minify : styles;
  return {
    scripts: scripts ?? true,
    styles: {
      ...(typeof styles === 'object' ? styles : {}),
      minify: minify ?? true,
      inlineCritical: false,
    },
    fonts: fonts ?? true,
  };
}
