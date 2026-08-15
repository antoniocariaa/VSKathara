import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Diagnostics su lab.conf', () => {
  test('la fixture di test-linting genera errori', async () => {
    const fixture = path.resolve(__dirname, '../../../examples/test-linting/lab.conf');
    const doc = await vscode.workspace.openTextDocument(fixture);
    await vscode.window.showTextDocument(doc);

    // attende che il provider di diagnostica aggiorni le diagnostics
    await new Promise((r) => setTimeout(r, 500));

    const diags = vscode.languages.getDiagnostics(doc.uri);
    const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length >= 9, `attesi almeno 9 errori, trovati ${errors.length}`);
  });
});