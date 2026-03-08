/**
 * Parser for Kathara lab.conf files.
 *
 * Grammar (line-oriented):
 *   comment            = '#' <anything>
 *   blank              = <empty or whitespace>
 *   meta-assignment    = META_KEY '=' value
 *   interface-assign   = device '[' number ']' '=' value
 *   option-assign      = device '[' option-name ']' '=' value
 */

export const META_KEYS = [
  'LAB_NAME',
  'LAB_DESCRIPTION',
  'LAB_VERSION',
  'LAB_AUTHOR',
  'LAB_EMAIL',
  'LAB_WEB',
] as const;

export type MetaKey = (typeof META_KEYS)[number];

export const OPTION_NAMES = [
  'image',
  'mem',
  'cpus',
  'port',
  'bridged',
  'ipv6',
  'exec',
  'sysctl',
  'env',
  'shell',
  'num_terms',
  'ulimit',
  'privileged',
  'entrypoint',
  'args',
  'volume',
] as const;

export type OptionName = (typeof OPTION_NAMES)[number];

export const BOOLEAN_OPTIONS: OptionName[] = ['bridged', 'ipv6', 'privileged'];

export interface LineInfo {
  /** 1-based line number */
  lineNumber: number;
  /** Raw text of the line */
  raw: string;
}

export interface CommentLine extends LineInfo {
  kind: 'comment';
}

export interface BlankLine extends LineInfo {
  kind: 'blank';
}

export interface MetaAssignment extends LineInfo {
  kind: 'meta';
  key: string;
  value: string;
  /** Character offset of the key start */
  keyOffset: number;
  /** Character offset of the value start */
  valueOffset: number;
}

export interface InterfaceAssignment extends LineInfo {
  kind: 'interface';
  device: string;
  /** Interface index (the number inside brackets) */
  index: number;
  /** Raw bracket content (the index string) */
  indexRaw: string;
  value: string;
  deviceOffset: number;
  indexOffset: number;
  valueOffset: number;
}

export interface OptionAssignment extends LineInfo {
  kind: 'option';
  device: string;
  option: string;
  value: string;
  deviceOffset: number;
  optionOffset: number;
  valueOffset: number;
}

export interface UnknownLine extends LineInfo {
  kind: 'unknown';
}

export type LabConfLine =
  | CommentLine
  | BlankLine
  | MetaAssignment
  | InterfaceAssignment
  | OptionAssignment
  | UnknownLine;

export interface DeviceInfo {
  name: string;
  interfaces: Map<number, InterfaceAssignment>;
  options: Map<string, OptionAssignment[]>;
}

export interface LabConfDocument {
  lines: LabConfLine[];
  devices: Map<string, DeviceInfo>;
  meta: Map<string, MetaAssignment>;
}

const META_RE = /^(LAB_NAME|LAB_DESCRIPTION|LAB_VERSION|LAB_AUTHOR|LAB_EMAIL|LAB_WEB)\s*=\s*(.*)/;
const IFACE_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\[([0-9]+)\]\s*=\s*(.*)/;
const OPTION_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\[([A-Za-z_][A-Za-z0-9_]*)\]\s*=\s*(.*)/;

/**
 * Strip surrounding quotes from a value string (single or double).
 */
export function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse the complete text of a lab.conf file into a structured document.
 */
export function parseLabConf(text: string): LabConfDocument {
  const rawLines = text.split(/\r?\n/);
  const lines: LabConfLine[] = [];
  const devices = new Map<string, DeviceInfo>();
  const meta = new Map<string, MetaAssignment>();

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const lineNumber = i + 1;
    const trimmed = raw.trimStart();

    if (trimmed === '' || raw.trim() === '') {
      lines.push({ kind: 'blank', lineNumber, raw });
      continue;
    }

    if (trimmed.startsWith('#')) {
      lines.push({ kind: 'comment', lineNumber, raw });
      continue;
    }

    let m: RegExpMatchArray | null;

    m = raw.match(META_RE);
    if (m) {
      const key = m[1];
      const value = m[2].trim();
      const keyOffset = raw.indexOf(key);
      const valueOffset = raw.indexOf('=') + 1 + (m[2].length - m[2].trimStart().length);
      const node: MetaAssignment = { kind: 'meta', lineNumber, raw, key, value, keyOffset, valueOffset };
      lines.push(node);
      meta.set(key, node);
      continue;
    }

    m = raw.match(IFACE_RE);
    if (m) {
      const device = m[1];
      const indexRaw = m[2];
      const index = parseInt(indexRaw, 10);
      const value = m[3].trim();
      const deviceOffset = raw.indexOf(device);
      const indexOffset = raw.indexOf('[') + 1;
      const valueOffset = raw.indexOf('=') + 1 + (m[3].length - m[3].trimStart().length);
      const node: InterfaceAssignment = {
        kind: 'interface',
        lineNumber,
        raw,
        device,
        index,
        indexRaw,
        value,
        deviceOffset,
        indexOffset,
        valueOffset,
      };
      lines.push(node);

      if (!devices.has(device)) {
        devices.set(device, { name: device, interfaces: new Map(), options: new Map() });
      }
      const devInfo = devices.get(device)!;
      devInfo.interfaces.set(index, node);
      continue;
    }

    m = raw.match(OPTION_RE);
    if (m) {
      const device = m[1];
      const option = m[2];
      const value = m[3].trim();
      const deviceOffset = raw.indexOf(device);
      const optionOffset = raw.indexOf('[') + 1;
      const valueOffset = raw.indexOf('=') + 1 + (m[3].length - m[3].trimStart().length);
      const node: OptionAssignment = {
        kind: 'option',
        lineNumber,
        raw,
        device,
        option,
        value,
        deviceOffset,
        optionOffset,
        valueOffset,
      };
      lines.push(node);

      if (!devices.has(device)) {
        devices.set(device, { name: device, interfaces: new Map(), options: new Map() });
      }
      const devInfo = devices.get(device)!;
      if (!devInfo.options.has(option)) {
        devInfo.options.set(option, []);
      }
      devInfo.options.get(option)!.push(node);
      continue;
    }

    lines.push({ kind: 'unknown', lineNumber, raw });
  }

  return { lines, devices, meta };
}

/**
 * Parse lab.dep text into a map of device -> dependencies.
 */
export function parseLabDep(text: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const device = trimmed.slice(0, colonIdx).trim();
    const deps = trimmed
      .slice(colonIdx + 1)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    result.set(device, deps);
  }
  return result;
}

/**
 * Parse lab.ext text into a list of mappings.
 */
export interface ExtMapping {
  collisionDomain: string;
  iface: string;
  vlanId: number | null;
  lineNumber: number;
}

export function parseLabExt(text: string): ExtMapping[] {
  const result: ExtMapping[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }
    const collisionDomain = parts[0];
    const ifacePart = parts[1];
    const dotIdx = ifacePart.indexOf('.');
    let iface: string;
    let vlanId: number | null = null;
    if (dotIdx !== -1) {
      iface = ifacePart.slice(0, dotIdx);
      vlanId = parseInt(ifacePart.slice(dotIdx + 1), 10);
    } else {
      iface = ifacePart;
    }
    result.push({ collisionDomain, iface, vlanId, lineNumber: i + 1 });
  }
  return result;
}
