import type { Category, Participant, SeatDetail, Table } from "../types";
import type { SaveSchemaV1 } from "./persist";

export type DocumentState = SaveSchemaV1 & {
  categories: Category[];
  participants: Participant[];
  title: string;
  showNames: boolean;
  attributeLabels: [string, string];
};
export type Journal = { present: DocumentState; past: DocumentState[]; future: DocumentState[] };

/** 既存形式との互換性を保った空席生成 */
export function emptySeat(index: number): SeatDetail {
  return { seatNumber: index + 1, id: "", name: "", attr1: "", attr2: "" };
}

/** 卓のピクセル値を小数点以下切り捨て、寸法を最小1pxに統一 */
export function integerTablePixels(table: Table): Table {
  const result = { ...table, x: Math.trunc(table.x), y: Math.trunc(table.y) };
  for (const key of ["width", "height", "radius"] as const) {
    const value = table[key];
    if (value !== undefined && Number.isFinite(value)) result[key] = Math.max(1, Math.trunc(value));
  }
  return result;
}

/** 任意のカテゴリ名と色を最大20種類まで検証 */
export function normalizeCategories(input: Category[] | undefined): Category[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20) throw new Error("カテゴリは最大20種類まで登録できます");
  const names = new Set<string>();
  return input.map(category => {
    const name = typeof category?.name === "string" ? category.name.trim() : "";
    if (!name || name.toLowerCase() === "none" || names.has(name)) throw new Error("カテゴリ名は空欄・none・重複を使用できません");
    if (typeof category.color !== "string" || !/^#[0-9a-f]{6}$/i.test(category.color)) throw new Error("カテゴリの色は#から始まる6桁のカラーコードで指定してください");
    names.add(name);
    return { name, color: category.color };
  });
}

/** カテゴリなし・未登録・旧ファイルの名札は白で描画 */
export function categoryColor(categories: Category[] | undefined, name: string | null | undefined): string {
  if (!name || name.toLowerCase() === "none") return "#ffffff";
  return categories?.find(category => category.name === name)?.color ?? "#ffffff";
}

/** 保存データの検証と表示席数・ピクセル値の正規化 */
export function normalizeDocument(input: SaveSchemaV1): DocumentState {
  if (input.version !== 1 || !["portrait", "landscape"].includes(input.orientation) || !Array.isArray(input.tables)) {
    throw new Error("席次表の形式が不正です");
  }
  const categories = normalizeCategories(input.categories);
  const participants: Participant[] = (input.participants ?? []).map(p => {
    const person = { ...p, id: String(p.id), attending: p.attending !== false, category: categories.some(c => c.name === p.category) ? p.category! : null };
    delete person.pta;
    return person;
  });
  const ids = new Set(participants.map(p => p.id));
  if (ids.size !== participants.length || participants.some(p => !p.id || !p.name.trim())) throw new Error("参加者IDの重複または氏名の空欄があります");
  const names = new Set<string>();
  const tableIds = new Set<string>();
  const assigned = new Set<string>();
  const tables = input.tables.map(t => {
    const alias = String(t.alias ?? "").trim();
    if (!alias || names.has(alias) || !t.id || tableIds.has(t.id)) throw new Error(`テーブル名またはIDが空欄・重複しています：${alias}`);
    names.add(alias); tableIds.add(t.id);
    if (!Number.isInteger(t.seats) || t.seats < 0 || t.seats > 100) throw new Error(`${alias}：席数は0〜100の整数にしてください`);
    if (t.joinedLayout && (!Number.isInteger(t.joinedLayout.firstSeats) || t.joinedLayout.firstSeats < 0 || t.joinedLayout.firstSeats > 100 || typeof t.joinedLayout.firstReversed !== "boolean" || typeof t.joinedLayout.secondReversed !== "boolean")) throw new Error(`${alias}：連結机の席配置が不正です`);
    if (!["circle", "square", "rectangle"].includes(t.shape) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) throw new Error(`${alias}：形状・座標が不正です`);
    const dimensions = t.shape === "circle" ? [t.radius] : [t.width, t.height];
    if (dimensions.some(n => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) throw new Error(`${alias}：寸法は正の数にしてください`);
    const plannedSeats = t.plannedSeats ?? t.seats;
    if (!Number.isInteger(plannedSeats) || plannedSeats < 0 || plannedSeats > t.seats) throw new Error(`${alias}：予定席数が不正です`);
    const seatsDetail = Array.from({ length: t.seats }, (_, index) => {
      const raw = t.seatsDetail?.[index] ?? emptySeat(index);
      const seat = { ...raw, seatNumber: index + 1, id: String(raw.id ?? ""), name: String(raw.name ?? ""), attr1: String(raw.attr1 ?? ""), attr2: String(raw.attr2 ?? "") };
      if (seat.name && !seat.id) seat.id = crypto.randomUUID();
      if (seat.id) {
        if (assigned.has(seat.id)) throw new Error(`${alias}・席${index + 1}：参加者が重複して配置されています`);
        assigned.add(seat.id);
        let person = participants.find(p => p.id === seat.id);
        if (!person) {
          if (!seat.name) throw new Error(`${alias}・席${index + 1}：参加者の氏名がありません`);
          person = { id: seat.id, name: seat.name, attr1: seat.attr1, attr2: seat.attr2, attending: true, category: null };
          participants.push(person);
        }
        Object.assign(seat, { name: person.name, attr1: person.attr1, attr2: person.attr2 });
      }
      return seat;
    });
    return { ...integerTablePixels(t), alias, plannedSeats, seatsDetail };
  });
  const scale = input.scale ?? 1;
  const fontSize = input.fontSize ?? 24;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10 || !Number.isFinite(fontSize) || fontSize < 6 || fontSize > 72) throw new Error("用紙倍率または文字サイズが不正です");
  const titleFontSize = input.titleFontSize ?? fontSize * 1.2;
  if (!Number.isFinite(titleFontSize) || titleFontSize < 6 || titleFontSize > 144) throw new Error("タイトル文字サイズは6〜144で指定してください");
  return { ...input, tables, participants, categories, scale, fontSize, titleFontSize, title: input.title ?? "席次表", showNames: input.showNames !== false, attributeLabels: input.attributeLabels ?? ["属性1", "属性2"] };
}

/** 空の会場データ生成 */
export function blankDocument(): DocumentState {
  return normalizeDocument({ version: 1, updatedAt: new Date().toISOString(), orientation: "landscape", scale: 1, fontSize: 18, titleFontSize: 60, tables: [], participants: [] });
}

/** 卓名の衝突回避 */
export function uniqueTableName(tables: Table[], base: string): string {
  let name = base, index = 2;
  while (tables.some(t => t.alias === name)) name = `${base} ${index++}`;
  return name;
}

/** 会場データを分離した編集用複製 */
export function cloneDocument(data: DocumentState): DocumentState {
  return structuredClone(data);
}
