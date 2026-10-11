import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const bundle = await build({ stdin: { contents: 'export * from "./src/lib/seatGeometry";', resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const compiled = new Module(path.join(root, 'verify-seat-geometry.cjs'));
compiled.filename = path.join(root, 'verify-seat-geometry.cjs');
compiled._compile(bundle.outputFiles[0].text, compiled.filename);
const { buildSeatGeometry, fitTableToLabels, hasSeatOverlap, seatMetrics } = compiled.exports;
let cases = 0;
for (const shape of ['rectangle', 'square', 'circle']) for (const orientation of ['landscape', 'portrait']) {
  for (const count of [1, 2, 3, 4, 9, 24, 100]) for (const fontSize of [6, 18, 36, 72]) {
    const table = { id: 't', number: 1, alias: '第一学年のテーブル', shape, orientation, x: 320, y: 220, width: 200, height: 60, radius: 40, seats: count,
      seatsDetail: Array.from({ length: count }, (_, i) => ({ seatNumber: i + 1, id: `p${i}`, name: i % 3 ? '山田 太郎①' : '長い表示名を持つ参加者の名札テスト', attr1: 'A組', attr2: i % 2 ? '' : '属性2の表示' })) };
    const before = structuredClone(table);
    const participants = table.seatsDetail.map((s, i) => ({ ...s, attending: i % 7 !== 0 }));
    for (const showNames of [true, false]) {
      const display = { showNames, participants };
      const sizes = fitTableToLabels(table, fontSize, display);
      assert(Object.values(sizes).every(value => Number.isInteger(value) && value > 0));
      assert.deepEqual(table, before);
      const fitted = { ...table, ...sizes };
      const geometry = buildSeatGeometry(fitted, fontSize, display);
      assert.equal(geometry.length, count);
      assert(!hasSeatOverlap(geometry), `${shape}/${orientation}/${count}/${fontSize}/${showNames}`);
      for (const seat of geometry) {
        if (shape === 'circle') assert(Math.abs(Math.hypot(seat.x, seat.y) - fitted.radius) < 1e-7);
        else if (shape === 'rectangle' && orientation === 'landscape') assert.equal(Math.abs(seat.y), fitted.height / 2);
        else assert.equal(Math.abs(seat.x), fitted.width / 2);
      }
      assert.equal(geometry[0].text, '');
      if (!showNames) assert(geometry.every(s => !s.text));
      cases++;
    }
    table.seatsDetail = table.seatsDetail.map(s => ({ ...s, id: '', name: '', attr1: '', attr2: '' }));
    assert.equal(seatMetrics(table, 0, fontSize, { showNames: true }).width, 0);
    assert(!hasSeatOverlap(buildSeatGeometry({ ...table, ...fitTableToLabels(table, fontSize, { showNames: true }) }, fontSize, { showNames: true })));
  }
}
console.log(`PASS: ${cases} shape/orientation/count/font/display cases, empty seats, participation, edge placement, integer sizes, original data protection`);
