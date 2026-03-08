import * as vscode from 'vscode';
import { OPTION_NAMES, META_KEYS, type OptionName, type MetaKey } from '../parser/labConfParser';

// ─── Documentation ────────────────────────────────────────────────────────────

const OPTION_DOCS: Record<OptionName, { type: string; description: string; example: string }> = {
  image: {
    type: 'string',
    description: 'The Docker image to use for this device.',
    example: 'device[image]="kathara/frr"',
  },
  mem: {
    type: 'string (e.g. `128m`)',
    description: 'Memory (RAM) limit for the device container. Minimum value is `4m`. Valid suffixes: `b`, `k`, `m`, `g`.',
    example: 'device[mem]="256m"',
  },
  cpus: {
    type: 'float',
    description: 'CPU limit for the device container. `0` removes the limit.',
    example: 'device[cpus]=0.5',
  },
  port: {
    type: '`[HOST:]GUEST[/PROTOCOL]`',
    description:
      'Forward a port from the host to the device. Default host port: `3000`. Default protocol: `tcp`. Valid protocols: `tcp`, `udp`, `sctp`.',
    example: 'device[port]="3000:22/tcp"',
  },
  bridged: {
    type: 'boolean',
    description: 'If `true`, the device is NAT-connected to the host network.',
    example: 'device[bridged]="true"',
  },
  ipv6: {
    type: 'boolean',
    description: 'If `true`, enables IPv6 support for the device.',
    example: 'device[ipv6]="true"',
  },
  exec: {
    type: 'string',
    description: 'A shell command to run inside the device at startup. This option can be specified multiple times.',
    example: 'device[exec]="ip addr add 10.0.0.1/24 dev eth0"',
  },
  sysctl: {
    type: 'string (`net.KEY=VALUE`)',
    description: 'A sysctl configuration value. **Only the `net.*` namespace is allowed.** Can be specified multiple times.',
    example: 'device[sysctl]="net.ipv4.ip_forward=1"',
  },
  env: {
    type: '`ENV_NAME=ENV_VALUE`',
    description: 'Set an environment variable inside the device. Can be specified multiple times.',
    example: 'device[env]="MY_ENV=hello"',
  },
  shell: {
    type: 'string (path)',
    description: 'The shell used inside the device (e.g. `/bin/bash`, `/bin/sh`).',
    example: 'device[shell]="/bin/sh"',
  },
  num_terms: {
    type: 'integer',
    description: 'The number of terminal windows to open for the device when the lab starts.',
    example: 'device[num_terms]=2',
  },
  ulimit: {
    type: '`ULIMIT=SOFT:HARD` or `ULIMIT=VALUE`',
    description: 'Set a resource limit for the device container. Use `-1` for unlimited.',
    example: 'device[ulimit]="nofile=1024:2048"',
  },
  privileged: {
    type: 'boolean',
    description: '**Requires root.** If `true`, the container runs in privileged mode.',
    example: 'device[privileged]="true"',
  },
  entrypoint: {
    type: 'string',
    description: 'Override the default Docker entrypoint for the device container.',
    example: 'device[entrypoint]="/sbin/init"',
  },
  args: {
    type: 'string',
    description: 'Additional arguments passed to the container entrypoint.',
    example: 'device[args]="--my-flag"',
  },
  volume: {
    type: '`HOST|GUEST[|MODE]`',
    description:
      'Mount a host path inside the device. `MODE` can be `ro` (read-only), `rw` (read-write, default), or `rx` (recursive read-only).',
    example: 'device[volume]="/data/shared|/shared|rw"',
  },
};

const META_DOCS: Record<MetaKey, string> = {
  LAB_NAME: 'A human-readable name for the lab.',
  LAB_DESCRIPTION: 'A short description of the lab scenario.',
  LAB_VERSION: 'The version of the lab configuration.',
  LAB_AUTHOR: 'The author(s) of the lab.',
  LAB_EMAIL: 'Contact email of the lab author(s).',
  LAB_WEB: 'A URL with more information about the lab.',
};

// ─── Hover Provider ───────────────────────────────────────────────────────────

export class LabConfHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const line = document.lineAt(position).text;
    const charIdx = position.character;

    // ── Meta key hover ─────────────────────────────────────────────────────────
    for (const key of META_KEYS) {
      const start = line.indexOf(key);
      if (start !== -1 && charIdx >= start && charIdx <= start + key.length) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${key}\`** — Lab metadata\n\n`);
        md.appendMarkdown(META_DOCS[key]);
        return new vscode.Hover(md, new vscode.Range(position.line, start, position.line, start + key.length));
      }
    }

    // ── Option name hover (inside brackets) ────────────────────────────────────
    const optionRe = /\[([A-Za-z_][A-Za-z0-9_]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = optionRe.exec(line)) !== null) {
      const matchStart = m.index + 1; // after '['
      const matchEnd = matchStart + m[1].length;
      if (charIdx >= matchStart && charIdx <= matchEnd) {
        const optName = m[1] as OptionName;
        const docs = OPTION_DOCS[optName];
        if (!docs) {
          return undefined;
        }
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${optName}\`**\n\n`);
        md.appendMarkdown(`**Type:** ${docs.type}\n\n`);
        md.appendMarkdown(`${docs.description}\n\n`);
        md.appendCodeblock(docs.example, 'lab-conf');
        md.appendMarkdown(
          `\n\n[Kathara Documentation](https://github.com/KatharaFramework/Kathara/wiki/Kathara-Lab-Format)`,
        );
        return new vscode.Hover(
          md,
          new vscode.Range(position.line, matchStart, position.line, matchEnd),
        );
      }
    }

    // ── Device name hover ──────────────────────────────────────────────────────
    const deviceRe = /^([A-Za-z_][A-Za-z0-9_-]*)\[/;
    const deviceMatch = deviceRe.exec(line);
    if (deviceMatch && charIdx >= 0 && charIdx < deviceMatch[1].length) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**Device:** \`${deviceMatch[1]}\``);
      return new vscode.Hover(md);
    }

    return undefined;
  }
}
