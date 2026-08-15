import * as assert from 'assert';
import * as vscode from 'vscode';

function hoverText(hover: vscode.Hover): string {
  return hover.contents
    .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
    .join('\n');
}

async function openAndSettle(content: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({ language: 'lab-conf', content });
  await vscode.window.showTextDocument(doc);
  // dà tempo all'Extension Host di agganciare i provider sul documento appena creato
  await new Promise((resolve) => setTimeout(resolve, 300));
  return doc;
}

suite('Hover su lab.conf', () => {
  test('mostra la documentazione per un nome di opzione', async () => {
    const doc = await openAndSettle('r1[mem]="128m"');
    const position = new vscode.Position(0, 4); // dentro "mem"

    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    )) as vscode.Hover[];

    assert.ok(hovers.length > 0, 'dovrebbe restituire almeno un hover');
    const text = hoverText(hovers[0]);
    assert.ok(text.includes('mem'));
    assert.ok(text.includes('Memory'));
  });

  test('mostra la documentazione per una chiave di metadata', async () => {
    const doc = await openAndSettle('LAB_NAME="Test"');
    const position = new vscode.Position(0, 4); // dentro "LAB_NAME"

    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    )) as vscode.Hover[];

    assert.ok(hovers.length > 0);
    const text = hoverText(hovers[0]);
    assert.ok(text.includes('LAB_NAME'));
  });

  test('non mostra hover su un\'opzione sconosciuta', async () => {
    const doc = await openAndSettle('r1[unknownoption]="x"');
    const position = new vscode.Position(0, 5); // dentro "unknownoption"

    const hovers = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      doc.uri,
      position,
    )) as vscode.Hover[];

    assert.strictEqual(hovers.length, 0);
  });
});