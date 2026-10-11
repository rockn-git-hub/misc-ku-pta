import type { Table } from "../types";
import { buildSeatGeometry } from "./seatGeometry";
import type { SeatDisplay } from "./seatGeometry";

type Footprint = { left: number; right: number; top: number; bottom: number };

/** 卓本体・席番号・表示中の名札を含む整数の外寸 */
function tableFootprint(table: Table, fontSize: number, display: SeatDisplay): Footprint {
  const width = table.shape === "circle" ? (table.radius ?? 117) * 2 : table.width ?? 270;
  const height = table.shape === "circle" ? (table.radius ?? 117) * 2 : table.height ?? 140;
  let left = -width / 2, right = width / 2, top = -height / 2, bottom = height / 2;
  for (const seat of buildSeatGeometry(table, fontSize, display)) {
    for (const box of [seat.number, ...(seat.text ? [seat.label] : [])]) {
      left = Math.min(left, box.x); right = Math.max(right, box.x + box.width);
      top = Math.min(top, box.y); bottom = Math.max(bottom, box.y + box.height);
    }
  }
  return { left: Math.ceil(-left), right: Math.ceil(right), top: Math.ceil(-top), bottom: Math.ceil(bottom) };
}

/** 卓の横位置と代表的な幅から現在の列を判定し、列内の上下順を保持 */
export function detectTableColumns(tables: Table[]): Table[][] {
  if (!tables.length) return [];
  const widths = tables.map(t => t.shape === "circle" ? (t.radius ?? 117) * 2 : t.width ?? 270).sort((a, b) => a - b);
  const tolerance = Math.max(40, widths[Math.floor(widths.length / 2)] * 0.75);
  const columns: Table[][] = [];
  for (const table of [...tables].sort((a, b) => a.x - b.x)) {
    const column = columns[columns.length - 1];
    const center = column ? column.reduce((sum, t) => sum + t.x, 0) / column.length : 0;
    if (!column || table.x - center > tolerance) columns.push([table]);
    else column.push(table);
  }
  return columns.map(column => column.sort((a, b) => a.y - b.y));
}

/** 現在の列分けを保ち、名札まで含めた余白で用紙中央へ位置だけを再配置 */
export function arrangeTables(tables: Table[], fontSize: number, display: SeatDisplay, page: { width: number; height: number }) {
  if (tables.length < 2) return [];
  const gap = Math.ceil(Math.max(64, fontSize * 2));
  const columns = detectTableColumns(tables).map(column => {
    const items = column.map(table => ({ table, box: tableFootprint(table, fontSize, display) }));
    const left = Math.max(...items.map(item => item.box.left)), right = Math.max(...items.map(item => item.box.right));
    const height = items.reduce((sum, item) => sum + item.box.top + item.box.bottom, 0) + gap * (items.length - 1);
    return { items, left, right, height };
  });
  const width = columns.reduce((sum, column) => sum + column.left + column.right, 0) + gap * (columns.length - 1);
  const height = Math.max(...columns.map(column => column.height));
  const margin = Math.ceil(Math.max(32, fontSize * 1.5));
  let left = Math.floor(Math.max(margin, (page.width - width) / 2));
  const top = Math.floor(Math.max(margin + fontSize * 2, (page.height - height) / 2));
  const positions: { id: string; x: number; y: number }[] = [];
  for (const column of columns) {
    const x = left + column.left;
    let cursor = top;
    for (const item of column.items) {
      positions.push({ id: item.table.id, x, y: cursor + item.box.top });
      cursor += item.box.top + item.box.bottom + gap;
    }
    left += column.left + column.right + gap;
  }
  return positions;
}
