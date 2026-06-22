import * as vscode from 'vscode';
import * as path from 'path';
import { parseLabConf } from '../parser/labConfParser';

/**
 * Extracts the set of device names declared in the lab.conf file located
 * in the same directory as the provided URI.
 */
export async function getDevicesFromLabConf(docUri: vscode.Uri): Promise<Set<string> | null> {
  const dir = path.dirname(docUri.fsPath);
  const labConfUri = vscode.Uri.file(path.join(dir, 'lab.conf'));
  try {
    const bytes = await vscode.workspace.fs.readFile(labConfUri);
    const text = Buffer.from(bytes).toString('utf-8');
    const parsed = parseLabConf(text);
    return new Set(parsed.devices.keys());
  } catch {
    return null;
  }
}

/**
 * Extracts the set of collision domain names declared in the lab.conf file
 * located in the same directory as the provided URI.
 */
export async function getCollisionDomainsFromLabConf(docUri: vscode.Uri): Promise<Set<string> | null> {
  const dir = path.dirname(docUri.fsPath);
  const labConfUri = vscode.Uri.file(path.join(dir, 'lab.conf'));
  try {
    const bytes = await vscode.workspace.fs.readFile(labConfUri);
    const text = Buffer.from(bytes).toString('utf-8');
    const parsed = parseLabConf(text);
    const domains = new Set<string>();
    for (const dev of parsed.devices.values()) {
      for (const iface of dev.interfaces.values()) {
        const raw = iface.value.trim();
        const slashIdx = raw.indexOf('/');
        const domainName = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw;
        if (domainName) {
          domains.add(domainName);
        }
      }
    }
    return domains;
  } catch {
    return null;
  }
}
