import XLSX from "xlsx-js-style";
import { emptySeat, normalizeDocument } from "./workspace";
import type { DocumentState } from "./workspace";
import type { Participant, Table } from "../types";

type CellValue = string | number | boolean;
type ImportRow = { table: string; seat: number | null; person: Participant | null; row: number };
export type ImportPreview = { data: DocumentState; summary: string[] };
const layoutColumns = ["テーブル名", "形状", "デザイン", "向き", "X座標", "Y座標", "幅", "高さ", "半径", "予定席数", "表示席数", "内部ID", "内部連番"];

/** 保存名に使用できない文字の除去 */
export function safeFilename(title: string): string {
  return (title.trim() || "席次表").replace(/[\\/:*?"<>|]/g, "");
}

/** 生成したファイルのダウンロード */
export function downloadDocument(data: DocumentState) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safeFilename(data.title)}.json`);
}

/** ブラウザーのファイル保存 */
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** セルの見出しと復元情報を読みやすく整形 */
function styleSheet(sheet: XLSX.WorkSheet, headerRow: number, gray: boolean) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let row = 0; row <= range.e.r; row++) {
    for (let col = 0; col <= range.e.c; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[address];
      if (!cell) continue;
      const header = row === headerRow;
      cell.s = {
        font: { name: "Yu Gothic", sz: 11, bold: header, color: { rgb: gray ? "475569" : "0F172A" } },
        fill: { fgColor: { rgb: header ? "D9ECEC" : gray ? "E5E7EB" : "FFFFFF" } },
        alignment: { vertical: "center", wrapText: true },
      };
    }
  }
  sheet["!cols"] = Array.from({ length: range.e.c + 1 }, (_, i) => ({ wch: i === 0 || i === 2 ? 30 : 18 }));
}

/** 2シートによる全体保存用ワークブック生成 */
export function buildWorkbook(data: DocumentState): XLSX.WorkBook {
  const rows: CellValue[][] = [["テーブル名", "席番号", "氏名", data.attributeLabels[0], data.attributeLabels[1], "参加", "参加者ID"]];
  const used = new Set<string>();
  for (const table of data.tables) {
    table.seatsDetail.slice(0, table.seats).forEach((seat, index) => {
      const person = data.participants.find(p => p.id === seat.id);
      if (person) used.add(person.id);
      rows.push([table.alias, index + 1, person?.name ?? "", person?.attr1 ?? "", person?.attr2 ?? "", person ? person.attending === false ? "OFF" : "ON" : "", person?.id ?? ""]);
    });
  }
  for (const person of data.participants.filter(p => !used.has(p.id))) {
    rows.push(["", "", person.name, person.attr1, person.attr2, person.attending === false ? "OFF" : "ON", person.id]);
  }
  const roster = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(roster, 0, false);
  const settings: CellValue[][] = [
    ["配置もExcelで編集できます。見出し・内部IDは変更しないでください"],
    ["形式", "seat-app-excel-1"],
    ["座標・寸法は会場内のpx。円卓は半径、その他は幅・高さを使用。未着席者は席次の卓名・席番号を空欄に記載"],
    ["席次表名", "用紙向き", "会場倍率", "文字サイズ", "氏名・属性表示", "属性1見出し", "属性2見出し", "タイトル文字サイズ"],
    [data.title, data.orientation === "portrait" ? "縦" : "横", data.scale ?? 1, data.fontSize ?? 24, data.showNames ? "ON" : "OFF", ...data.attributeLabels, data.titleFontSize ?? (data.fontSize ?? 24) * 1.2],
    ["会場倍率は既存会場の座標系を復元する値。画面の表示倍率とは別"],
    ["形状：円卓／正方形／長机。デザイン：通常／くっつけた長机。向き：横／縦。予定席数：0〜100。追加は既存行をコピー"],
    layoutColumns,
    ...data.tables.map(t => [t.alias, t.shape === "circle" ? "円卓" : t.shape === "square" ? "正方形" : "長机", t.design === "joined" ? "くっつけた長机" : "通常", t.orientation === "portrait" ? "縦" : "横", t.x, t.y, t.width ?? "", t.height ?? "", t.radius ?? "", t.plannedSeats ?? t.seats, t.seats, t.id, t.number]),
  ];
  const layout = XLSX.utils.aoa_to_sheet(settings);
  styleSheet(layout, 7, true);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, roster, "席次");
  XLSX.utils.book_append_sheet(workbook, layout, "配置");
  return workbook;
}

/** 新規生成ブックの検証用入力制限だけを追加し、他のパッケージ要素を保持 */
export function workbookBytes(data: DocumentState): Uint8Array {
  const buffer = XLSX.write(buildWorkbook(data), { type: "array", bookType: "xlsx" });
  const archive = XLSX.CFB.read(new Uint8Array(buffer), { type: "buffer" });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const paths = ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"];
  const validations = [
    '<dataValidations count="2"><dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="席番号" error="1〜100の整数を入力してください" sqref="B2:B1048576"><formula1>1</formula1><formula2>100</formula2></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="F2:F1048576"><formula1>"ON,OFF"</formula1></dataValidation></dataValidations>',
    '<dataValidations count="5"><dataValidation type="list" showErrorMessage="1" sqref="B9:B1048576"><formula1>"円卓,正方形,長机"</formula1></dataValidation><dataValidation type="list" showErrorMessage="1" sqref="C9:C1048576"><formula1>"通常,くっつけた長机"</formula1></dataValidation><dataValidation type="list" showErrorMessage="1" sqref="D9:D1048576"><formula1>"横,縦"</formula1></dataValidation><dataValidation type="whole" operator="between" showErrorMessage="1" sqref="J9:K1048576"><formula1>1</formula1><formula2>100</formula2></dataValidation><dataValidation type="decimal" operator="greaterThan" allowBlank="1" showErrorMessage="1" sqref="G9:I1048576"><formula1>0</formula1></dataValidation></dataValidations>',
  ];
  paths.forEach((path, index) => {
    const entry = XLSX.CFB.find(archive, `/${path}`);
    if (!entry?.content) throw new Error("Excelの生成に失敗しました");
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array));
    const insertion = xml.indexOf("<ignoredErrors") >= 0 ? "<ignoredErrors" : "</worksheet>";
    const patched = xml.replace(insertion, validations[index] + insertion);
    XLSX.CFB.utils.cfb_add(archive, `/${path}`, encoder.encode(patched));
  });
  return new Uint8Array(XLSX.CFB.write(archive, { type: "buffer", fileType: "zip" }));
}

/** Excel全体保存 */
export function downloadWorkbook(data: DocumentState) {
  const bytes = workbookBytes(data);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFilename(data.title)}.xlsx`);
}

/** 参加フラグの入力検証 */
function participation(value: unknown, location: string): boolean {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || text === "ON") return true;
  if (text === "OFF") return false;
  throw new Error(`${location}：参加はON／OFFで指定してください`);
}

/** 行番号を付けて席次を解析 */
function readRoster(workbook: XLSX.WorkBook): ImportRow[] {
  const sheet = workbook.Sheets["席次"] ?? workbook.Sheets["着席名簿"] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true }) as unknown[][];
  const headers = (rows[0] ?? []).map(String);
  const tableCol = headers.indexOf("テーブル名");
  const seatCol = headers.indexOf("席番号") >= 0 ? headers.indexOf("席番号") : headers.indexOf("座席番号");
  const nameCol = headers.indexOf("氏名") >= 0 ? headers.indexOf("氏名") : headers.indexOf("名前");
  if ([tableCol, seatCol, nameCol].some(i => i < 0)) throw new Error("席次・1行：テーブル名、席番号、氏名の列が必要です");
  const result: ImportRow[] = [];
  rows.slice(1).forEach((values, index) => {
    if (values.every(v => String(v).trim() === "")) return;
    const row = index + 2;
    const table = String(values[tableCol] ?? "").trim();
    const rawSeat = String(values[seatCol] ?? "").trim();
    const seat = rawSeat === "" ? null : Number(rawSeat);
    const name = String(values[nameCol] ?? "").trim();
    if (table && (seat === null || !Number.isInteger(seat) || seat < 1 || seat > 100)) throw new Error(`席次・${row}行：席番号は1〜100の整数にしてください`);
    if (!table && rawSeat) throw new Error(`席次・${row}行：席番号に対応するテーブル名がありません`);
    const idCol = headers.lastIndexOf("参加者ID");
    const flagCol = headers.lastIndexOf("参加");
    const person = name ? { id: idCol >= 0 && values[idCol] ? String(values[idCol]) : crypto.randomUUID(), name, attr1: String(values[3] ?? ""), attr2: String(values[4] ?? ""), attending: participation(flagCol >= 0 ? values[flagCol] : "ON", `席次・${row}行`) } : null;
    result.push({ table, seat, person, row });
  });
  return result;
}

/** レイアウトと会場設定の復元 */
function readLayout(workbook: XLSX.WorkBook): DocumentState {
  const sheet = workbook.Sheets["配置"] ?? workbook.Sheets["会場レイアウト"];
  if (!sheet) throw new Error("席次表の読み込みには配置シートが必要です");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true }) as unknown[][];
  if (rows[1]?.[1] !== "seat-app-excel-1") throw new Error("配置・2行：形式が不正です");
  if (layoutColumns.some((name, index) => rows[7]?.[index] !== name)) throw new Error("配置・8行：列名が不正です");
  const settings = rows[4];
  if (!settings || !["横", "縦"].includes(String(settings[1]))) throw new Error("配置・5行：用紙向きが不正です");
  const tables: Table[] = [];
  rows.slice(8).forEach((r, index) => {
    if (r.every(v => String(v).trim() === "")) return;
    const location = `配置・${index + 9}行`;
    if (!["円卓", "正方形", "長机"].includes(String(r[1])) || !["通常", "くっつけた長机"].includes(String(r[2])) || !["横", "縦"].includes(String(r[3]))) throw new Error(`${location}：形状・デザイン・向きが不正です`);
    if (r[1] !== "長机" && r[2] !== "通常") throw new Error(`${location}：くっつけた長机は形状「長机」で指定してください`);
    if (r[4] === "" || r[5] === "") throw new Error(`${location}：座標を入力してください`);
    const seats = Math.max(Number(r[9]), Number(r[10] || r[9]));
    const alias = String(r[0]).trim();
    if (!alias || tables.some(t => t.alias === alias)) throw new Error(`${location}：テーブル名が空欄または重複しています`);
    const rawId = String(r[11] || crypto.randomUUID());
    const id = tables.some(t => t.id === rawId) ? crypto.randomUUID() : rawId;
    const rawNumber = Number(r[12]);
    const number = Number.isInteger(rawNumber) && rawNumber > 0 && !tables.some(t => t.number === rawNumber) ? rawNumber : Math.max(0, ...tables.map(t => t.number)) + 1;
    const table: Table = { id, number, alias, shape: r[1] === "円卓" ? "circle" : r[1] === "正方形" ? "square" : "rectangle", ...(r[2] === "くっつけた長机" ? { design: "joined" as const } : {}), orientation: r[3] === "縦" ? "portrait" : "landscape", x: Number(r[4]), y: Number(r[5]), width: r[6] === "" ? undefined : Number(r[6]), height: r[7] === "" ? undefined : Number(r[7]), radius: r[8] === "" ? undefined : Number(r[8]), plannedSeats: Number(r[9]), seats, seatsDetail: [] };
    try {
      normalizeDocument({ version: 1, updatedAt: "", orientation: "landscape", tables: [table], participants: [] });
    } catch (error) { throw new Error(`${location}：${error instanceof Error ? error.message : "復元情報が不正です"}`); }
    tables.push(table);
  });
  return normalizeDocument({ version: 1, updatedAt: new Date().toISOString(), orientation: settings[1] === "縦" ? "portrait" : "landscape", scale: Number(settings[2]), fontSize: Number(settings[3]), titleFontSize: settings[7] === undefined || settings[7] === "" ? undefined : Number(settings[7]), showNames: participation(settings[4], "配置・5行"), attributeLabels: [String(settings[5]), String(settings[6])], title: String(settings[0]), tables, participants: [] });
}

/** 全体復元または席次だけの置き換えを事前検証 */
export function parseWorkbook(workbook: XLSX.WorkBook, current: DocumentState, mode: "full" | "roster"): ImportPreview {
  const source = mode === "full" ? readLayout(workbook) : structuredClone(current);
  const rows = readRoster(workbook);
  const participants: Participant[] = [];
  const occupied = new Set<string>();
  const ids = new Set<string>();
  source.tables.forEach(t => { t.seats = t.plannedSeats ?? t.seats; t.seatsDetail = Array.from({ length: t.seats }, (_, index) => emptySeat(index)); });
  const summary: string[] = [];
  for (const row of rows) {
    if (row.person) {
      if (ids.has(row.person.id)) throw new Error(`席次・${row.row}行：参加者IDが重複しています`);
      ids.add(row.person.id); participants.push(row.person);
    }
    if (!row.table) continue;
    const table = source.tables.find(t => t.alias === row.table);
    if (!table) throw new Error(`席次・${row.row}行：テーブル「${row.table}」が存在しません`);
    const key = `${table.id}:${row.seat}`;
    if (occupied.has(key)) throw new Error(`席次・${row.row}行：${row.table}・席${row.seat}が重複しています`);
    occupied.add(key);
    const seatIndex = row.seat! - 1;
    while (table.seatsDetail.length <= seatIndex) table.seatsDetail.push(emptySeat(table.seatsDetail.length));
    table.seats = Math.max(table.seats, row.seat!);
    if (row.person) table.seatsDetail[seatIndex] = { seatNumber: row.seat!, id: row.person.id, name: row.person.name, attr1: row.person.attr1, attr2: row.person.attr2 };
  }
  source.participants = participants;
  const data = normalizeDocument(source);
  const on = participants.filter(p => p.attending !== false);
  const seated = new Set(data.tables.flatMap(t => t.seatsDetail.map(s => s.id).filter(Boolean)));
  summary.push(`${data.tables.length}卓・参加${on.length}名・着席${on.filter(p => seated.has(p.id)).length}名・不参加${participants.length - on.length}名`);
  for (const table of data.tables) {
    const before = current.tables.find(t => t.alias === table.alias);
    if (!before && mode === "full") summary.push(`追加：${table.alias}`);
    if (before && table.seats > before.seats) summary.push(`${table.alias}：${before.seats}席 → ${table.seats}席`);
  }
  if (mode === "full") current.tables.filter(t => !data.tables.some(next => next.alias === t.alias)).forEach(t => summary.push(`削除：${t.alias}`));
  return { data, summary };
}

/** 読み込みファイルの解析。現在のデータは変更しない */
export async function readImport(file: File, current: DocumentState, mode: "full" | "roster"): Promise<ImportPreview> {
  if (file.name.toLowerCase().endsWith(".json")) {
    if (mode !== "full") throw new Error("席次だけ読み込む場合はExcelを選んでください");
    const data = normalizeDocument(JSON.parse(await file.text()));
    return { data, summary: [`${data.tables.length}卓・名簿${data.participants.length}名`, ...current.tables.filter(t => !data.tables.some(n => n.alias === t.alias)).map(t => `削除：${t.alias}`)] };
  }
  return parseWorkbook(XLSX.read(await file.arrayBuffer(), { type: "array" }), current, mode);
}
