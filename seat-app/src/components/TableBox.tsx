// src/components/TableBox.tsx
import React from "react";
import { Group, Rect, Circle, Text } from "react-konva";
import type { Table } from "../types";
import { SeatBox } from "./SeatBox";

type TableBoxProps = {
  table: Table;
  fontSize: number;
  tables: Table[];
  selectedSeat: { tableIndex: number; seatIndex: number } | null;
  setSelectedSeat: React.Dispatch<
    React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>
  >;
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  setSelectedId: (id: string) => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  isSeatModalOpen: boolean;
  setFocusTableId: (id: string | null) => void;
  selectedId: string | null; // ← 追加！
  shapeRefs: React.RefObject<Record<string, any>>;
};

// === 円卓用 ===
function renderCircleSeats(
  table: Table,
  fontSize: number,
  tables: Table[],
  selectedSeat: { tableIndex: number; seatIndex: number } | null,
  setSelectedSeat: React.Dispatch<
    React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>
  >,
  setTables: React.Dispatch<React.SetStateAction<Table[]>>
) {
  return Array.from({ length: table.seats }).map((_, i) => {
    const step = (2 * Math.PI) / table.seats; // 1席ぶんの角度
    const startAngle = -Math.PI / 2 + step / 2;
    const angle = startAngle + step * i; // 時計回りに並べる（※重要）
    const radius = table.radius! + 24 / 2 + 30;
    const seatX = Math.cos(angle) * radius;
    const seatY = Math.sin(angle) * radius;
    const labelX = seatX + Math.cos(angle) * 30;
    const labelY = seatY + Math.sin(angle) * 30;

    return (
      <SeatBox
        key={`circle-${i}`}
        table={table}
        seatIndex={i}
        seatX={seatX}
        seatY={seatY}
        labelX={labelX}
        labelY={labelY}
        tables={tables}
        selectedSeat={selectedSeat}
        setSelectedSeat={setSelectedSeat}
        setTables={setTables}
        fontSize={fontSize}
      />
    );
  });
}

// === 長方形用 ===
function renderRectSeats(
  table: Table,
  fontSize: number,
  tables: Table[],
  selectedSeat: { tableIndex: number; seatIndex: number } | null,
  setSelectedSeat: React.Dispatch<
    React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>
  >,
  setTables: React.Dispatch<React.SetStateAction<Table[]>>
) {
  const isLandscape = table.orientation === "landscape";
  const mainLen = isLandscape ? table.width! : table.height!;
  const sideLen = isLandscape ? table.height! : table.width!;

  const firstSide = Math.ceil(table.seats / 2);
  const secondSide = Math.floor(table.seats / 2);

  const makeSeats = (count: number, offset: number, side: "first" | "second") =>
    Array.from({ length: count }).map((_, i) => {
      const EDGE_MARGIN = 30; // 端からの余白(px) ← ここを調整
      const usable = Math.max(0, mainLen - EDGE_MARGIN * 2);
      const spacing = count > 1 ? usable / (count - 1) : 0;
      const along = -mainLen / 2 + EDGE_MARGIN + spacing * i;

      let seatX = 0,
        seatY = 0,
        labelX = 0,
        labelY = 0;

      if (isLandscape) {
        // 横長 → 上下
        seatX = along;
        seatY = side === "first" ? -sideLen / 2 - 30 : sideLen / 2 + 30;

        // === ベクトル延長でラベル配置 ===
        const LABEL_DISTANCE = 40; // 座席からラベルまでの距離
        const dx = seatX; // 中心(0,0)→座席 のX成分
        const dy = seatY; // 中心(0,0)→座席 のY成分
        const len = Math.sqrt(dx * dx + dy * dy) || 1; // ベクトル長
        labelX = seatX + (dx / len) * LABEL_DISTANCE;
        labelY = seatY + (dy / len) * LABEL_DISTANCE;
      } else {
        // 縦長 → 左右
        seatX = side === "first" ? -sideLen / 2 - 30 : sideLen / 2 + 30;
        seatY = along;

        // === ベクトル延長でラベル配置 ===
        const LABEL_DISTANCE = 40; // 座席からラベルまでの距離
        const dx = seatX;
        const dy = seatY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        labelX = seatX + (dx / len) * LABEL_DISTANCE;
        labelY = seatY + (dy / len) * LABEL_DISTANCE;
        labelY = labelY;
      }

      return (
        <SeatBox
          key={`${side}-${i}`}
          table={table}
          seatIndex={offset + i}
          seatX={seatX}
          seatY={seatY}
          labelX={labelX}
          labelY={labelY}
          tables={tables}
          selectedSeat={selectedSeat}
          setSelectedSeat={setSelectedSeat}
          setTables={setTables}
          fontSize={fontSize}
        />
      );
    });

  return [
    ...makeSeats(firstSide, 0, "first"),
    ...makeSeats(secondSide, firstSide, "second"),
  ];
}

export const TableBox: React.FC<TableBoxProps> = ({
  table,
  fontSize,
  tables,
  selectedSeat,
  setSelectedSeat,
  setTables,
  setSelectedId,
  updateTable,
  isSeatModalOpen,
  setFocusTableId,
  selectedId,
  shapeRefs,
}) => {
  const isSelected = selectedId === table.id;
  const tableStroke = isSelected ? "#0284c7" : "#64748b";
  const tableStrokeWidth = isSelected ? 3 : 1.5;
  const tableFill = table.shape === "circle" ? "#dbeafe" : "#bbf7d0";

  return (
    <Group
      key={table.id}
      ref={(ref) => {
        if (ref) shapeRefs.current![table.id] = ref;
      }}
      x={table.x}
      y={table.y}
      draggable
      onClick={(e) => {
        e.cancelBubble = true; // ← これを追加！
        setSelectedId(table.id);
        if (isSeatModalOpen) setFocusTableId(table.id);
      }}
      onDblClick={() => {
        setSelectedId(table.id);
        setFocusTableId(table.id);
        (window as any).openSeatModal(table.id);
      }}
      onDragEnd={(e) =>
        updateTable(table.id, { x: e.target.x(), y: e.target.y() })
      }
      onTransformEnd={(e) => {
        const node = e.target;
        if (table.shape === "circle") {
          updateTable(table.id, { radius: table.radius! * node.scaleX() });
        } else {
          updateTable(table.id, {
            width: table.width! * node.scaleX(),
            height: table.height! * node.scaleY(),
          });
        }
        node.scaleX(1);
        node.scaleY(1);
      }}
    >
      {/* === テーブルの図形 === */}
      {table.shape === "circle" ? (
        <Circle
          radius={table.radius!}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
        />
      ) : (
        <Rect
          width={table.width}
          height={table.height}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
          cornerRadius={12}
          offsetX={table.width! / 2}
          offsetY={table.height! / 2}
        />
      )}

      {/* === 中央テキスト === */}
      <Text
        text={table.alias}
        fontSize={fontSize}
        fill="#0f172a"
        align="center"
        width={table.shape === "circle" ? table.radius! * 2 : table.width}
        offsetX={table.shape === "circle" ? table.radius! : table.width! / 2}
        y={-fontSize}
      />
      {table.seats > 0 && (
        <Text
          text={`(${table.seats}席)`}
          fontSize={fontSize}
          fill="#1e293b"
          align="center"
          width={table.shape === "circle" ? table.radius! * 2 : table.width}
          offsetX={table.shape === "circle" ? table.radius! : table.width! / 2}
          y={fontSize * 0.6}
        />
      )}

      {/* === 座席群 === */}
      {table.shape === "circle"
        ? renderCircleSeats(
            table,
            fontSize,
            tables,
            selectedSeat,
            setSelectedSeat,
            setTables
          )
        : renderRectSeats(
            table,
            fontSize,
            tables,
            selectedSeat,
            setSelectedSeat,
            setTables
          )}
    </Group>
  );
};
