import * as vscode from 'vscode';
import * as path from 'path';
import { parseLabConf } from '../parser/labConfParser';

// ─── helpers ──────────────────────────────────────────────────────────────────

let _terminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
  if (!_terminal || _terminal.exitStatus !== undefined) {
    _terminal = vscode.window.createTerminal('Kathara');
  }
  return _terminal;
}

/**
 * Find the lab directory: directory of the currently open lab.conf, or the
 * workspace root if no lab.conf is open.
 */
async function resolveLabDir(): Promise<string | undefined> {
  // Prefer the active editor's directory if it's a lab.conf
  const active = vscode.window.activeTextEditor;
  if (active) {
    const fname = path.basename(active.document.fileName);
    if (fname === 'lab.conf') {
      return path.dirname(active.document.fileName);
    }
  }

  // Search the workspace for lab.conf
  const found = await vscode.workspace.findFiles('**/lab.conf', null, 1);
  if (found.length > 0) {
    return path.dirname(found[0].fsPath);
  }

  // Fall back to workspace root
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}

/**
 * Return device names declared in the nearest lab.conf relative to `labDir`.
 */
async function getDeviceNames(labDir: string): Promise<string[]> {
  const labConfUri = vscode.Uri.file(path.join(labDir, 'lab.conf'));
  try {
    const bytes = await vscode.workspace.fs.readFile(labConfUri);
    const text = Buffer.from(bytes).toString('utf-8');
    const parsed = parseLabConf(text);
    return Array.from(parsed.devices.keys());
  } catch {
    return [];
  }
}

function runInTerminal(command: string): void {
  const t = getTerminal();
  t.show(true);
  t.sendText(command);
}

// ─── Command implementations ─────────────────────────────────────────────────

export async function cmdLstart(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  runInTerminal(`cd "${labDir}" && kathara lstart`);
}

export async function cmdLclean(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  runInTerminal(`cd "${labDir}" && kathara lclean`);
}

export async function cmdLrestart(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  runInTerminal(`cd "${labDir}" && kathara lrestart`);
}

export async function cmdLinfo(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  runInTerminal(`cd "${labDir}" && kathara linfo`);
}

export async function cmdConnect(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  const devices = await getDeviceNames(labDir);
  let deviceName: string | undefined;

  if (devices.length > 0) {
    deviceName = await vscode.window.showQuickPick(devices, {
      placeHolder: 'Select a device to connect to',
      title: 'Kathara: Connect to Device',
    });
  } else {
    deviceName = await vscode.window.showInputBox({
      prompt: 'Enter device name',
      placeHolder: 'e.g. pc1',
    });
  }

  if (!deviceName) {
    return;
  }
  runInTerminal(`kathara connect ${deviceName}`);
}

export async function cmdVstart(): Promise<void> {
  const labDir = await resolveLabDir();
  if (!labDir) {
    vscode.window.showErrorMessage('Kathara: Could not find a lab directory.');
    return;
  }
  const devices = await getDeviceNames(labDir);
  let deviceName: string | undefined;

  if (devices.length > 0) {
    deviceName = await vscode.window.showQuickPick(devices, {
      placeHolder: 'Select a device to start',
      title: 'Kathara: Start Device',
    });
  } else {
    deviceName = await vscode.window.showInputBox({
      prompt: 'Enter device name',
      placeHolder: 'e.g. pc1',
    });
  }

  if (!deviceName) {
    return;
  }
  runInTerminal(`cd "${labDir}" && kathara vstart ${deviceName}`);
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kathara.lstart', cmdLstart),
    vscode.commands.registerCommand('kathara.lclean', cmdLclean),
    vscode.commands.registerCommand('kathara.lrestart', cmdLrestart),
    vscode.commands.registerCommand('kathara.linfo', cmdLinfo),
    vscode.commands.registerCommand('kathara.connect', cmdConnect),
    vscode.commands.registerCommand('kathara.vstart', cmdVstart),
  );
}
