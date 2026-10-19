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
    seatWidth: Math.ceil(Math.max(fontSize * 2.2, textWidth(`席${index + 1}`, fontSize) + 8)), seatHeight: Math.ceil(fontSize * 1.4) };
}

/** 連結卓の席数変更にも追従する2台の構成 */
export function joinedLayout(table: Table) {
  const firstSeats = Math.min(table.seats, table.joinedLayout?.firstSeats ?? Math.ceil(table.seats / 2));
  return { firstSeats, firstReversed: table.joinedLayout?.firstReversed ?? false,
    secondReversed: table.joinedLayout?.secondReversed ?? (firstSeats % 2 === 1 && (table.seats - firstSeats) % 2 === 1) };
}

/** 席順を維持した各辺・各机の連続範囲 */
function seatGroups(table: Table) {
  if (table.shape !== "rectangle" || table.design !== "joined") {
    const split = Math.ceil(table.seats / 2);
    return [{ offset: 0, count: split, direction: -1, start: -0.5, span: 1 }, { offset: split, count: table.seats - split, direction: 1, start: -0.5, span: 1 }];
  }
  const layout = joinedLayout(table), second = table.seats - layout.firstSeats;
  const firstTop = layout.firstReversed ? Math.floor(layout.firstSeats / 2) : Math.ceil(layout.firstSeats / 2);
  const secondTop = layout.secondReversed ? Math.floor(second / 2) : Math.ceil(second / 2);
  const counts = [firstTop, secondTop, layout.firstSeats - firstTop, second - secondTop];
  let offset = 0;
  return counts.map((count, index) => {
    const group = { offset, count, direction: index < 2 ? -1 : 1, start: index % 2 === 0 ? -0.5 : 0, span: 0.5 };
    offset += count;
    return group;
  });
}

/** 縁に重ねた席番号と、外側に隣接する名札の位置 */
export function buildSeatGeometry(table: Table, fontSize: number, display: SeatDisplay): SeatGeometry[] {
  const metrics = Array.from({ length: table.seats }, (_, i) => seatMetrics(table, i, fontSize, display));
  if (table.shape === "circle") return metrics.map((m, i) => {
    const angle = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / table.seats;
    const dx = Math.cos(angle), dy = Math.sin(angle), radius = table.radius ?? 117;
    const x = dx * radius, y = dy * radius;
    // 左右対称の名札は大きい方の寸法を基準に距離と上端を統一
    const mirror = metrics[metrics.length - 1 - i];
    const labelHeight = Math.max(m.height, mirror.height);
    const distance = radius + Math.abs(dx) * (Math.max(m.seatWidth, mirror.seatWidth) + Math.max(m.width, mirror.width)) / 2
      + Math.abs(dy) * (Math.max(m.seatHeight, mirror.seatHeight) + labelHeight) / 2 + GAP;
    return { x, y, text: m.text, number: { x: x - m.seatWidth / 2, y: y - m.seatHeight / 2, width: m.seatWidth, height: m.seatHeight },
      label: { x: dx * distance - m.width / 2, y: dy * distance - labelHeight / 2, width: m.width, height: m.height } };
  });
  // 正方形も既存の席順を維持し、左右の辺へ配置
  const horizontal = table.shape !== "square" && table.orientation !== "portrait";
  const main = horizontal ? table.width ?? 270 : table.height ?? 200;
  const cross = horizontal ? table.height ?? 140 : table.width ?? 200;
  const groups = seatGroups(table);
  return metrics.map((m, i) => {
    const { offset, count, direction, start, span } = groups.find(group => i >= group.offset && i < group.offset + group.count)!;
    const side = metrics.slice(offset, offset + count);
    const cells = side.map(item => Math.max(horizontal ? item.width : item.height, horizontal ? item.seatWidth : item.seatHeight) + GAP);
    const total = cells.reduce((sum, size) => sum + size, 0);
    const before = cells.slice(0, i - offset).reduce((sum, size) => sum + size, 0);
    const along = main * start + main * span * (before + cells[i - offset] / 2) / total;
    const x = horizontal ? along : direction * cross / 2, y = horizontal ? direction * cross / 2 : along;
    const labelX = horizontal ? x - m.width / 2 : direction < 0 ? x - m.seatWidth / 2 - GAP - m.width : x + m.seatWidth / 2 + GAP;
    const labelY = horizontal ? direction < 0 ? y - m.seatHeight / 2 - GAP - m.height : y + m.seatHeight / 2 + GAP : y - m.height / 2;
    return { x, y, text: m.text, number: { x: x - m.seatWidth / 2, y: y - m.seatHeight / 2, width: m.seatWidth, height: m.seatHeight },
      label: { x: labelX, y: labelY, width: m.width, height: m.height } };
  });
}

/** 名札を避け、隣の席とは中間で分けた縮小表示用のクリック範囲 */
export function seatHitArea(table: Table, index: number, fontSize: number, display: SeatDisplay, scale: number): Box {
  const geometry = buildSeatGeometry(table, fontSize, display);
  const number = geometry[index].number;
  const minimum = 28 / Math.max(0.01, Math.abs(scale));
  const desired = geometry.map(seat => {
    const paddingX = Math.max(4, (minimum - seat.number.width) / 2);
    const paddingY = Math.max(4, (minimum - seat.number.height) / 2);
    return { x: seat.number.x - paddingX, y: seat.number.y - paddingY,
      width: seat.number.width + paddingX * 2, height: seat.number.height + paddingY * 2 };
  });
  const area = desired[index];
  let left = area.x, right = area.x + area.width, top = area.y, bottom = area.y + area.height;
  for (let i = 0; i < geometry.length; i++) {
    const other = geometry[i].number;
    if (i !== index && overlaps(area, desired[i])) {
      const horizontal = Math.max(other.x - number.x - number.width, number.x - other.x - other.width);
      const vertical = Math.max(other.y - number.y - number.height, number.y - other.y - other.height);
      if (horizontal >= vertical) {
        if (other.x > number.x) right = Math.min(right, (number.x + number.width + other.x) / 2);
        else left = Math.max(left, (other.x + other.width + number.x) / 2);
      } else if (other.y > number.y) bottom = Math.min(bottom, (number.y + number.height + other.y) / 2);
      else top = Math.max(top, (other.y + other.height + number.y) / 2);
    }
    const label = geometry[i].label;
    if (!geometry[i].text || !overlaps(area, label)) continue;
    if (label.x >= number.x + number.width) right = Math.min(right, label.x - 2);
    if (label.x + label.width <= number.x) left = Math.max(left, label.x + label.width + 2);
    if (label.y >= number.y + number.height) bottom = Math.min(bottom, label.y - 2);
    if (label.y + label.height <= number.y) top = Math.max(top, label.y + label.height + 2);
  }
  left = Math.min(left, number.x); right = Math.max(right, number.x + number.width);
  top = Math.min(top, number.y); bottom = Math.max(bottom, number.y + number.height);
  return { x: left - number.x, y: top - number.y, width: right - left, height: bottom - top };
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
  const cells = metrics.map(m => Math.max(horizontal ? m.width : m.height, horizontal ? m.seatWidth : m.seatHeight) + GAP);
  const main = Math.ceil(Math.max(...seatGroups(table).map(group => cells.slice(group.offset, group.offset + group.count).reduce((a, b) => a + b, 0) / group.span))) + 1;
  if (table.shape === "square") {
    const side = Math.max(main, titleWidth + seatWidth, titleHeight + seatHeight);
    return { width: side, height: side };
  }
  return horizontal ? { width: Math.max(main, titleWidth), height: Math.max(table.height ?? 140, titleHeight + seatHeight) }
    : { height: Math.max(main, titleHeight), width: Math.max(table.width ?? 140, titleWidth + seatWidth) };
}
