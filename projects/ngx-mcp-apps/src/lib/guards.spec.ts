import {
  isCallToolResult,
  isDisplayModeResult,
  isHostContext,
  isInitializeResult,
  isRefusableResult,
  isToolInputParams,
  sanitizeHostContext,
} from './guards';

describe('type guards for host data', () => {
  it('isCallToolResult', () => {
    expect(isCallToolResult({ content: [{ type: 'text', text: 'hi' }], structuredContent: { a: 1 } })).toBe(true);
    expect(isCallToolResult({ content: [], isError: true })).toBe(true);
    expect(isCallToolResult({ structuredContent: {} })).toBe(false);
    expect(isCallToolResult({ content: [{ text: 'no type' }] })).toBe(false);
    expect(isCallToolResult({ content: [], structuredContent: 'x' })).toBe(false);
    expect(isCallToolResult({ content: [], isError: 'yes' })).toBe(false);
    expect(isCallToolResult(null)).toBe(false);
  });

  it('isHostContext, also for partial updates', () => {
    expect(isHostContext({})).toBe(true);
    expect(
      isHostContext({
        theme: 'dark',
        displayMode: 'inline',
        availableDisplayModes: ['inline', 'fullscreen'],
        platform: 'mobile',
        containerDimensions: { width: 400, maxHeight: 600 },
        safeAreaInsets: { top: 0, right: 0, bottom: 20, left: 0 },
        styles: { variables: { '--font-sans': 'Inter' } },
        somethingNew: { future: true },
      }),
    ).toBe(true);
    expect(isHostContext({ theme: 'blue' })).toBe(false);
    expect(isHostContext({ displayMode: 'maximized' })).toBe(false);
    expect(isHostContext({ availableDisplayModes: 'inline' })).toBe(false);
    expect(isHostContext({ containerDimensions: { width: '400px' } })).toBe(false);
    expect(isHostContext({ safeAreaInsets: { top: 0 } })).toBe(false);
    expect(isHostContext([])).toBe(false);
  });

  it('isInitializeResult', () => {
    const ok = {
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'claude', version: '1' },
      hostCapabilities: { serverTools: {} },
      hostContext: { theme: 'light' },
    };
    expect(isInitializeResult(ok)).toBe(true);
    expect(isInitializeResult({ ...ok, hostInfo: { name: 'claude' } })).toBe(false);
    // Forward compatible: capabilities and context fields are not a reason to refuse the connection
    expect(isInitializeResult({ ...ok, hostCapabilities: { serverTools: true } })).toBe(true);
    expect(isInitializeResult({ ...ok, hostContext: { theme: 3 } })).toBe(true);
    expect(isInitializeResult({ ...ok, hostContext: 'dark' })).toBe(false);
    expect(isInitializeResult({ ...ok, hostCapabilities: null })).toBe(false);
    expect(isInitializeResult({ ...ok, protocolVersion: undefined })).toBe(false);
  });

  it('sanitizeHostContext drops only the invalid known fields', () => {
    const r = sanitizeHostContext({ theme: 'dark', platform: 'tv', displayMode: 'inline', future: 1 });
    expect(r?.context).toEqual({ theme: 'dark', displayMode: 'inline', future: 1 });
    expect(r?.dropped).toEqual(['platform']);
    expect(sanitizeHostContext('x')).toBeUndefined();
    const proto = sanitizeHostContext(JSON.parse('{"__proto__": {"polluted": true}, "theme": "light"}'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(proto?.context.theme).toBe('light');
  });

  it('small results', () => {
    expect(isToolInputParams({ arguments: { a: 1 } })).toBe(true);
    expect(isToolInputParams({})).toBe(true);
    expect(isToolInputParams({ arguments: [1] })).toBe(false);
    expect(isDisplayModeResult({ mode: 'fullscreen' })).toBe(true);
    expect(isDisplayModeResult({ mode: 'big' })).toBe(false);
    expect(isRefusableResult({})).toBe(true);
    expect(isRefusableResult({ isError: true })).toBe(true);
    expect(isRefusableResult({ isError: 'no' })).toBe(false);
  });
});
