import { describe, expect, it } from 'vitest';
import { withoutCriticalCss } from '../src/application/optimization';

describe('withoutCriticalCss', () => {
  it('keeps the default optimization and turns critical CSS inlining off', () => {
    expect(withoutCriticalCss(undefined)).toEqual({
      scripts: true,
      styles: { minify: true, inlineCritical: false },
      fonts: true,
    });
    expect(withoutCriticalCss(true)).toEqual(withoutCriticalCss(undefined));
  });

  it('keeps a build without optimization as it is', () => {
    expect(withoutCriticalCss(false)).toEqual({
      scripts: false,
      styles: { minify: false, inlineCritical: false },
      fonts: false,
    });
  });

  it('keeps the other choices of an optimization object', () => {
    expect(
      withoutCriticalCss({
        scripts: false,
        styles: { minify: true, inlineCritical: true, removeSpecialComments: false },
        fonts: { inline: false },
      }),
    ).toEqual({
      scripts: false,
      styles: { minify: true, inlineCritical: false, removeSpecialComments: false },
      fonts: { inline: false },
    });
    expect(withoutCriticalCss({ styles: false })).toEqual({
      scripts: true,
      styles: { minify: false, inlineCritical: false },
      fonts: true,
    });
    expect(withoutCriticalCss({ styles: {} })).toEqual({
      scripts: true,
      styles: { minify: true, inlineCritical: false },
      fonts: true,
    });
  });
});
