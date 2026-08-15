import * as assert from 'assert';
import * as vscode from 'vscode';

function labelOf(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

suite('Completion su lab.conf', () => {
  test('suggerisce i nomi delle opzioni dentro le parentesi quadre', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'lab-conf', content: 'r1[' });
    const position = new vscode.Position(0, 3); // subito dopo '['

    const completions = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    )) as vscode.CompletionList;

    const labels = completions.items.map(labelOf);
    assert.ok(labels.includes('image'), 'dovrebbe suggerire "image"');
    assert.ok(labels.includes('mem'), 'dovrebbe suggerire "mem"');
    assert.ok(labels.includes('bridged'), 'dovrebbe suggerire "bridged"');
  });

  test('suggerisce true/false per le opzioni booleane', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'lab-conf', content: 'r1[bridged]=' });
    const position = new vscode.Position(0, 12); // subito dopo '='

    const completions = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    )) as vscode.CompletionList;

    const labels = completions.items.map(labelOf).sort();
    assert.deepStrictEqual(labels, ['false', 'true']);
  });

  test('suggerisce i protocolli dopo la porta', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'lab-conf', content: 'r1[port]=3000:22/' });
    const position = new vscode.Position(0, 18); // subito dopo '/'

    const completions = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    )) as vscode.CompletionList;

    const labels = completions.items.map(labelOf).sort();
    assert.deepStrictEqual(labels, ['sctp', 'tcp', 'udp']);
  });

  test('suggerisce le chiavi LAB_* a inizio riga', async () => {
    const doc = await vscode.workspace.openTextDocument({ language: 'lab-conf', content: '' });
    const position = new vscode.Position(0, 0);

    const completions = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      position,
    )) as vscode.CompletionList;

    const labels = completions.items.map(labelOf);
    assert.ok(labels.includes('LAB_NAME'));
    assert.ok(labels.includes('LAB_VERSION'));
  });
});