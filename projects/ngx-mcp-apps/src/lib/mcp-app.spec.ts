import { TestBed } from '@angular/core/testing';
import { McpApp } from './mcp-app';
import { provideMcpApp } from './mcp-app.config';

describe('McpApp', () => {
  it('goes standalone outside a host iframe', () => {
    TestBed.configureTestingModule({ providers: [provideMcpApp({ name: 'test', version: '1.0.0', log: true })] });
    const mcp = TestBed.inject(McpApp);
    expect(mcp.status()).toBe('standalone');
    expect(mcp.connected()).toBe(false);
    expect(mcp.displayMode()).toBe('inline');
    expect(mcp.canFullscreen()).toBe(false);
    expect(mcp.events()[0]).toContain('standalone');
  });

  it('works without provideMcpApp', () => {
    const mcp = TestBed.inject(McpApp);
    expect(mcp.status()).toBe('standalone');
    expect(mcp.events()).toEqual([]);
  });
});
