import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { McpPort } from './bridge';

export interface McpAppConfig {
  /** App name sent to the host during the handshake. */
  name: string;
  /** App version sent to the host during the handshake. */
  version: string;
  /** Tell the host the content size so the iframe fits it. Default: true. */
  autoResize?: boolean;
  /** Give up connecting after this many ms and switch to standalone. Default: 4000. */
  connectTimeout?: number;
  /** Timeout for requests to the host, in ms. Default: 60000. */
  requestTimeout?: number;
  /** Keep a log of protocol events in `McpApp.events`. Default: false. */
  log?: boolean;
  /** Custom transport. Default: the parent window, when running inside an iframe. */
  port?: McpPort;
}

export const MCP_APP_CONFIG = new InjectionToken<McpAppConfig>('MCP_APP_CONFIG', {
  factory: () => ({ name: 'angular-mcp-app', version: '0.0.0' }),
});

/** Registers the MCP App configuration. Use it in `bootstrapApplication` providers. */
export function provideMcpApp(config: McpAppConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MCP_APP_CONFIG, useValue: config }]);
}
