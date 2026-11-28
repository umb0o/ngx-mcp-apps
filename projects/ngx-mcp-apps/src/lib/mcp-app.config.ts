import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { McpPort } from './bridge';
import type { McpDisplayMode } from './protocol';

export interface McpAppConfig {
  /** App name sent to the host during the handshake. */
  name: string;
  /** App version sent to the host during the handshake. */
  version: string;
  /**
   * Display modes this app supports, sent to the host during the handshake (`appCapabilities.availableDisplayModes`).
   * Default: not sent.
   */
  availableDisplayModes?: McpDisplayMode[];
  /** Tell the host the content size so the iframe fits it. Default: true. */
  autoResize?: boolean;
  /** Give up connecting after this many ms and switch to standalone. Default: 4000. */
  connectTimeout?: number;
  /** Timeout for requests to the host, in ms. Default: 60000. */
  requestTimeout?: number;
  /**
   * Keep a log of protocol events in `McpApp.events`. Default: false.
   * The log contains data from the host and your server: meant for debugging, not for production UIs.
   */
  log?: boolean;
  /**
   * Talk only to a parent window with one of these origins. Default: any origin, like the official SDK.
   * Ignored when `port` is set.
   */
  allowedOrigins?: string[];
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
