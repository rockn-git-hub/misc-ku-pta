// src/lib/rotate.ts
import type { Table } from "../types";

export type Orientation = "portrait" | "landscape";

/**
 * 用紙の向きを切り替えたときに、
 * テーブルの位置・向きをキャンバス中心基準で回転させる。
 *
 * @param tables - 変換対象のテーブル一覧
 * @param from - 現在の用紙向き
 * @param to - 変更後の用紙向き
 * @param fromSize - 現在のキャンバスサイズ
 * @param toSize - 変更後のキャンバスサイズ
 * @returns 新しいテーブル配列
 */
export function rotateTablesForOrientationChange(
  tables: Table[],
  from: Orientation,
  to: Orientation,
  fromSize: { width: number; height: number },
  toSize: { width: number; height: number }
): Table[] {
  const fromCenter = { x: fromSize.width / 2, y: fromSize.height / 2 };
  const toCenter = { x: toSize.width / 2, y: toSize.height / 2 };

  return tables.map((t) => {
    const dx = t.x - fromCenter.x;
    const dy = t.y - fromCenter.y;

    let newX = t.x;
    let newY = t.y;

    if (from === "portrait" && to === "landscape") {
      // ✅ 縦→横 = 左回転 (CCW)
      newX = toCenter.x + dy;
      newY = toCenter.y - dx;
    } else if (from === "landscape" && to === "portrait") {
      // ✅ 横→縦 = 右回転 (CW)
      newX = toCenter.x - dy;
      newY = toCenter.y + dx;
    }

    return {
      ...t,
      x: newX,
      y: newY,
      orientation:
        t.shape === "rectangle"
          ? t.orientation === "landscape"
            ? "portrait"
            : "landscape"
          : t.orientation,
    };
  });
}
