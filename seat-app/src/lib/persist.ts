// src/lib/persist.ts
// 席次表アプリの状態を localStorage に保存/復元するためのユーティリティ

import type { Table } from "../types";
import type { Participant } from "../types";

// ここは将来のスキーマ進化を見据えて version を持たせる
export type Orientation = "portrait" | "landscape";

export type SaveSchemaV1 = {
  version: 1;
  updatedAt: string; // ISO文字列（デバッグ/将来用途）
  orientation: Orientation; // ページ向き
  scale?: number; // ページ拡大率（現状未使用なら省略可）
  fontSize?: number; // ← 追加：フォントサイズを保存
  tables: Table[]; // キャンバス上のテーブルと座席情報を丸ごと
  participants?: Participant[]; // 参加者リスト
  title?: string; // 追加：席次表タイトル
};

const STORAGE_KEY = "seatAppData";

/** 安全に parse（壊れたJSONや別スキーマに耐える） */
function safeParse(json: string | null): unknown | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    console.warn("[persist] JSON parse error. Ignore stored value.");
    return null;
  }
}

/** V1 形式かの軽量バリデーション（最低限の形だけチェック） */
function isSaveSchemaV1(x: unknown): x is SaveSchemaV1 {
  if (typeof x !== "object" || x === null) return false;
  const candidate = x as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    (candidate.orientation === "portrait" || candidate.orientation === "landscape") &&
    Array.isArray(candidate.tables)
  );
}

/** localStorage からロード（無ければ null） */
export function loadState(): SaveSchemaV1 | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = safeParse(raw);
  if (obj && isSaveSchemaV1(obj)) {
    return obj;
  }
  return null;
}

/** localStorage に保存（同期・上書き） */
export function saveState(data: SaveSchemaV1) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // 例：容量超過など
    console.error("[persist] save failed:", e);
  }
}

/** 既存データのクリア（デバッグ用） */
export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
