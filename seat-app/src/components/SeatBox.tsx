// src/components/SeatBox.tsx
// ============================================================
// SeatBox.tsx・医Μ繝輔ぃ繧ｯ繧ｿ繝ｪ繝ｳ繧ｰ繝ｻ繧ｳ繝｡繝ｳ繝亥ｼｷ蛹也沿・・
//  - 蠎ｧ蟶ｭ繝懊ャ繧ｯ繧ｹ・亥屁隗貞ｽ｢・狗分蜿ｷ繝・く繧ｹ繝茨ｼ・
//  - 繝ｩ繝吶Ν・亥ｱ樊ｧ1/2/蜷榊燕・峨→轤ｹ邱壹・謠冗判
//  - 繧ｯ繝ｪ繝・け縺ｧ縲碁∈謚・竊・蜈･譖ｿ縲阪Ο繧ｸ繝・け
//  - 蟷ｾ菴戊ｨ育ｮ励ｒ髢｢謨ｰ縺ｫ蛻・屬縺励※隱ｭ縺ｿ繧・☆縺輔→菫晏ｮ域ｧ繧貞髄荳・
// ============================================================

import React from "react";
import { Group, Rect, Text, Line } from "react-konva";
import type { Table } from "../types";

// ------------------------------------------------------------
// Props 蝙句ｮ夂ｾｩ・亥ｾ捺擂縺ｮ蜻ｼ縺ｳ蜃ｺ縺怜・縺ｨ螳悟・莠呈鋤・・
// ------------------------------------------------------------
type SeatBoxProps = {
  table: Table; // 蟇ｾ雎｡縺ｮ繝・・繝悶Ν
  seatIndex: number; // 0-based 縺ｮ蠎ｧ蟶ｭ逡ｪ蜿ｷ
  seatX: number; // 繝・・繝悶Ν荳ｭ蠢・0,0)蝓ｺ貅悶・蠎ｧ蟶ｭX
  seatY: number; // 繝・・繝悶Ν荳ｭ蠢・0,0)蝓ｺ貅悶・蠎ｧ蟶ｭY
  labelX: number; // 繝ｩ繝吶Ν隱伜ｰ守せX・亥ｺｧ蟶ｭ縺ｮ螟門・縺ｫ鄂ｮ縺上ぎ繧､繝臥せ・・
  labelY: number; // 繝ｩ繝吶Ν隱伜ｰ守せY

  // 迥ｶ諷狗ｮ｡逅・
  tables: Table[];
  selectedSeat: { tableIndex: number; seatIndex: number } | null;
  setSelectedSeat: React.Dispatch<
    React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>
  >;
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  fontSize: number;
};

// 繝ｩ繝吶Ν驟咲ｽｮ縺ｮ繝｢繝ｼ繝・
type LabelMode = "auto" | "horizontal" | "vertical";
// 邵ｦ髟ｷ驟咲ｽｮ譎ゅ・荳贋ｸ区純縺・
type VAlign = "center" | "top" | "bottom";

// ------------------------------------------------------------
// 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ鄒､
// ------------------------------------------------------------

/** 謨ｰ蛟､繧・[min, max] 縺ｫ蜿弱ａ繧句ｰ城％蜈ｷ */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** 繝・・繝悶Ν蠖｢迥ｶ縺九ｉ繝ｩ繝吶Ν驟咲ｽｮ繝｢繝ｼ繝峨ｒ豎ｺ繧√ｋ・遺ｻ蜀・酷縺ｯ蟶ｸ縺ｫ auto・・*/
function resolveLabelMode(table: Table): LabelMode {
  if (table.shape === "circle") return "auto";
  if (table.shape === "square") return "horizontal"; // 螂ｽ縺ｿ縺ｧ "auto" 縺ｧ繧０K
  // rectangle
  return table.orientation === "portrait" ? "horizontal" : "vertical";
}

/** 縲悟ｺｧ蟶ｭ繝懊ャ繧ｯ繧ｹ縲阪°繧臥せ邱壹・蟋狗せ・亥ｺｧ蟶ｭ蛛ｴ繧｢繝ｳ繧ｫ繝ｼ・峨ｒ蜃ｺ縺・*/
function getSeatAnchorPoint(
  seatX: number,
  seatY: number,
  seatW: number,
  seatH: number,
  labelMode: LabelMode,
  labelX: number,
  labelY: number
) {
  // 繝ｩ繝吶Ν隱伜ｰ守せ縺ｨ蠎ｧ蟶ｭ縺ｮ逶ｸ蟇ｾ菴咲ｽｮ繝吶け繝医Ν
  const dx = labelX - seatX;
  const dy = labelY - seatY;
  const nudge = 2; // 譫邱壹→轤ｹ邱壹′驥阪↑縺｣縺ｦ隕九∴縺ｪ縺・・繧帝亟縺仙ｾｮ蟆上が繝輔そ繝・ヨ

  // 繝｢繝ｼ繝牙挨縺ｫ縲後←縺ｮ霎ｺ縺ｮ荳ｭ螟ｮ縺九ｉ邱壹ｒ蜃ｺ縺吶°縲阪ｒ豎ｺ螳・
  if (labelMode === "horizontal") {
    // 蟾ｦ蜿ｳ縺ｫ縺ｮ縺ｿ蜃ｺ縺呻ｼ・縺ｯ蠎ｧ蟶ｭ荳ｭ螟ｮ・・
    return dx < 0
      ? { x: seatX - seatW / 2 - nudge, y: seatY } // 蟾ｦ霎ｺ荳ｭ螟ｮ
      : { x: seatX + seatW / 2 + nudge, y: seatY }; // 蜿ｳ霎ｺ荳ｭ螟ｮ
  }
  if (labelMode === "vertical") {
    // 荳贋ｸ九↓縺ｮ縺ｿ蜃ｺ縺呻ｼ・縺ｯ蠎ｧ蟶ｭ荳ｭ螟ｮ・・
    return dy < 0
      ? { x: seatX, y: seatY - seatH / 2 - nudge } // 荳願ｾｺ荳ｭ螟ｮ
      : { x: seatX, y: seatY + seatH / 2 + nudge }; // 荳玖ｾｺ荳ｭ螟ｮ
  }
  // auto・唸謌仙・縺悟､ｧ縺阪￠繧後・蟾ｦ蜿ｳ縲√◎縺・〒縺ｪ縺代ｌ縺ｰ荳贋ｸ・
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
 * 繝ｩ繝吶Ν遏ｩ蠖｢縺ｮ蟾ｦ荳雁ｺｧ讓吶ｒ險育ｮ・
 * - auto: 蜀・酷蜷代￠縺ｮ雎｡髯・豌ｴ蟷ｳ繝ｻ蝙ら峩霑台ｼｼ蛻､螳壹〒驟咲ｽｮ
 * - horizontal: 蟾ｦ蜿ｳ蝗ｺ螳壹らｸｦ菴咲ｽｮ縺ｯ vAlign 縺ｧ蛻ｶ蠕｡
 * - vertical: 荳贋ｸ句崋螳壹よｨｪ菴咲ｽｮ縺ｯ荳ｭ螟ｮ謠・∴
 */
function calculateLabelPosition(
  seatX: number,
  seatY: number,
  labelX: number,
  labelY: number,
  rectW: number,
  rectH: number,
  padding: number,
  epsilon: number, // 豌ｴ蟷ｳ/蝙ら峩縺ｮ霑台ｼｼ蛻､螳夲ｼ・・・
  epsilonV: number, // 豌ｴ蟷ｳ/蝙ら峩縺ｮ霑台ｼｼ蛻､螳夲ｼ・・・
  mode: LabelMode,
  vAlign: VAlign = "center"
) {
  // gap: 轤ｹ邱壹・隕九○蟷・Ｂuto(蜀・酷)縺ｯ繧・ｄ遏ｭ繧√〒隕冶ｪ肴ｧ繧貞━蜈・
  const gap = mode === "auto" ? 6 : 8;
  const outerW = rectW + padding * 2;
  const outerH = rectH + padding * 2;

  // --- horizontal・亥ｷｦ蜿ｳ蝗ｺ螳夲ｼ・---
  if (mode === "horizontal") {
    const leftSide = labelX - seatX < 0;
    const rectX = leftSide ? labelX - outerW - gap : labelX + gap;

    let rectY = labelY; // 繝・ヵ繧ｩ繝ｫ繝医・荳ｭ蠢・
    if (vAlign === "center") rectY = labelY - outerH / 2;
    if (vAlign === "top") rectY = labelY - outerH;
    if (vAlign === "bottom") rectY = labelY;

    return { rectX, rectY };
  }

  // --- vertical・井ｸ贋ｸ句崋螳夲ｼ・---
  if (mode === "vertical") {
    const upperSide = labelY - seatY < 0;
    const rectY = upperSide ? labelY - outerH - gap : labelY + gap;
    // 讓ｪ菴咲ｽｮ縺ｯ荳ｭ螟ｮ謠・∴
    const rectX = labelX - outerW / 2;
    return { rectX, rectY };
  }

  // --- auto・亥・蜊鍋畑・夊ｱ｡髯撰ｼ・ｿ台ｼｼ豌ｴ蟷ｳ/蝙ら峩・・---
  let rectX = labelX;
  let rectY = labelY;

  if (Math.abs(seatY) < epsilonV) {
    // 縺ｻ縺ｼ豌ｴ蟷ｳ・壼ｷｦ蜿ｳ縺ｫ蜃ｺ縺・
    if (seatX > 0) {
      rectX = labelX + gap;
      rectY = labelY - outerH / 2;
    } else {
      rectX = labelX - outerW - gap;
      rectY = labelY - outerH / 2;
    }
  } else if (Math.abs(seatX) < epsilon) {
    // 縺ｻ縺ｼ蝙ら峩・壻ｸ贋ｸ九↓蜃ｺ縺・
    rectX = labelX - outerW / 2;
    rectY = seatY < 0 ? labelY - outerH - gap : labelY + gap;
  } else {
    // 譁懊ａ・夊ｱ｡髯舌〒蛻・ｲ・
    if (seatX > 0 && seatY < 0) {
      // 蜿ｳ荳・
      rectX = labelX + gap;
      rectY = labelY - outerH - gap;
    } else if (seatX > 0 && seatY > 0) {
      // 蜿ｳ荳・
      rectX = labelX + gap;
      rectY = labelY + gap;
    } else if (seatX < 0 && seatY < 0) {
      // 蟾ｦ荳・
      rectX = labelX - outerW - gap;
      rectY = labelY - outerH - gap;
    } else {
      // 蟾ｦ荳・
      rectX = labelX - outerW - gap;
      rectY = labelY + gap;
    }
  }

  return { rectX, rectY };
}

// ------------------------------------------------------------
// 蟆上さ繝ｳ繝昴・繝阪Φ繝・ SeatRect・亥ｺｧ蟶ｭ繝懊ャ繧ｯ繧ｹ譛ｬ菴難ｼ・
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
    {/* 蠎ｧ蟶ｭ遏ｩ蠖｢ */}
    <Rect
      width={seatWidth}
      height={seatHeight}
      fill="#ffffff"
      stroke={isSelected ? "#0284c7" : "#64748b"}
      strokeWidth={isSelected ? 2.2 : 1.25}
      cornerRadius={6}
      shadowColor="#0f172a"
      shadowBlur={6}
      shadowOpacity={0.1}
      shadowOffsetY={1}
      offsetX={seatWidth / 2}
      offsetY={seatHeight / 2}
    />
    {/* 蠎ｧ蟶ｭ逡ｪ蜿ｷ */}
    <Text
      text={`蟶ｭ${seatIndex + 1}`}
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
// 蟆上さ繝ｳ繝昴・繝阪Φ繝・ SeatLabel・育せ邱夲ｼ狗區邂ｱ・区枚蟄暦ｼ・
// ------------------------------------------------------------
const SeatLabel: React.FC<{
  seatX: number; // 轤ｹ邱壹・蟋狗せ・亥ｺｧ蟶ｭ蛛ｴ・・
  seatY: number;
  endX: number; // 轤ｹ邱壹・邨らせ・医Λ繝吶Ν蛛ｴ・・
  endY: number;
  rectX: number; // 繝ｩ繝吶Ν螟匁棧縺ｮ蟾ｦ荳・
  rectY: number;
  rectWidth: number; // 繝・く繧ｹ繝亥・蛛ｴ繧ｵ繧､繧ｺ
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
      <Line points={[seatX, seatY, endX, endY]} stroke="#94a3b8" strokeWidth={1} dash={[4, 4]} />
      <Rect
        x={rectX}
        y={rectY}
        width={outerW}
        height={outerH}
        fill="#ffffff"
        stroke="#64748b"
        strokeWidth={1}
        cornerRadius={8}
        shadowColor="#0f172a"
        shadowBlur={5}
        shadowOpacity={0.08}
        shadowOffsetY={1}
      />
      <Text
        x={rectX + padding}
        y={rectY + padding}
        width={rectWidth}
        height={rectHeight}
        text={text}
        fontSize={fontSize}
        fill="#0f172a"
      />
    </>
  );
};

// ------------------------------------------------------------
// 繝｡繧､繝ｳ: SeatBox
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

  // --- 陦ｨ遉ｺ螳壽焚 ---
  const seatWidth = fontSize * 2.2;
  const seatHeight = fontSize * 1.2;
  const padding = 8;

  // --- 繝ｩ繝吶Ν譁・ｭ怜・繧堤函謌撰ｼ育ｩｺ譁・ｭ励・髯､螟悶＠縺ｦ陦後↓縺吶ｋ・・---
  const seat = table.seatsDetail[seatIndex];
  const labelText = seat
    ? [seat.attr1, seat.attr2, seat.name].filter((s) => s && s.trim() !== "").join("\n")
    : "";

  // --- 繝ｩ繝吶Ν蜀・・繧ｵ繧､繧ｺ・郁｡梧焚ﾃ励ヵ繧ｩ繝ｳ繝医∝ｹ・・譛髟ｷ陦鯉ｼ・---
  const lines = labelText ? labelText.split("\n") : [""];
  const maxChars = Math.max(...lines.map((l) => l.length), 1);
  // 譁・ｭ怜ｹ・・邨碁ｨ灘援逧・↓ 0.75em 遞句ｺｦ繧呈治逕ｨ・亥ｿ・ｦ√↑繧牙ｰ・擂繝｡繧ｸ繝｣繝ｼ險域ｸｬ縺ｸ蟾ｮ縺玲崛縺亥庄閭ｽ・・
  const rectWidth = fontSize * (maxChars * 0.75 + 2);
  const rectHeight = fontSize * lines.length;

  // --- 蜀・酷莉･螟悶・縲後⊇縺ｼ豌ｴ蟷ｳ/蝙ら峩縲阪・險ｱ螳ｹ蟷・ｒ蠎・￥縺励※繝代ち縺､縺阪ｒ謚代∴繧・---
  let epsilon = 20;
  let epsilonV = 40;
  if (table.shape !== "circle") {
    epsilon = 100;
    epsilonV = 100;
  }

  // --- 繝ｩ繝吶Ν驟咲ｽｮ繝｢繝ｼ繝峨ｒ豎ｺ螳・---
  const labelMode = resolveLabelMode(table);

  // --- 蠎ｧ蟶ｭ蛛ｴ繧｢繝ｳ繧ｫ繝ｼ・育せ邱壹・蟋狗せ・・---
  const { x: anchorX, y: anchorY } = getSeatAnchorPoint(
    seatX,
    seatY,
    seatWidth,
    seatHeight,
    labelMode,
    labelX,
    labelY
  );

  // --- 繝ｩ繝吶Ν遏ｩ蠖｢ 蟾ｦ荳・---
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

  // --- 繝ｩ繝吶Ν蛛ｴ縺ｮ轤ｹ・育せ邱壹・邨らせ・・---
  const outerW = rectWidth + padding * 2;
  const outerH = rectHeight + padding * 2;
  const { endX, endY } = (() => {
    if (labelMode === "horizontal") {
      // 豌ｴ蟷ｳ謌仙・蝗ｺ螳夲ｼ唳 繧偵い繝ｳ繧ｫ繝ｼ縺ｫ蜷医ｏ縺帙※邵ｦ縺ｫ繧ｯ繝ｩ繝ｳ繝・
      const y = clamp(anchorY, rectY, rectY + outerH);
      const isLeft = labelX < seatX;
      return { endX: isLeft ? rectX + outerW : rectX, endY: y };
    }
    if (labelMode === "vertical") {
      // 蝙ら峩謌仙・蝗ｺ螳夲ｼ唸 繧偵い繝ｳ繧ｫ繝ｼ縺ｫ蜷医ｏ縺帙※讓ｪ縺ｫ繧ｯ繝ｩ繝ｳ繝・
      const x = clamp(anchorX, rectX, rectX + outerW);
      const isUp = labelY < seatY;
      return { endX: x, endY: isUp ? rectY + outerH : rectY };
    }
    // auto: 蠕捺擂縺ｩ縺翫ｊ譛遏ｭ霎ｺ縺ｸ
    const dx = labelX - seatX;
    const dy = labelY - seatY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { endX: dx < 0 ? rectX + outerW : rectX, endY: rectY + outerH / 2 };
    } else {
      return { endX: rectX + outerW / 2, endY: dy < 0 ? rectY + outerH : rectY };
    }
  })();

  // --- 驕ｸ謚樔ｸｭ縺具ｼ医悟挨繝・・繝悶Ν繧ょ性繧蠎ｧ蟶ｭ縺ｮ荳諢上肴ｯ碑ｼ・ｼ・---
  const isSelected =
    selectedSeat &&
    selectedSeat.tableIndex === tables.findIndex((t) => t.id === table.id) &&
    selectedSeat.seatIndex === seatIndex;

  // --- 繧ｯ繝ｪ繝・け縺ｧ縲碁∈謚・竊・蜈･譖ｿ縲・---
  const handleClick = (e: any) => {
    e.cancelBubble = true; // 繝・・繝悶Ν蜈ｨ菴薙∈縺ｮ繧､繝吶Φ繝井ｼ晄眺繧帝亟豁｢

    const targetTableId = table.id;
    const targetSeatIndex = seatIndex;

    // 1蝗樒岼・夐∈謚・
    if (!selectedSeat) {
      setSelectedSeat({
        tableIndex: tables.findIndex((t) => t.id === targetTableId),
        seatIndex: targetSeatIndex,
      });
      return;
    }

    // 2蝗樒岼・壼・譖ｿ
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
      if (sameTable && srcSeatIdx === dstSeatIdx) return prev; // 蜷後§蟶ｭ縺ｯ菴輔ｂ縺励↑縺・

      const srcSeatObj = { ...fromSeats[srcSeatIdx] };
      const dstSeatObj = { ...toSeats[dstSeatIdx] };

      // 窶ｻ seatNumber 縺ｯ蝗ｺ螳壹√◎繧御ｻ･螟厄ｼ・d/attr1/attr2/name・峨ｒ繧ｹ繝ｯ繝・・
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

    // 驕ｸ謚櫁ｧ｣髯､
    setSelectedSeat(null);
  };

  // --- 謠冗判 ---
  return (
    <Group>
      {/* 蠎ｧ蟶ｭ繝懊ャ繧ｯ繧ｹ */}
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

      {/* 繝ｩ繝吶Ν・育ｩｺ縺ｪ繧画緒縺九↑縺・ｼ・*/}
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


