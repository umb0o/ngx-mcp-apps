/**
 * The subset of the MCP Apps protocol (SEP-1865, version 2026-01-26) used by views.
 * Spec: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
 */

export const PROTOCOL_VERSION = '2026-01-26';

export const Methods = {
  // view → host requests
  initialize: 'ui/initialize',
  message: 'ui/message',
  updateModelContext: 'ui/update-model-context',
  openLink: 'ui/open-link',
  downloadFile: 'ui/download-file',
  requestDisplayMode: 'ui/request-display-mode',
  callTool: 'tools/call',
  readResource: 'resources/read',
  listResources: 'resources/list',
  // view → host notifications
  initialized: 'ui/notifications/initialized',
  sizeChanged: 'ui/notifications/size-changed',
  requestTeardown: 'ui/notifications/request-teardown',
  log: 'notifications/message',
  // host → view notifications
  toolInput: 'ui/notifications/tool-input',
  toolInputPartial: 'ui/notifications/tool-input-partial',
  toolResult: 'ui/notifications/tool-result',
  toolCancelled: 'ui/notifications/tool-cancelled',
  hostContextChanged: 'ui/notifications/host-context-changed',
  // host → view requests
  ping: 'ping',
  resourceTeardown: 'ui/resource-teardown',
} as const;

export type McpDisplayMode = 'inline' | 'fullscreen' | 'pip';
export type McpTheme = 'light' | 'dark';

export interface McpImplementation {
  name: string;
  version: string;
  [key: string]: unknown;
}

export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpCallToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A resource as MCP returns it: text or base64 `blob`. */
export interface McpResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpReadResourceResult {
  contents: McpResourceContents[];
  [key: string]: unknown;
}

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpListResourcesResult {
  resources: McpResource[];
  nextCursor?: string;
  [key: string]: unknown;
}

/** What `downloadFile` can hand to the host: the file itself, or a link the host fetches. */
export type McpDownloadContent =
  | { type: 'resource'; resource: McpResourceContents }
  | { type: 'resource_link'; uri: string; name: string; mimeType?: string; [key: string]: unknown };

/** Levels of `notifications/message` (RFC 5424 syslog severities, as in MCP). */
export type McpLogLevel =
  'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

export interface McpHostContext {
  /** The tool call that opened this app: its JSON-RPC id and the tool definition. */
  toolInfo?: { id?: JsonRpcId; tool: { name: string; [key: string]: unknown } };
  theme?: McpTheme;
  displayMode?: McpDisplayMode;
  availableDisplayModes?: McpDisplayMode[];
  containerDimensions?: { width?: number; maxWidth?: number; height?: number; maxHeight?: number };
  locale?: string;
  timeZone?: string;
  userAgent?: string;
  platform?: 'web' | 'desktop' | 'mobile';
  deviceCapabilities?: { touch?: boolean; hover?: boolean };
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
  styles?: { variables?: Record<string, string>; css?: { fonts?: string } };
  [key: string]: unknown;
}

export interface McpHostCapabilities {
  serverTools?: Record<string, unknown>;
  serverResources?: Record<string, unknown>;
  openLinks?: Record<string, unknown>;
  downloadFile?: Record<string, unknown>;
  updateModelContext?: Record<string, unknown>;
  message?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  sandbox?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpInitializeResult {
  protocolVersion: string;
  hostInfo: McpImplementation;
  hostCapabilities: McpHostCapabilities;
  hostContext: McpHostContext;
  [key: string]: unknown;
}

// JSON-RPC 2.0

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
