// ============================================================
// src/hooks/useTables.ts
// ------------------------------------------------------------
// 各テーブル（円卓・四角・長方形）の追加 / 削除 / 複製 / 更新を管理するカスタムフック。
// 内部的には最大100席の seatsDetail を常に保持し、
// UIでは table.seats の値だけを描画する構造。
// ------------------------------------------------------------

import type { Table, SeatDetail } from "../types";

// ------------------------------------------------------------
// 定数定義
// ------------------------------------------------------------
const MAX_SEATS = 100;
// === デフォルト定義（追加） ===
export const DEFAULT_CIRCLE_RADIUS = 117;
export const DEFAULT_SQUARE_SIZE = 200;
export const DEFAULT_RECT_WIDTH = 270;
export const DEFAULT_RECT_HEIGHT = 140;

// ✅ 座席100件分を生成する関数
function createSeatDetails(): SeatDetail[] {
  return Array.from({ length: MAX_SEATS }, (_, i) => ({
    seatNumber: i + 1,
    id: "",
    attr1: "",
    attr2: "",
    name: "",
  }));
}

// ------------------------------------------------------------
// useTables
// ------------------------------------------------------------
type UseTablesProps = {
  tables: Table[];
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  setSelectedId: (id: string | null) => void;
};

export function useTables({ tables, setTables, setSelectedId }: UseTablesProps) {
  // ============================================================
  // 🟢 テーブル追加
  // ============================================================
  const addTable = (shape: Table["shape"], orientation?: "landscape" | "portrait") => {
    const id = `T${Date.now()}`;
    const maxNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) : 0;
    const newNumber = maxNumber + 1;

    let newTable: Table;

    if (shape === "circle") {
      newTable = {
        id,
        number: newNumber,
        alias: `テーブル${newNumber}`,
        shape,
        x: 150,
        y: 150,
        radius: 117,
        seats: 8, // 表示席数
        seatsDetail: createSeatDetails(), // ✅ 100件ぶんの固定配列
      };
    } else if (shape === "square") {
      newTable = {
        id,
        number: newNumber,
        alias: `テーブル${newNumber}`,
        shape,
        x: 200,
        y: 200,
        width: 200,
        height: 200,
        seats: 4,
        seatsDetail: createSeatDetails(),
      };
    } else {
      // rectangle
      const isPortrait = orientation === "portrait";
      newTable = {
        id,
        number: newNumber,
        alias: `テーブル${newNumber}`,
        shape,
        x: 250,
        y: 250,
        width: isPortrait ? 140 : 270,
        height: isPortrait ? 270 : 140,
        seats: 4,
        seatsDetail: createSeatDetails(),
        orientation,
      };
    }

    setTables([...tables, newTable]);
  };

  // ============================================================
  // 🔴 テーブル削除
  // ============================================================
  const deleteTable = (id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  };

  // ============================================================
  // 🟣 テーブルコピー
  // ============================================================
  const copyTable = (id: string) => {
    const original = tables.find((t) => t.id === id);
    if (!original) return;

    const maxNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) : 0;
    const newNumber = maxNumber + 1;

    const newTable: Table = {
      ...original,
      id: `T${Date.now()}`,
      number: newNumber,
      alias: `テーブル${newNumber}`,
      x: original.x + 30,
      y: original.y + 30,
      seatsDetail: original.seatsDetail.map((seat) => ({
        ...seat,
        id: "",
        attr1: "",
        attr2: "",
        name: "",
      })),
    };

    setTables((prev) => [...prev, newTable]);
    setSelectedId(newTable.id);
  };

  // ============================================================
  // 🟡 テーブル更新
  // ============================================================
  const updateTable = (id: string, updates: Partial<Table>) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  // ============================================================
  // 📦 エクスポート
  // ============================================================
  return {
    addTable,
    deleteTable,
    copyTable,
    updateTable,
  };
}
