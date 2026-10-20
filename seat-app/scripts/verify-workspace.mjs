import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const XLSX = require('xlsx-js-style');
const bundle = await build({ stdin: { contents: 'export * from "./src/lib/workspace"; export * from "./src/lib/workbook"; export * from "./src/lib/rotate";', resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const compiled = new Module(path.join(root, 'verify-workspace.cjs'));
compiled.filename = path.join(root, 'verify-workspace.cjs');
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const { blankDocument, normalizeDocument, emptySeat, buildWorkbook, workbookBytes, parseWorkbook, rotateTablesForOrientationChange, categoryColor, normalizeCategories } = compiled.exports;
const fixture = blankDocument();
fixture.title = '第一学年 懇親会';
fixture.attributeLabels = ['クラス', '役職'];
fixture.showNames = false;
fixture.categories = [{ name: 'PTA', color: '#fef08a' }, { name: '先生', color: '#fce7f3' }, { name: '実行委員', color: '#dbeafe' }];
fixture.tables = [{ id: 't1', number: 99, alias: 'A組1卓', shape: 'rectangle', design: 'joined', orientation: 'landscape', x: 320, y: 220, width: 540, height: 140, seats: 6, plannedSeats: 4, seatsDetail: Array.from({ length: 6 }, (_, i) => emptySeat(i)) }];
fixture.participants = [
  { category: 'PTA', id: 'p1', name: '山田 太郎', attr1: 'A組', attr2: '', attending: true },
  { id: 'p2', name: '鈴木 花子', attr1: 'A組', attr2: '', attending: false },
  { category: '先生', id: 'p3', name: '同姓 同名', attr1: 'B組', attr2: '未着席', attending: true },
];
fixture.tables[0].seatsDetail[0] = { ...emptySeat(0), ...fixture.participants[0] };
fixture.tables[0].seatsDetail[4] = { ...emptySeat(4), ...fixture.participants[1] };
const source = normalizeDocument(fixture);
const bytes = workbookBytes(source);
const decoded = XLSX.read(bytes, { type: 'array' });
assert.deepEqual(decoded.SheetNames, ['席次', '配置', 'カテゴリ']);
const restored = parseWorkbook(decoded, blankDocument(), 'full').data;
assert.equal(restored.title, source.title);
assert.equal(restored.showNames, false);
assert.deepEqual(restored.attributeLabels, source.attributeLabels);
assert.equal(restored.tables[0].number, 99);
assert.equal(restored.tables[0].x, 320);
assert.equal(restored.tables[0].width, 540);
assert.equal(restored.tables[0].plannedSeats, 4);
assert.equal(restored.tables[0].seats, 6);
assert.equal(restored.tables[0].seatsDetail[3].id, '');
assert.equal(restored.tables[0].seatsDetail[4].id, 'p2');
assert.equal(restored.participants.find(p => p.id === 'p2').attending, false);
assert.ok(restored.participants.some(p => p.id === 'p3'));
// カテゴリと色は着席者・未着席者ともに復元し、旧ファイルは全員白
assert.deepEqual(restored.categories, source.categories);
assert.equal(restored.participants.find(p => p.id === 'p1').category, 'PTA');
assert.equal(restored.participants.find(p => p.id === 'p2').category, null);
assert.equal(restored.participants.find(p => p.id === 'p3').category, '先生');
assert.deepEqual(normalizeDocument(JSON.parse(JSON.stringify(source))).participants, source.participants);
const oldJson = normalizeDocument({ ...source, categories: undefined, participants: source.participants.map(person => ({ ...person, pta: true })) });
assert.ok(oldJson.participants.every(person => person.category === null));
assert.ok(oldJson.participants.every(person => !('pta' in person)));
const oldWorkbook = buildWorkbook(source);
delete oldWorkbook.Sheets['カテゴリ']; oldWorkbook.SheetNames = ['席次', '配置'];
assert.ok(parseWorkbook(oldWorkbook, blankDocument(), 'full').data.participants.every(person => person.category === null));
const oldPtaWorkbook = buildWorkbook(source);
delete oldPtaWorkbook.Sheets['カテゴリ']; oldPtaWorkbook.SheetNames = ['席次', '配置'];
oldPtaWorkbook.Sheets['席次'].H1 = { t: 's', v: 'PTA' };
oldPtaWorkbook.Sheets['席次'].H2 = { t: 's', v: 'ON' };
assert.ok(parseWorkbook(oldPtaWorkbook, blankDocument(), 'full').data.participants.every(person => person.category === null));
for (const value of [null, undefined, 'none', 'NONE', '未登録']) {
  const sample = structuredClone(source); sample.participants[0].category = value;
  assert.equal(normalizeDocument(sample).participants[0].category, null);
  assert.equal(categoryColor(sample.categories, value), '#ffffff');
}
assert.equal(categoryColor(source.categories, '先生'), '#fce7f3');
assert.equal(categoryColor(source.categories, 'PTA'), '#fef08a');
const recolored = structuredClone(source.categories); recolored[0].color = '#abcdef';
assert.equal(categoryColor(recolored, 'PTA'), '#abcdef');
assert.equal(normalizeCategories(Array.from({ length: 20 }, (_, i) => ({ name: `分類${i}`, color: '#abcdef' }))).length, 20);
assert.throws(() => normalizeCategories(Array.from({ length: 21 }, (_, i) => ({ name: `分類${i}`, color: '#abcdef' }))), /20/);
assert.throws(() => normalizeCategories([{ name: 'none', color: '#abcdef' }]), /none/);
assert.throws(() => normalizeCategories([{ name: '', color: '#abcdef' }]), /空欄/);
assert.throws(() => normalizeCategories([{ name: 'PTA', color: '#abcdef' }, { name: 'PTA', color: '#abcdef' }]), /重複/);
assert.throws(() => normalizeCategories([{ name: 'PTA', color: 'invalid' }]), /カラーコード/);
assert.equal(parseWorkbook(decoded, source, 'roster').data.participants.find(p => p.id === 'p3').category, '先生');
const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
const text = new TextDecoder();
const rosterXml = text.decode(XLSX.CFB.find(archive, '/xl/worksheets/sheet1.xml').content);
assert.ok(rosterXml.includes('カテゴリ'));
const layoutXml = text.decode(XLSX.CFB.find(archive, '/xl/worksheets/sheet2.xml').content);
assert.ok(!layoutXml.includes('<sheetProtection'));
assert.ok(!/<sheetProtection[^>]*password=/.test(layoutXml));
assert.ok(layoutXml.includes('<dataValidations count="5">'));
assert.ok(layoutXml.includes('円卓,正方形,長机'));
const styleXml = text.decode(XLSX.CFB.find(archive, '/xl/styles.xml').content);
assert.ok(styleXml.includes('E5E7EB'));
const normalizedLegacy = normalizeDocument({ ...source, participants: source.participants.map(({ attending, ...p }) => p) });
assert.ok(normalizedLegacy.participants.every(p => p.attending));

/** テスト用の名簿シートだけを生成 */
function roster(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['テーブル名', '席番号', '氏名', '属性1', '属性2', '参加'], ...rows]), '席次');
  return wb;
}
const sparse = parseWorkbook(roster([['A組1卓', 1, '一郎', 'A組'], ['A組1卓', 2, '二郎'], ['A組1卓', 3, '三郎'], ['A組1卓', 5, '五郎'], ['A組1卓', 6, '六郎', '', '', 'OFF']]), source, 'roster').data;
assert.equal(sparse.tables[0].x, source.tables[0].x);
assert.equal(sparse.tables[0].number, 99);
assert.equal(sparse.tables[0].seats, 6);
assert.equal(sparse.tables[0].seatsDetail[3].name, '');
assert.equal(sparse.participants.length, 5);
assert.throws(() => parseWorkbook(roster([['A組1卓', 1, '一郎'], ['A組1卓', 1, '二郎']]), source, 'roster'), /重複/);
assert.throws(() => parseWorkbook(roster([['存在しない卓', 1, '一郎']]), source, 'roster'), /存在しません/);
assert.throws(() => parseWorkbook(roster([['A組1卓', 1.5, '一郎']]), source, 'roster'), /整数/);
assert.throws(() => parseWorkbook(roster([['A組1卓', 1, '一郎', '', '', '不明']]), source, 'roster'), /ON／OFF/);
assert.throws(() => parseWorkbook(roster([['A組1卓', '', '一郎']]), source, 'roster'), /整数/);
assert.throws(() => parseWorkbook(roster([]), source, 'full'), /配置/);
const added = buildWorkbook(source);
XLSX.utils.sheet_add_aoa(added.Sheets['配置'], [['新しい卓', '円卓', '通常', '横', 400, 500, '', '', 100, 4, 4, 't1', 99]], { origin: 'A10' });
assert.equal(parseWorkbook(added, source, 'full').data.tables.length, 2);
assert.notEqual(parseWorkbook(added, source, 'full').data.tables[1].id, 't1');
const rotated = rotateTablesForOrientationChange(source.tables, 'landscape', 'portrait', { width: 1123, height: 794 }, { width: 794, height: 1123 });
assert.equal(rotated[0].width, 140);
assert.equal(rotated[0].height, 540);
const roundTrip = rotateTablesForOrientationChange(rotated, 'portrait', 'landscape', { width: 794, height: 1123 }, { width: 1123, height: 794 });
assert.deepEqual(roundTrip, source.tables);
assert.equal(source.tables[0].seatsDetail[0].id, 'p1');
// 旧シート名と並び順の異なるExcelによる読み込み互換性
const legacy = buildWorkbook(source);
legacy.Sheets['着席名簿'] = legacy.Sheets['席次'];
legacy.Sheets['会場レイアウト'] = legacy.Sheets['配置'];
delete legacy.Sheets['席次']; delete legacy.Sheets['配置'];
legacy.SheetNames = ['会場レイアウト', '着席名簿', 'カテゴリ'];
const legacyDecoded = XLSX.read(XLSX.write(legacy, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
const legacyRestored = parseWorkbook(legacyDecoded, blankDocument(), 'full').data;
assert.deepEqual(legacyRestored.tables, restored.tables);
assert.deepEqual(legacyRestored.participants, restored.participants);
assert.deepEqual(parseWorkbook(legacyDecoded, source, 'roster').data.tables, parseWorkbook(decoded, source, 'roster').data.tables);
console.log('PASS: Excel new/legacy sheet names, category colors/20-limit/legacy white, workbook round trip, protection/validation, participation, sparse seats, name matching, invalid imports, table addition, rotation round trip, original data protection');
await fs.writeFile(path.join(os.tmpdir(), 'seat-workspace-ui.json'), JSON.stringify(source), 'utf8');
if (process.argv[2]) {
  const exportedBytes = await fs.readFile(process.argv[2]);
  const imported = parseWorkbook(XLSX.read(exportedBytes, { type: 'buffer' }), blankDocument(), 'full').data;
  if (process.argv[3]) {
    const expected = normalizeDocument(JSON.parse(await fs.readFile(process.argv[3], 'utf8')));
    assert.deepEqual(imported.categories, expected.categories);
    assert.deepEqual(imported.participants.map(p => [p.id, p.name, p.category]).sort(), expected.participants.map(p => [p.id, p.name, p.category]).sort());
  }
  console.log(JSON.stringify({ browserWorkbook: true, tables: imported.tables.length, participants: imported.participants.length, attending: imported.participants.filter(p => p.attending).length, title: imported.title }));
}
