import * as vscode from 'vscode';
import * as path from 'path';
import {
  parseLabConf,
  parseLabDep,
  parseLabExt,
  stripQuotes,
  OPTION_NAMES,
  BOOLEAN_OPTIONS,
  type InterfaceAssignment,
  type OptionAssignment,
} from '../parser/labConfParser';
import { getDevicesFromLabConf } from '../utils/labUtils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRange(doc: vscode.TextDocument, lineIdx: number, startChar: number, endChar: number): vscode.Range {
  return new vscode.Range(lineIdx, startChar, lineIdx, endChar);
}

function lineRange(doc: vscode.TextDocument, lineIdx: number): vscode.Range {
  return doc.lineAt(lineIdx).range;
}

// ─── lab.conf diagnostics ────────────────────────────────────────────────────

const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
const MEM_RE = /^(\d+(?:\.\d+)?)\s*([bkmgBKMG])$/;
const PORT_RE = /^(?:\d+:)?\d+(?:\/(tcp|udp|sctp))?$/i;
const VALID_COLLISION_DOMAIN_RE = /^[^ ,."]+$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*=.*$/;
const VOLUME_RE = /^[^|]+\|[^|]+(\|(ro|rw|rx))?$/;

function validateLabConf(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  const text = doc.getText();
  const parsed = parseLabConf(text);

  for (const line of parsed.lines) {
    const li = line.lineNumber - 1; // 0-based

    if (line.kind === 'unknown') {
      diags.push(new vscode.Diagnostic(
        lineRange(doc, li),
        'Unrecognized line format. Expected: DEVICE[index]=VALUE, DEVICE[option]=VALUE, or LAB_KEY=VALUE.',
        vscode.DiagnosticSeverity.Warning,
      ));
      continue;
    }

    if (line.kind === 'interface') {
      const iface = line as InterfaceAssignment;
      const raw = stripQuotes(iface.value);

      // Validate collision domain (before the optional MAC)
      const slashIdx = raw.indexOf('/');
      const domainName = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw;
      if (domainName && !VALID_COLLISION_DOMAIN_RE.test(domainName)) {
        diags.push(new vscode.Diagnostic(
          lineRange(doc, li),
          `Collision domain name "${domainName}" must not contain spaces, commas, or dots.`,
          vscode.DiagnosticSeverity.Error,
        ));
      }

      // Validate MAC address if present
      if (slashIdx !== -1) {
        const mac = raw.slice(slashIdx + 1);
        if (!MAC_RE.test(mac)) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Invalid MAC address "${mac}". Expected format: XX:XX:XX:XX:XX:XX.`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }
    }

    if (line.kind === 'option') {
      const opt = line as OptionAssignment;
      const val = stripQuotes(opt.value);

      // Warn about unrecognized option names
      if (!(OPTION_NAMES as readonly string[]).includes(opt.option)) {
        diags.push(new vscode.Diagnostic(
          makeRange(doc, li, opt.optionOffset, opt.optionOffset + opt.option.length),
          `Unknown option "${opt.option}". Valid options: ${OPTION_NAMES.join(', ')}.`,
          vscode.DiagnosticSeverity.Warning,
        ));
      }

      // Boolean option values
      if ((BOOLEAN_OPTIONS as string[]).includes(opt.option)) {
        if (val !== 'true' && val !== 'false') {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Option "${opt.option}" must be "true" or "false", got "${val}".`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // mem validation
      if (opt.option === 'mem') {
        const memMatch = val.match(MEM_RE);
        if (!memMatch) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Invalid mem value "${val}". Expected a number followed by b/k/m/g (e.g. 128m).`,
            vscode.DiagnosticSeverity.Error,
          ));
        } else {
          const amount = parseFloat(memMatch[1]);
          const unit = memMatch[2].toLowerCase();
          // Minimum 4m
          const toBytes = { b: 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 } as Record<string, number>;
          const bytes = amount * toBytes[unit];
          if (bytes < 4 * 1024 * 1024) {
            diags.push(new vscode.Diagnostic(
              lineRange(doc, li),
              `Memory must be at least 4m. Got "${val}".`,
              vscode.DiagnosticSeverity.Error,
            ));
          }
        }
      }

      // port validation
      if (opt.option === 'port') {
        if (!PORT_RE.test(val)) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Invalid port value "${val}". Expected [HOST:]GUEST[/tcp|udp|sctp] (e.g. 3000:22/tcp).`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // sysctl must start with net.
      if (opt.option === 'sysctl') {
        if (!val.startsWith('net.')) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `sysctl value "${val}" must be in the net.* namespace.`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // env must be KEY=VALUE
      if (opt.option === 'env') {
        if (!ENV_RE.test(val)) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Invalid env value "${val}". Expected ENV_NAME=ENV_VALUE.`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // volume must use | separator
      if (opt.option === 'volume') {
        if (!VOLUME_RE.test(val)) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `Invalid volume "${val}". Expected HOST|GUEST[|ro|rw|rx].`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // cpus must be a non-negative number
      if (opt.option === 'cpus') {
        const n = parseFloat(val);
        if (isNaN(n) || n < 0) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `cpus must be a non-negative number. Got "${val}".`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }

      // num_terms must be a non-negative integer
      if (opt.option === 'num_terms') {
        const n = parseInt(val, 10);
        if (isNaN(n) || n < 0 || String(n) !== val) {
          diags.push(new vscode.Diagnostic(
            lineRange(doc, li),
            `num_terms must be a non-negative integer. Got "${val}".`,
            vscode.DiagnosticSeverity.Error,
          ));
        }
      }
    }
  }

  // Per-device: interface indices must be sequential from 0
  for (const [deviceName, devInfo] of parsed.devices) {
    const indices = Array.from(devInfo.interfaces.keys()).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i) {
        const missing = Array.from({ length: indices[i] - i }, (_, k) => k + i).join(', ');
        const iface = devInfo.interfaces.get(indices[i])!;
        const li = iface.lineNumber - 1;
        diags.push(new vscode.Diagnostic(
          lineRange(doc, li),
          `Device "${deviceName}" interface index ${indices[i]} is out of sequence. Missing index(es): ${missing}.`,
          vscode.DiagnosticSeverity.Error,
        ));
        break;
      }
    }
  }

  return diags;
}

// ─── lab.dep diagnostics ─────────────────────────────────────────────────────

async function validateLabDep(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const diags: vscode.Diagnostic[] = [];
  const deps = parseLabDep(doc.getText());
  const knownDevices = await getDevicesFromLabConf(doc.uri);

  const lines = doc.getText().split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      diags.push(new vscode.Diagnostic(
        new vscode.Range(i, 0, i, line.length),
        'Expected format: DEVICE: dep1 dep2 ...',
        vscode.DiagnosticSeverity.Warning,
      ));
      continue;
    }

    const device = trimmed.slice(0, colonIdx).trim();
    const depsLine = trimmed.slice(colonIdx + 1).trim().split(/\s+/).filter(Boolean);

    if (knownDevices !== null) {
      if (!knownDevices.has(device)) {
        diags.push(new vscode.Diagnostic(
          new vscode.Range(i, line.indexOf(device), i, line.indexOf(device) + device.length),
          `Device "${device}" is not declared in lab.conf.`,
          vscode.DiagnosticSeverity.Warning,
        ));
      }
      for (const dep of depsLine) {
        if (!knownDevices.has(dep)) {
          const depStart = line.indexOf(dep, colonIdx);
          diags.push(new vscode.Diagnostic(
            new vscode.Range(i, depStart, i, depStart + dep.length),
            `Device "${dep}" is not declared in lab.conf.`,
            vscode.DiagnosticSeverity.Warning,
          ));
        }
      }
    }
  }

  return diags;
}

// ─── lab.ext diagnostics ─────────────────────────────────────────────────────

function validateLabExt(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  const mappings = parseLabExt(doc.getText());

  for (const m of mappings) {
    const li = m.lineNumber - 1;
    if (m.vlanId !== null) {
      if (m.vlanId === 0 || m.vlanId === 4095) {
        diags.push(new vscode.Diagnostic(
          doc.lineAt(li).range,
          `VLAN ID ${m.vlanId} is reserved and cannot be used.`,
          vscode.DiagnosticSeverity.Error,
        ));
      } else if (m.vlanId < 1 || m.vlanId > 4094) {
        diags.push(new vscode.Diagnostic(
          doc.lineAt(li).range,
          `VLAN ID ${m.vlanId} is out of range (1–4094).`,
          vscode.DiagnosticSeverity.Error,
        ));
      }
    }
    if (!VALID_COLLISION_DOMAIN_RE.test(m.collisionDomain)) {
      diags.push(new vscode.Diagnostic(
        doc.lineAt(li).range,
        `Collision domain name "${m.collisionDomain}" must not contain spaces, commas, or dots.`,
        vscode.DiagnosticSeverity.Error,
      ));
    }
  }

  return diags;
}

// ─── cross-file helper ───────────────────────────────────────────────────────
// (Now handled by src/utils/labUtils.ts)

// ─── main provider class ─────────────────────────────────────────────────────

export class DiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('kathara');
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.collection);

    const update = (doc: vscode.TextDocument) => this.updateDiagnostics(doc);
    const clear = (doc: vscode.TextDocument) => this.collection.delete(doc.uri);

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(update),
      vscode.workspace.onDidChangeTextDocument((e) => update(e.document)),
      vscode.workspace.onDidCloseTextDocument(clear),
    );

    // Run on all already-open docs
    for (const doc of vscode.workspace.textDocuments) {
      this.updateDiagnostics(doc);
    }

    context.subscriptions.push(...this.disposables);
  }

  private async updateDiagnostics(doc: vscode.TextDocument): Promise<void> {
    const fname = doc.fileName.split(path.sep).pop() || '';
    const lang = doc.languageId;

    if (lang === 'lab-conf' || fname === 'lab.conf') {
      this.collection.set(doc.uri, validateLabConf(doc));
    } else if (lang === 'lab-dep' || fname === 'lab.dep') {
      this.collection.set(doc.uri, await validateLabDep(doc));
    } else if (lang === 'lab-ext' || fname === 'lab.ext') {
      this.collection.set(doc.uri, validateLabExt(doc));
    }
  }

  dispose(): void {
    this.collection.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
