import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface McpAppConfig {
  /** App name sent to the host during the handshake. */
  name: string;
  /** App version sent to the host during the handshake. */
  version: string;
  /** Let the host resize the iframe to fit the content. Default: true. */
  autoResize?: boolean;
  /** Give up connecting after this many ms and switch to standalone. Default: 4000. */
  connectTimeout?: number;
  /** Keep a log of protocol events in `McpApp.events`. Default: false. */
  log?: boolean;
}

export const MCP_APP_CONFIG = new InjectionToken<McpAppConfig>('MCP_APP_CONFIG', {
  factory: () => ({ name: 'angular-mcp-app', version: '0.0.0' }),
});

/** Registers the MCP App configuration. Use it in `bootstrapApplication` providers. */
export function provideMcpApp(config: McpAppConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MCP_APP_CONFIG, useValue: config }]);
}
