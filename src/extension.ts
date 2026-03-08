import * as vscode from 'vscode';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { LabConfCompletionProvider } from './providers/completionProvider';
import { LabConfHoverProvider } from './providers/hoverProvider';
import { registerCommands } from './commands/katharaCommands';
import { TopologyViewProvider } from './views/topologyView';

export function activate(context: vscode.ExtensionContext): void {
  // ── Diagnostics ─────────────────────────────────────────────────────────────
  const diagnosticsProvider = new DiagnosticsProvider();
  diagnosticsProvider.register(context);

  // ── Completion ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'lab-conf' },
        { pattern: '**/lab.conf' },
      ],
      new LabConfCompletionProvider(),
      '[',   // trigger inside brackets
      '=',   // trigger after assignment
      '/',   // trigger for protocol/vlan
      '|',   // trigger for volume mode
    ),
  );

  // ── Hover ───────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: 'lab-conf' },
        { pattern: '**/lab.conf' },
      ],
      new LabConfHoverProvider(),
    ),
  );

  // ── Topology view ───────────────────────────────────────────────────────────
  const topologyProvider = new TopologyViewProvider();
  context.subscriptions.push(
    vscode.commands.registerCommand('kathara.showTopology', () => {
      topologyProvider.show(context);
    }),
  );

  // ── Other commands ──────────────────────────────────────────────────────────
  registerCommands(context);
}

export function deactivate(): void {
  // nothing to clean up — all providers are registered via context.subscriptions
}
