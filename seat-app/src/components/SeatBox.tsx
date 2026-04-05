// src/components/SeatBox.tsx
// ============================================================
// SeatBox.tsx（リファクタリング・コメント強化版）
//  - 座席ボックス（四角形＋番号テキスト）
//  - ラベル（属性1/2/名前）と点線の描画
//  - クリックで「選択 → 入替」ロジック
//  - 幾何計算を関数に分離して読みやすさと保守性を向上
// ============================================================

import React from "react";
import { Group, Rect, Text, Line } from "react-konva";
import type { Table } from "../types";

// ------------------------------------------------------------
// Props 型定義（従来の呼び出し元と完全互換）
// ------------------------------------------------------------
type SeatBoxProps = {
  table: Table; // 対象のテーブル
  seatIndex: number; // 0-based の座席番号
  seatX: number; // テーブル中心(0,0)基準の座席X
  seatY: number; // テーブル中心(0,0)基準の座席Y
  labelX: number; // ラベル誘導点X（座席の外側に置くガイド点）
  labelY: number; // ラベル誘導点Y

  // 状態管理
  tables: Table[];
  selectedSeat: { tableIndex: number; seatIndex: number } | null;
  setSelectedSeat: React.Dispatch<
    React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>
  >;
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  fontSize: number;
};

// ラベル配置のモード
type LabelMode = "auto" | "horizontal" | "vertical";
// 縦長配置時の上下揃え
type VAlign = "center" | "top" | "bottom";

// ------------------------------------------------------------
// ユーティリティ群
// ------------------------------------------------------------

/** 数値を [min, max] に収める小道具 */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** テーブル形状からラベル配置モードを決める（※円卓は常に auto） */
function resolveLabelMode(table: Table): LabelMode {
  if (table.shape === "circle") return "auto";
  if (table.shape === "square") return "horizontal"; // 好みで "auto" でもOK
  // rectangle
  return table.orientation === "portrait" ? "horizontal" : "vertical";
}

/** 「座席ボックス」から点線の始点（座席側アンカー）を出す */
function getSeatAnchorPoint(
  seatX: number,
  seatY: number,
  seatW: number,
  seatH: number,
  labelMode: LabelMode,
  labelX: number,
  labelY: number
) {
  // ラベル誘導点と座席の相対位置ベクトル
  const dx = labelX - seatX;
  const dy = labelY - seatY;
  const nudge = 2; // 枠線と点線が重なって見えないのを防ぐ微小オフセット

  // モード別に「どの辺の中央から線を出すか」を決定
  if (labelMode === "horizontal") {
    // 左右にのみ出す（Yは座席中央）
    return dx < 0
      ? { x: seatX - seatW / 2 - nudge, y: seatY } // 左辺中央
      : { x: seatX + seatW / 2 + nudge, y: seatY }; // 右辺中央
  }
  if (labelMode === "vertical") {
    // 上下にのみ出す（Xは座席中央）
    return dy < 0
      ? { x: seatX, y: seatY - seatH / 2 - nudge } // 上辺中央
      : { x: seatX, y: seatY + seatH / 2 + nudge }; // 下辺中央
  }
  // auto：X成分が大きければ左右、そうでなければ上下
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0
      ? { x: seatX - seatW / 2 - nudge, y: seatY }
      : { x: seatX + seatW / 2 + nudge, y: seatY };
  } else {
    return dy < 0
      ? { x: seatX, y: seatY - seatH / 2 - nudge }
      : { x: seatX, y: seatY + seatH / 2 + nudge };
  }
}

/**
 * ラベル矩形の左上座標を計算
 * - auto: 円卓向けの象限/水平・垂直近似判定で配置
 * - horizontal: 左右固定。縦位置は vAlign で制御
 * - vertical: 上下固定。横位置は中央揃え
 */
function calculateLabelPosition(
  seatX: number,
  seatY: number,
  labelX: number,
  labelY: number,
  rectW: number,
  rectH: number,
  padding: number,
  epsilon: number, // 水平/垂直の近似判定（X）
  epsilonV: number, // 水平/垂直の近似判定（Y）
  mode: LabelMode,
  vAlign: VAlign = "center"
) {
  // gap: 点線の見せ幅。auto(円卓)はやや短めで視認性を優先
  const gap = mode === "auto" ? 6 : 8;
  const outerW = rectW + padding * 2;
  const outerH = rectH + padding * 2;

  // --- horizontal（左右固定） ---
  if (mode === "horizontal") {
    const leftSide = labelX - seatX < 0;
    const rectX = leftSide ? labelX - outerW - gap : labelX + gap;

    let rectY = labelY; // デフォルトは中心
    if (vAlign === "center") rectY = labelY - outerH / 2;
    if (vAlign === "top") rectY = labelY - outerH;
    if (vAlign === "bottom") rectY = labelY;

    return { rectX, rectY };
  }

  // --- vertical（上下固定） ---
  if (mode === "vertical") {
    const upperSide = labelY - seatY < 0;
    const rectY = upperSide ? labelY - outerH - gap : labelY + gap;
    // 横位置は中央揃え
    const rectX = labelX - outerW / 2;
    return { rectX, rectY };
  }

  // --- auto（円卓用：象限＆近似水平/垂直） ---
  let rectX = labelX;
  let rectY = labelY;

  if (Math.abs(seatY) < epsilonV) {
    // ほぼ水平：左右に出す
    if (seatX > 0) {
      rectX = labelX + gap;
      rectY = labelY - outerH / 2;
    } else {
      rectX = labelX - outerW - gap;
      rectY = labelY - outerH / 2;
    }
  } else if (Math.abs(seatX) < epsilon) {
    // ほぼ垂直：上下に出す
    rectX = labelX - outerW / 2;
    rectY = seatY < 0 ? labelY - outerH - gap : labelY + gap;
  } else {
    // 斜め：象限で分岐
    if (seatX > 0 && seatY < 0) {
      // 右上
      rectX = labelX + gap;
      rectY = labelY - outerH - gap;
    } else if (seatX > 0 && seatY > 0) {
      // 右下
      rectX = labelX + gap;
      rectY = labelY + gap;
    } else if (seatX < 0 && seatY < 0) {
      // 左上
      rectX = labelX - outerW - gap;
      rectY = labelY - outerH - gap;
    } else {
      // 左下
      rectX = labelX - outerW - gap;
      rectY = labelY + gap;
    }
  }

  return { rectX, rectY };
}

// ------------------------------------------------------------
// 小コンポーネント: SeatRect（座席ボックス本体）
// ------------------------------------------------------------
const SeatRect: React.FC<{
  seatIndex: number;
  seatX: number;
  seatY: number;
  seatWidth: number;
  seatHeight: number;
  fontSize: number;
  isSelected: boolean;
  onClick: (e: any) => void;
}> = ({ seatIndex, seatX, seatY, seatWidth, seatHeight, fontSize, isSelected, onClick }) => (
  <Group x={seatX} y={seatY} onClick={onClick}>
    {/* 座席矩形 */}
    <Rect
      width={seatWidth}
      height={seatHeight}
      fill="white"
      stroke={isSelected ? "red" : "black"} // 選択中は赤枠
      strokeWidth={2}
      cornerRadius={3}
      offsetX={seatWidth / 2}
      offsetY={seatHeight / 2}
    />
    {/* 座席番号 */}
    <Text
      text={`席${seatIndex + 1}`}
      fontSize={fontSize}
      fill="black"
      align="center"
      verticalAlign="middle"
      width={seatWidth}
      height={seatHeight}
      offsetX={seatWidth / 2}
      offsetY={seatHeight / 2}
    />
  </Group>
);

// ------------------------------------------------------------
// 小コンポーネント: SeatLabel（点線＋白箱＋文字）
// ------------------------------------------------------------
const SeatLabel: React.FC<{
  seatX: number; // 点線の始点（座席側）
  seatY: number;
  endX: number; // 点線の終点（ラベル側）
  endY: number;
  rectX: number; // ラベル外枠の左上
  rectY: number;
  rectWidth: number; // テキスト内側サイズ
  rectHeight: number;
  padding: number;
  fontSize: number;
  text: string;
}> = ({
  seatX,
  seatY,
  endX,
  endY,
  rectX,
  rectY,
  rectWidth,
  rectHeight,
  padding,
  fontSize,
  text,
}) => {
  const outerW = rectWidth + padding * 2;
  const outerH = rectHeight + padding * 2;
  return (
    <>
      <Line points={[seatX, seatY, endX, endY]} stroke="gray" strokeWidth={0.5} dash={[3, 3]} />
      <Rect x={rectX} y={rectY} width={outerW} height={outerH} fill="white" stroke="black" />
      <Text
        x={rectX + padding}
        y={rectY + padding}
        width={rectWidth}
        height={rectHeight}
        text={text}
        fontSize={fontSize}
      />
    </>
  );
};

// ------------------------------------------------------------
// メイン: SeatBox
// ------------------------------------------------------------
export const SeatBox: React.FC<SeatBoxProps> = (props) => {
  const {
    table,
    seatIndex,
    seatX,
    seatY,
    labelX,
    labelY,
    tables,
    selectedSeat,
    setSelectedSeat,
    setTables,
    fontSize,
  } = props;

  // --- 表示定数 ---
  const seatWidth = fontSize * 2.2;
  const seatHeight = fontSize * 1.2;
  const padding = 6;

  // --- ラベル文字列を生成（空文字は除外して行にする） ---
  const seat = table.seatsDetail[seatIndex];
  const labelText = seat
    ? [seat.attr1, seat.attr2, seat.name].filter((s) => s && s.trim() !== "").join("\n")
    : "";

  // --- ラベル内側サイズ（行数×フォント、幅は最長行） ---
  const lines = labelText ? labelText.split("\n") : [""];
  const maxChars = Math.max(...lines.map((l) => l.length), 1);
  // 文字幅は経験則的に 0.75em 程度を採用（必要なら将来メジャー計測へ差し替え可能）
  const rectWidth = fontSize * (maxChars * 0.75 + 2);
  const rectHeight = fontSize * lines.length;

  // --- 円卓以外は「ほぼ水平/垂直」の許容幅を広くしてパタつきを抑える ---
  let epsilon = 20;
  let epsilonV = 40;
  if (table.shape !== "circle") {
    epsilon = 100;
    epsilonV = 100;
  }

  // --- ラベル配置モードを決定 ---
  const labelMode = resolveLabelMode(table);

  // --- 座席側アンカー（点線の始点） ---
  const { x: anchorX, y: anchorY } = getSeatAnchorPoint(
    seatX,
    seatY,
    seatWidth,
    seatHeight,
    labelMode,
    labelX,
    labelY
  );

  // --- ラベル矩形 左上 ---
  const { rectX, rectY } = calculateLabelPosition(
    seatX,
    seatY,
    labelX,
    labelY,
    rectWidth,
    rectHeight,
    padding,
    epsilon,
    epsilonV,
    labelMode,
    "center"
  );

  // --- ラベル側の点（点線の終点） ---
  const outerW = rectWidth + padding * 2;
  const outerH = rectHeight + padding * 2;
  const { endX, endY } = (() => {
    if (labelMode === "horizontal") {
      // 水平成分固定：Y をアンカーに合わせて縦にクランプ
      const y = clamp(anchorY, rectY, rectY + outerH);
      const isLeft = labelX < seatX;
      return { endX: isLeft ? rectX + outerW : rectX, endY: y };
    }
    if (labelMode === "vertical") {
      // 垂直成分固定：X をアンカーに合わせて横にクランプ
      const x = clamp(anchorX, rectX, rectX + outerW);
      const isUp = labelY < seatY;
      return { endX: x, endY: isUp ? rectY + outerH : rectY };
    }
    // auto: 従来どおり最短辺へ
    const dx = labelX - seatX;
    const dy = labelY - seatY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { endX: dx < 0 ? rectX + outerW : rectX, endY: rectY + outerH / 2 };
    } else {
      return { endX: rectX + outerW / 2, endY: dy < 0 ? rectY + outerH : rectY };
    }
  })();

  // --- 選択中か（「別テーブルも含む座席の一意」比較） ---
  const isSelected =
    selectedSeat &&
    selectedSeat.tableIndex === tables.findIndex((t) => t.id === table.id) &&
    selectedSeat.seatIndex === seatIndex;

  // --- クリックで「選択 → 入替」 ---
  const handleClick = (e: any) => {
    e.cancelBubble = true; // テーブル全体へのイベント伝播を防止

    const targetTableId = table.id;
    const targetSeatIndex = seatIndex;

    // 1回目：選択
    if (!selectedSeat) {
      setSelectedSeat({
        tableIndex: tables.findIndex((t) => t.id === targetTableId),
        seatIndex: targetSeatIndex,
      });
      return;
    }

    // 2回目：入替
    const src = { ...selectedSeat };

    setTables((prev) => {
      const newTables = [...prev];
      const fromTableIndex = src.tableIndex;
      const toTableIndex = newTables.findIndex((t) => t.id === targetTableId);
      if (fromTableIndex < 0 || toTableIndex < 0) return prev;

      const fromTable = { ...newTables[fromTableIndex] };
      const sameTable = fromTableIndex === toTableIndex;
      const toTable = sameTable ? fromTable : { ...newTables[toTableIndex] };

      const fromSeats = [...fromTable.seatsDetail];
      const toSeats = sameTable ? fromSeats : [...toTable.seatsDetail];

      const srcSeatIdx = src.seatIndex;
      const dstSeatIdx = targetSeatIndex;
      if (sameTable && srcSeatIdx === dstSeatIdx) return prev; // 同じ席は何もしない

      const srcSeatObj = { ...fromSeats[srcSeatIdx] };
      const dstSeatObj = { ...toSeats[dstSeatIdx] };

      // ※ seatNumber は固定、それ以外（id/attr1/attr2/name）をスワップ
      [srcSeatObj.id, dstSeatObj.id] = [dstSeatObj.id, srcSeatObj.id];
      [srcSeatObj.attr1, dstSeatObj.attr1] = [dstSeatObj.attr1, srcSeatObj.attr1];
      [srcSeatObj.attr2, dstSeatObj.attr2] = [dstSeatObj.attr2, srcSeatObj.attr2];
      [srcSeatObj.name, dstSeatObj.name] = [dstSeatObj.name, srcSeatObj.name];

      fromSeats[srcSeatIdx] = srcSeatObj;
      toSeats[dstSeatIdx] = dstSeatObj;

      fromTable.seatsDetail = fromSeats;
      if (!sameTable) toTable.seatsDetail = toSeats;

      newTables[fromTableIndex] = fromTable;
      if (!sameTable) newTables[toTableIndex] = toTable;

      return newTables;
    });

    // 選択解除
    setSelectedSeat(null);
  };

  // --- 描画 ---
  return (
    <Group>
      {/* 座席ボックス */}
      <SeatRect
        seatIndex={seatIndex}
        seatX={seatX}
        seatY={seatY}
        seatWidth={seatWidth}
        seatHeight={seatHeight}
        fontSize={fontSize}
        isSelected={!!isSelected}
        onClick={handleClick}
      />

      {/* ラベル（空なら描かない） */}
      {labelText && (
        <SeatLabel
          seatX={anchorX}
          seatY={anchorY}
          endX={endX}
          endY={endY}
          rectX={rectX}
          rectY={rectY}
          rectWidth={rectWidth}
          rectHeight={rectHeight}
          padding={padding}
          fontSize={fontSize}
          text={labelText}
        />
      )}
    </Group>
  );
};
