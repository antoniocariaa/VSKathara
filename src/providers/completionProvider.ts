import * as vscode from 'vscode';
import { OPTION_NAMES, META_KEYS, parseLabConf, BOOLEAN_OPTIONS, type OptionName } from '../parser/labConfParser';
import { getDevicesFromLabConf, getCollisionDomainsFromLabConf } from '../utils/labUtils';

// ─── Option metadata ──────────────────────────────────────────────────────────

interface OptionMeta {
  detail: string;
  documentation: string;
  kind: vscode.CompletionItemKind;
  valueHint?: string;
}

const OPTION_META: Record<OptionName, OptionMeta> = {
  image: {
    detail: 'Docker image name',
    documentation: 'The Docker image to use for this device (e.g. `kathara/base`, `kathara/frr`).',
    kind: vscode.CompletionItemKind.Property,
    valueHint: 'kathara/base',
  },
  mem: {
    detail: 'Memory limit',
    documentation: 'RAM limit for the device. Minimum 4m. Valid suffixes: b, k, m, g (e.g. `128m`, `1g`).',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '128m',
  },
  cpus: {
    detail: 'CPU limit',
    documentation: 'CPU limit (floating point). 0 means no limit.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '1.0',
  },
  port: {
    detail: 'Port forwarding',
    documentation: 'Map a host port to a guest port: `[HOST:]GUEST[/tcp|udp|sctp]`. Default host port: 3000, default protocol: tcp.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '3000:22/tcp',
  },
  bridged: {
    detail: 'NAT bridge to host network',
    documentation: 'If `true`, the device is connected to the host network via NAT.',
    kind: vscode.CompletionItemKind.Property,
  },
  ipv6: {
    detail: 'Enable IPv6',
    documentation: 'If `true`, IPv6 support is enabled for the device.',
    kind: vscode.CompletionItemKind.Property,
  },
  exec: {
    detail: 'Startup command',
    documentation: 'A shell command run inside the device at startup. Can be repeated multiple times.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: 'echo hello',
  },
  sysctl: {
    detail: 'sysctl setting',
    documentation: 'A sysctl key=value pair. Only the `net.*` namespace is allowed (e.g. `net.ipv4.ip_forward=1`).',
    kind: vscode.CompletionItemKind.Property,
    valueHint: 'net.ipv4.ip_forward=1',
  },
  env: {
    detail: 'Environment variable',
    documentation: 'Set an environment variable inside the device: `ENV_NAME=ENV_VALUE`.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: 'MY_VAR=value',
  },
  shell: {
    detail: 'Shell path',
    documentation: 'The shell to use inside the device (e.g. `/bin/bash`, `/bin/sh`).',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '/bin/bash',
  },
  num_terms: {
    detail: 'Number of terminal windows',
    documentation: 'How many terminal windows to open for the device on startup.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '1',
  },
  ulimit: {
    detail: 'ulimit setting',
    documentation: 'Set a resource limit: `ULIMIT=SOFT:HARD` or `ULIMIT=VALUE`. Use -1 for unlimited (e.g. `nofile=1024:2048`).',
    kind: vscode.CompletionItemKind.Property,
    valueHint: 'nofile=1024:2048',
  },
  privileged: {
    detail: 'Privileged mode',
    documentation: 'If `true`, the container runs in privileged mode. Requires root.',
    kind: vscode.CompletionItemKind.Property,
  },
  entrypoint: {
    detail: 'Container entrypoint',
    documentation: 'Override the default Docker entrypoint for the container.',
    kind: vscode.CompletionItemKind.Property,
  },
  args: {
    detail: 'Entrypoint arguments',
    documentation: 'Extra arguments passed to the container entrypoint.',
    kind: vscode.CompletionItemKind.Property,
  },
  volume: {
    detail: 'Volume mount',
    documentation: 'Mount a host path inside the device: `HOST|GUEST[|ro|rw|rx]`.',
    kind: vscode.CompletionItemKind.Property,
    valueHint: '/host/path|/guest/path|rw',
  },
};

// ─── Completion Provider ──────────────────────────────────────────────────────

export class LabConfCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position).text;
    const linePrefix = line.slice(0, position.character);
    const language = document.languageId;

    // ─── Lab Conf completions ──────────────────────────────────────────────────────
    if (language === 'lab-conf' || document.fileName.endsWith('lab.conf')) {
      // 1. Inside brackets: suggest option names
      const insideBracket = /^[A-Za-z_][A-Za-z0-9_-]*\[([A-Za-z0-9_]*)$/.exec(linePrefix);
      if (insideBracket) {
        return this.optionCompletions();
      }

      // 2. After '=' for boolean options
      const boolEq = /^[A-Za-z_][A-Za-z0-9_-]*\[(bridged|ipv6|privileged)\]\s*=\s*$/.exec(linePrefix);
      if (boolEq) {
        return [
          this.simpleItem('true', vscode.CompletionItemKind.Value, 'Boolean true'),
          this.simpleItem('false', vscode.CompletionItemKind.Value, 'Boolean false'),
        ];
      }

      // 3. After '=' for port: protocol suggestions
      const portProtocol = /^[A-Za-z_][A-Za-z0-9_-]*\[port\]\s*=\s*\d+(?::\d+)?\/([A-Za-z]*)$/.exec(linePrefix);
      if (portProtocol) {
        return ['tcp', 'udp', 'sctp'].map((p) => this.simpleItem(p, vscode.CompletionItemKind.Value, `${p.toUpperCase()} protocol`));
      }

      // 4. After '=' for volume: mode suggestions
      const volumeMode = /^[A-Za-z_][A-Za-z0-9_-]*\[volume\]\s*=\s*[^|]+\|[^|]+\|([A-Za-z]*)$/.exec(linePrefix);
      if (volumeMode) {
        return ['ro', 'rw', 'rx'].map((m) => this.simpleItem(m, vscode.CompletionItemKind.Value, `Volume mode: ${m}`));
      }

      // 5. After '=' for shell
      const shellEq = /^[A-Za-z_][A-Za-z0-9_-]*\[shell\]\s*=\s*$/.exec(linePrefix);
      if (shellEq) {
        return ['/bin/bash', '/bin/sh', '/bin/zsh', '/bin/ash'].map((sh) =>
          this.simpleItem(sh, vscode.CompletionItemKind.Value, `Shell: ${sh}`),
        );
      }

      // 6. After '=' for sysctl: common net.* values
      const sysctlEq = /^[A-Za-z_][A-Za-z0-9_-]*\[sysctl\]\s*=\s*$/.exec(linePrefix);
      if (sysctlEq) {
        return [
          'net.ipv4.ip_forward=1',
          'net.ipv6.conf.all.forwarding=1',
          'net.ipv4.conf.all.rp_filter=0',
          'net.ipv4.conf.default.rp_filter=0',
        ].map((s) => this.simpleItem(s, vscode.CompletionItemKind.Value, 'sysctl value'));
      }

      // 7. After '=' for image: common Kathara images
      const imageEq = /^[A-Za-z_][A-Za-z0-9_-]*\[image\]\s*=\s*$/.exec(linePrefix);
      if (imageEq) {
        const knownImages = this.collectImagesFromDocument(document);
        const defaults = ['kathara/base', 'kathara/frr', 'kathara/quagga', 'kathara/bind9', 'kathara/openssl'];
        const all = [...new Set([...knownImages, ...defaults])];
        return all.map((img) => this.simpleItem(img, vscode.CompletionItemKind.Value, 'Docker image'));
      }

      // 8. Start of a line: suggest LAB_* meta keys or device snippets
      if (/^\s*$/.test(linePrefix) || /^[A-Za-z_]?$/.test(linePrefix)) {
        return this.topLevelCompletions();
      }
    }

    // ─── Lab Dep completions ──────────────────────────────────────────────────────
    if (language === 'lab-dep' || document.fileName.endsWith('lab.dep')) {
      // Suggest devices before ':' or after ':'
      if (/^\s*$/.test(linePrefix) || /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*$/.test(linePrefix) || /.*:\s*$/.test(linePrefix)) {
        const devices = await getDevicesFromLabConf(document.uri);
        if (devices) {
          return Array.from(devices).map((dev) => this.simpleItem(dev, vscode.CompletionItemKind.Class, 'Device name'));
        }
      }
    }

    // ─── Lab Ext completions ──────────────────────────────────────────────────────
    if (language === 'lab-ext' || document.fileName.endsWith('lab.ext')) {
      // 1. Suggest collision domains at start of line
      if (/^\s*$/.test(linePrefix) || /^\s*[A-Za-z0-9_-]*$/.test(linePrefix)) {
        const domains = await getCollisionDomainsFromLabConf(document.uri);
        if (domains) {
          return Array.from(domains).map((d) => this.simpleItem(d, vscode.CompletionItemKind.Value, 'Collision domain'));
        }
      }
      // 2. Suggest network interfaces after the domain name
      if (/^\s*[A-Za-z0-9_-]+\s+$/.test(linePrefix)) {
        const commonIfaces = ['eth0', 'eth1', 'enp0s3', 'enp3s0', 'wlan0', 'lo'];
        return commonIfaces.map((iface) => this.simpleItem(iface, vscode.CompletionItemKind.Variable, 'Network interface'));
      }
    }

    return [];
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private optionCompletions(): vscode.CompletionItem[] {
    return OPTION_NAMES.map((name) => {
      const meta = OPTION_META[name];
      const item = new vscode.CompletionItem(name, meta.kind);
      item.detail = meta.detail;
      item.documentation = new vscode.MarkdownString(meta.documentation);
      // Insert the rest of the line: option]=value
      const isBoolean = (BOOLEAN_OPTIONS as string[]).includes(name);
      item.insertText = new vscode.SnippetString(
        isBoolean
          ? `${name}]="` + '${1|true,false|}"'
          : meta.valueHint
          ? `${name}]="` + `\${1:${meta.valueHint}}"` + ''
          : `${name}]="$1"`,
      );
      item.filterText = name;
      return item;
    });
  }

  private topLevelCompletions(): vscode.CompletionItem[] {
    const metaItems = META_KEYS.map((k) => {
      const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword);
      item.insertText = new vscode.SnippetString(`${k}="$1"`);
      item.detail = 'Lab metadata key';
      return item;
    });

    const snippetItem = new vscode.CompletionItem('lab-meta (full metadata block)', vscode.CompletionItemKind.Snippet);
    snippetItem.insertText = new vscode.SnippetString(
      [
        'LAB_NAME="${1:My Lab}"',
        'LAB_DESCRIPTION="${2:Description}"',
        'LAB_VERSION=${3:1.0}',
        'LAB_AUTHOR="${4:Author}"',
        'LAB_EMAIL="${5:email@example.com}"',
        'LAB_WEB="${6:https://example.com}"',
      ].join('\n'),
    );

    return [...metaItems, snippetItem];
  }

  private simpleItem(label: string, kind: vscode.CompletionItemKind, detail: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, kind);
    item.detail = detail;
    return item;
  }

  private collectImagesFromDocument(document: vscode.TextDocument): string[] {
    const parsed = parseLabConf(document.getText());
    const images: string[] = [];
    for (const dev of parsed.devices.values()) {
      const imageOpts = dev.options.get('image');
      if (imageOpts) {
        for (const o of imageOpts) {
          const v = o.value.replace(/^["']|["']$/g, '');
          if (v) {
            images.push(v);
          }
        }
      }
    }
    return images;
  }
}
