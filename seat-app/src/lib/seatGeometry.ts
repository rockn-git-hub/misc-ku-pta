import type { Participant, Table } from "../types";

export type SeatDisplay = { showNames: boolean; participants?: Participant[] };
type Box = { x: number; y: number; width: number; height: number };
export type SeatGeometry = { x: number; y: number; label: Box; number: Box; text: string };
const GAP = 6;
let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/** 描画と同じArialで文字幅を計測し、繰り返し描画では結果を再利用 */
function textWidth(text: string, fontSize: number) {
  const key = `${fontSize}:${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  if (context === undefined) context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (context) context.font = `${fontSize}px Arial`;
  const width = context?.measureText(text).width ?? [...text].reduce((sum, char) => sum + (char.codePointAt(0)! > 127 ? fontSize : fontSize * 0.65), 0);
  if (widths.size >= 4000) widths.clear();
  widths.set(key, width);
  return width;
}

/** 氏名表示と参加状態を反映した名札・席番号の共通寸法 */
export function seatMetrics(table: Table, index: number, fontSize: number, display: SeatDisplay) {
  const seat = table.seatsDetail[index];
  const visible = display.showNames && display.participants?.find(p => p.id === seat?.id)?.attending !== false;
  const text = seat && visible ? [seat.attr1, seat.attr2, seat.name].filter(s => s?.trim()).join("\n") : "";
  const lines = text.split("\n");
  const padding = 8;
  const rectWidth = Math.ceil(Math.max(...lines.map(line => textWidth(line, fontSize))) + fontSize);
  const rectHeight = fontSize * lines.length;
  return { text, padding, rectWidth, rectHeight, width: text ? rectWidth + padding * 2 : 0,
    height: text ? rectHeight + padding * 2 : 0,
    seatWidth: Math.ceil(Math.max(fontSize * 2.2, textWidth(`席${index + 1}`, fontSize) + 8)), seatHeight: Math.ceil(fontSize * 1.2) };
}

/** 縁に重ねた席番号と、外側に隣接する名札の位置 */
export function buildSeatGeometry(table: Table, fontSize: number, display: SeatDisplay): SeatGeometry[] {
  const metrics = Array.from({ length: table.seats }, (_, i) => seatMetrics(table, i, fontSize, display));
  if (table.shape === "circle") return metrics.map((m, i) => {
    const angle = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / table.seats;
    const dx = Math.cos(angle), dy = Math.sin(angle), radius = table.radius ?? 117;
    const x = dx * radius, y = dy * radius;
    const distance = radius + Math.abs(dx) * (m.seatWidth + m.width) / 2 + Math.abs(dy) * (m.seatHeight + m.height) / 2 + GAP;
    return { x, y, text: m.text, number: { x: x - m.seatWidth / 2, y: y - m.seatHeight / 2, width: m.seatWidth, height: m.seatHeight },
      label: { x: dx * distance - m.width / 2, y: dy * distance - m.height / 2, width: m.width, height: m.height } };
  });
  // 正方形も既存の席順を維持し、左右の辺へ配置
  const horizontal = table.shape !== "square" && table.orientation !== "portrait";
  const main = horizontal ? table.width ?? 270 : table.height ?? 200;
  const cross = horizontal ? table.height ?? 140 : table.width ?? 200;
  const split = Math.ceil(table.seats / 2);
  return metrics.map((m, i) => {
    const offset = i < split ? 0 : split, count = i < split ? split : table.seats - split;
    const side = metrics.slice(offset, offset + count);
    const cells = side.map(item => Math.max(horizontal ? item.width : item.height, horizontal ? item.seatWidth : item.seatHeight) + GAP);
    const total = cells.reduce((sum, size) => sum + size, 0);
    const before = cells.slice(0, i - offset).reduce((sum, size) => sum + size, 0);
    const along = -main / 2 + main * (before + cells[i - offset] / 2) / total;
    const direction = i < split ? -1 : 1;
    const x = horizontal ? along : direction * cross / 2, y = horizontal ? direction * cross / 2 : along;
    const labelX = horizontal ? x - m.width / 2 : direction < 0 ? x - m.seatWidth / 2 - GAP - m.width : x + m.seatWidth / 2 + GAP;
    const labelY = horizontal ? direction < 0 ? y - m.seatHeight / 2 - GAP - m.height : y + m.seatHeight / 2 + GAP : y - m.height / 2;
    return { x, y, text: m.text, number: { x: x - m.seatWidth / 2, y: y - m.seatHeight / 2, width: m.seatWidth, height: m.seatHeight },
      label: { x: labelX, y: labelY, width: m.width, height: m.height } };
  });
}

/** 余白を含めた2つの枠の重なり判定 */
function overlaps(a: Box, b: Box) {
  return a.width > 0 && b.width > 0 && a.height > 0 && b.height > 0
    && a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP
    && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP;
}

/** 同じ卓の別の席に属する名札・席番号の重なり判定 */
export function hasSeatOverlap(geometry: SeatGeometry[]) {
  for (let i = 0; i < geometry.length; i++) for (let j = i + 1; j < geometry.length; j++) {
    const a = geometry[i], b = geometry[j];
    if (overlaps(a.label, b.label) || overlaps(a.number, b.number) || overlaps(a.label, b.number) || overlaps(a.number, b.label)) return true;
  }
  return false;
}

/** 卓名と各席の表示寸法から、重ならない整数の寸法を算出 */
export function fitTableToLabels(table: Table, fontSize: number, display: SeatDisplay): Partial<Table> {
  const titleWidth = Math.ceil(Math.max(textWidth(table.alias, fontSize), textWidth(`(${table.seats}席)`, fontSize)) + 24);
  const titleHeight = Math.ceil(fontSize * 3.6);
  const metrics = Array.from({ length: table.seats }, (_, i) => seatMetrics(table, i, fontSize, display));
  const seatWidth = Math.max(0, ...metrics.map(m => m.seatWidth));
  const seatHeight = Math.max(0, ...metrics.map(m => m.seatHeight));
  if (table.shape === "circle") {
    const minimum = Math.ceil(Math.hypot(titleWidth / 2, titleHeight / 2) + Math.hypot(seatWidth / 2, seatHeight / 2));
    let low = minimum, high = minimum;
    while (hasSeatOverlap(buildSeatGeometry({ ...table, radius: high }, fontSize, display))) high *= 2;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (hasSeatOverlap(buildSeatGeometry({ ...table, radius: middle }, fontSize, display))) low = middle + 1;
      else high = middle;
    }
    return { radius: high };
  }
  const horizontal = table.shape !== "square" && table.orientation !== "portrait";
  const split = Math.ceil(table.seats / 2);
  const cells = metrics.map(m => Math.max(horizontal ? m.width : m.height, horizontal ? m.seatWidth : m.seatHeight) + GAP);
  const main = Math.ceil(Math.max(cells.slice(0, split).reduce((a, b) => a + b, 0), cells.slice(split).reduce((a, b) => a + b, 0))) + 1;
  if (table.shape === "square") {
    const side = Math.max(main, titleWidth + seatWidth, titleHeight + seatHeight);
    return { width: side, height: side };
  }
  return horizontal ? { width: Math.max(main, titleWidth), height: Math.max(table.height ?? 140, titleHeight + seatHeight) }
    : { height: Math.max(main, titleHeight), width: Math.max(table.width ?? 140, titleWidth + seatWidth) };
}
