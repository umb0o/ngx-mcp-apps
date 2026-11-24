/**
 * Runtime checks for the messages the view receives from the host.
 * Hand-written type guards instead of a schema library: same safety where it matters, a few hundred bytes.
 */
import {
  McpCallToolResult,
  McpContentBlock,
  McpDisplayMode,
  McpHostCapabilities,
  McpHostContext,
  McpImplementation,
  McpInitializeResult,
} from './protocol';

type Guard<T> = (v: unknown) => v is T;

const DISPLAY_MODES: readonly string[] = ['inline', 'fullscreen', 'pip'];
const THEMES: readonly string[] = ['light', 'dark'];
const PLATFORMS: readonly string[] = ['web', 'desktop', 'mobile'];

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const optional =
  <T>(guard: Guard<T>): Guard<T | undefined> =>
  (v): v is T | undefined =>
    v === undefined || guard(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf =
  <T extends string>(values: readonly string[]): Guard<T> =>
  (v): v is T =>
    typeof v === 'string' && values.includes(v);
const arrayOf =
  <T>(guard: Guard<T>): Guard<T[]> =>
  (v): v is T[] =>
    Array.isArray(v) && v.every(guard);
const recordOf =
  <T>(guard: Guard<T>): Guard<Record<string, T>> =>
  (v): v is Record<string, T> =>
    isObject(v) && Object.values(v).every(guard);

export const isDisplayMode = oneOf<McpDisplayMode>(DISPLAY_MODES);

export function isImplementation(v: unknown): v is McpImplementation {
  return isObject(v) && isString(v['name']) && isString(v['version']);
}

export function isContentBlock(v: unknown): v is McpContentBlock {
  return isObject(v) && isString(v['type']) && optional(isString)(v['text']);
}

export function isCallToolResult(v: unknown): v is McpCallToolResult {
  return (
    isObject(v) &&
    arrayOf(isContentBlock)(v['content']) &&
    optional(isObject)(v['structuredContent']) &&
    optional(isBoolean)(v['isError']) &&
    optional(isObject)(v['_meta'])
  );
}

/** Also valid for the partial context of `host-context-changed`. Unknown fields pass through. */
export function isHostContext(v: unknown): v is McpHostContext {
  if (!isObject(v)) return false;
  const dims = v['containerDimensions'];
  const insets = v['safeAreaInsets'];
  const styles = v['styles'];
  return (
    optional(oneOf(THEMES))(v['theme']) &&
    optional(isDisplayMode)(v['displayMode']) &&
    optional(arrayOf(isDisplayMode))(v['availableDisplayModes']) &&
    optional(isString)(v['locale']) &&
    optional(isString)(v['timeZone']) &&
    optional(isString)(v['userAgent']) &&
    optional(oneOf(PLATFORMS))(v['platform']) &&
    (dims === undefined || (isObject(dims) && Object.values(dims).every((d) => d === undefined || isNumber(d)))) &&
    (insets === undefined || (isObject(insets) && ['top', 'right', 'bottom', 'left'].every((k) => isNumber(insets[k])))) &&
    (styles === undefined || (isObject(styles) && optional(recordOf(isString))(styles['variables'])))
  );
}

/** Capabilities are passed through: unknown or future shapes must not break the connection. */
export function isHostCapabilities(v: unknown): v is McpHostCapabilities {
  return isObject(v);
}

/**
 * Keeps the valid fields of a host context and drops the invalid known ones,
 * so one unexpected value (e.g. a new platform name) does not discard the whole context.
 */
export function sanitizeHostContext(v: unknown): { context: McpHostContext; dropped: string[] } | undefined {
  if (!isObject(v)) return undefined;
  const context: Record<string, unknown> = { ...v };
  const dropped: string[] = [];
  for (const key of Object.keys(context)) {
    if (!isHostContext({ [key]: context[key] })) {
      delete context[key];
      dropped.push(key);
    }
  }
  return { context: context as McpHostContext, dropped };
}

export function isInitializeResult(v: unknown): v is McpInitializeResult {
  return (
    isObject(v) &&
    isString(v['protocolVersion']) &&
    isImplementation(v['hostInfo']) &&
    isHostCapabilities(v['hostCapabilities']) &&
    isObject(v['hostContext'])
  );
}

export function isToolInputParams(v: unknown): v is { arguments?: Record<string, unknown> } {
  return isObject(v) && optional(isObject)(v['arguments']);
}

export function isDisplayModeResult(v: unknown): v is { mode: McpDisplayMode } {
  return isObject(v) && isDisplayMode(v['mode']);
}

/** Result of requests that may be refused by the host (`ui/message`, `ui/open-link`). */
export function isRefusableResult(v: unknown): v is { isError?: boolean } {
  return isObject(v) && optional(isBoolean)(v['isError']);
}
