import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseLabConf, parseLabDep, parseLabExt, stripQuotes } from '../../parser/labConfParser';

suite('parseLabConf', () => {
  test('riconosce i device e le interfacce', () => {
    const conf = `
r1[0]="A"
r1[1]="B"
pc1[0]="A"
`;
    const result = parseLabConf(conf);
    assert.strictEqual(result.devices.size, 2);
    assert.ok(result.devices.has('r1'));
    assert.strictEqual(result.devices.get('r1')?.interfaces.size, 2);
  });

  test('legge correttamente la fixture con errori intenzionali', () => {
    const fixturePath = path.resolve(__dirname, '../../../examples/test-linting/lab.conf');
    const text = fs.readFileSync(fixturePath, 'utf-8');
    const result = parseLabConf(text);
    assert.ok(result.devices.has('bad1'));
  });

  test('riconosce le chiavi di metadata LAB_*', () => {
    const conf = 'LAB_NAME="My Lab"\nLAB_VERSION=1.0\n';
    const result = parseLabConf(conf);
    assert.strictEqual(result.meta.get('LAB_NAME')?.value, '"My Lab"');
    assert.strictEqual(result.meta.get('LAB_VERSION')?.value, '1.0');
  });

  test('raggruppa più opzioni con lo stesso nome (es. più exec)', () => {
    const conf = 'r1[exec]="cmd1"\nr1[exec]="cmd2"\n';
    const result = parseLabConf(conf);
    const execOpts = result.devices.get('r1')?.options.get('exec');
    assert.strictEqual(execOpts?.length, 2);
    assert.strictEqual(execOpts?.[0].value, '"cmd1"');
    assert.strictEqual(execOpts?.[1].value, '"cmd2"');
  });

  test('classifica righe non riconosciute come "unknown"', () => {
    const conf = 'questa non è una riga valida\n';
    const result = parseLabConf(conf);
    assert.strictEqual(result.lines[0].kind, 'unknown');
  });

  test('ignora righe vuote e commenti', () => {
    const conf = '\n# commento\n   \nr1[0]="A"';
    const result = parseLabConf(conf);
    const kinds = result.lines.map((l) => l.kind);
    assert.deepStrictEqual(kinds, ['blank', 'comment', 'blank', 'interface']);
  });
});

suite('stripQuotes', () => {
  test('rimuove le virgolette doppie', () => {
    assert.strictEqual(stripQuotes('"kathara/base"'), 'kathara/base');
  });

  test('rimuove le virgolette singole', () => {
    assert.strictEqual(stripQuotes("'kathara/base'"), 'kathara/base');
  });

  test('lascia invariato un valore senza virgolette', () => {
    assert.strictEqual(stripQuotes('kathara/base'), 'kathara/base');
  });

  test('rimuove solo gli spazi esterni, non quelli interni alle virgolette', () => {
    assert.strictEqual(stripQuotes('  "  spaced  "  '), '  spaced  ');
  });

  test('non rimuove virgolette spaiate (aperta senza chiusa)', () => {
    assert.strictEqual(stripQuotes('"unclosed'), '"unclosed');
  });
});

suite('parseLabDep', () => {
  test('estrae le dipendenze per ogni device', () => {
    const dep = 'pc1: r1\npc2: r1 r2\n';
    const result = parseLabDep(dep);
    assert.deepStrictEqual(result.get('pc1'), ['r1']);
    assert.deepStrictEqual(result.get('pc2'), ['r1', 'r2']);
  });

  test('gestisce un device senza dipendenze (niente dopo i due punti)', () => {
    const dep = 'pc1:\n';
    const result = parseLabDep(dep);
    assert.deepStrictEqual(result.get('pc1'), []);
  });

  test('ignora righe di commento e righe vuote', () => {
    const dep = '# commento\n\npc1: r1\n';
    const result = parseLabDep(dep);
    assert.strictEqual(result.size, 1);
    assert.ok(result.has('pc1'));
  });

  test('ignora righe senza ":"', () => {
    const dep = 'riga non valida\npc1: r1\n';
    const result = parseLabDep(dep);
    assert.strictEqual(result.size, 1);
  });
});

suite('parseLabExt', () => {
  test('estrae collision domain e interfaccia', () => {
    const ext = 'A enp9s0\n';
    const result = parseLabExt(ext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].collisionDomain, 'A');
    assert.strictEqual(result[0].iface, 'enp9s0');
    assert.strictEqual(result[0].vlanId, null);
  });

  test('estrae il VLAN ID quando presente', () => {
    const ext = 'B enp9s0.20\n';
    const result = parseLabExt(ext);
    assert.strictEqual(result[0].iface, 'enp9s0');
    assert.strictEqual(result[0].vlanId, 20);
  });

  test('ignora righe di commento, vuote e malformate', () => {
    const ext = '# commento\n\nsoloUnCampo\nA enp9s0\n';
    const result = parseLabExt(ext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].collisionDomain, 'A');
  });

  test('numera correttamente le righe (lineNumber 1-based)', () => {
    const ext = '# comment\nA enp9s0\n';
    const result = parseLabExt(ext);
    assert.strictEqual(result[0].lineNumber, 2);
  });
});