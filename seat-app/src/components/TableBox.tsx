// src/components/TableBox.tsx
import React from "react";
import { Group, Rect, Circle, Text, Line } from "react-konva";
import type Konva from "konva";
import type { Table } from "../types";
import { SeatBox } from "./SeatBox";
import { buildSeatGeometry } from "../lib/seatGeometry";
import type { SeatDisplay } from "../lib/seatGeometry";
import { SeatInteractionContext } from "./SeatInteractionContext";

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
  shapeRefs: React.RefObject<Record<string, Konva.Group>>;
};

/** 卓の縁と名札の寸法から全席の描画位置を生成 */
function renderTableSeats(
  table: Table,
  fontSize: number,
  tables: Table[],
  selectedSeat: { tableIndex: number; seatIndex: number } | null,
  setSelectedSeat: React.Dispatch<React.SetStateAction<{ tableIndex: number; seatIndex: number } | null>>,
  setTables: React.Dispatch<React.SetStateAction<Table[]>>,
  display: SeatDisplay
) {
  return buildSeatGeometry(table, fontSize, display).map((geometry, i) => <SeatBox
    key={i} table={table} seatIndex={i} seatX={geometry.x} seatY={geometry.y}
    labelX={geometry.label.x} labelY={geometry.label.y} geometry={geometry}
    tables={tables} selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat}
    setTables={setTables} fontSize={fontSize}
  />);
}

/** 卓本体・席番号・表示中の名札を含む選択枠の範囲 */
function selectionBounds(table: Table, fontSize: number, display: SeatDisplay) {
  const width = table.shape === "circle" ? (table.radius ?? 117) * 2 : table.width ?? 270;
  const height = table.shape === "circle" ? (table.radius ?? 117) * 2 : table.height ?? 140;
  let left = -width / 2, top = -height / 2, right = width / 2, bottom = height / 2;
  for (const seat of buildSeatGeometry(table, fontSize, display)) {
    for (const box of [seat.number, ...(seat.text ? [seat.label] : [])]) {
      left = Math.min(left, box.x); top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
    }
  }
  const padding = 12;
  return { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
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
  const interaction = React.useContext(SeatInteractionContext);
  const isSelected = interaction ? interaction.selectedTableIds.includes(table.id) : selectedId === table.id;
  const tableStroke = isSelected ? "#0284c7" : "#64748b";
  const tableStrokeWidth = isSelected ? 3 : 1.5;
  const tableFill = table.shape === "circle" ? "#dbeafe" : "#bbf7d0";
  const selection = isSelected ? selectionBounds(table, fontSize, interaction ?? { showNames: true }) : null;
  const selectionFontSize = Math.max(fontSize, 28);

  return (
    <Group
      key={table.id}
      ref={(ref) => {
        if (ref) shapeRefs.current![table.id] = ref;
      }}
      x={table.x}
      y={table.y}
      draggable={!interaction || interaction.mode === "layout"}
      onClick={(e) => {
        e.cancelBubble = true; // ← これを追加！
        if (interaction) interaction.selectTable(table.id, e.evt.ctrlKey);
        else setSelectedId(table.id);
        if (isSeatModalOpen) setFocusTableId(table.id);
      }}
      onDblClick={(e) => {
        // ワークスペースではクリック側の選択処理を維持
        if (interaction) { e.cancelBubble = true; return; }
        setSelectedId(table.id);
        setFocusTableId(table.id);
        (window as Window & { openSeatModal?: (id: string) => void }).openSeatModal?.(table.id);
      }}
      onDragStart={(e) => {
        if (interaction) interaction.dragTable(table.id, "start", e.target.x(), e.target.y());
      }}
      onDragMove={(e) => {
        if (interaction) interaction.dragTable(table.id, "move", e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        if (interaction) interaction.dragTable(table.id, "end", e.target.x(), e.target.y());
        else updateTable(table.id, { x: e.target.x(), y: e.target.y() });
      }}
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
      {/* 操作を遮らない選択卓ごとの外枠と背景 */}
      {selection && <Group name="selection-overlay" listening={false}>
        <Rect {...selection} fill="rgba(14, 165, 233, 0.10)" stroke="#0ea5e9" strokeWidth={3} strokeScaleEnabled={false} cornerRadius={10} />
        <Rect x={selection.x} y={selection.y - selectionFontSize - 12} width={selectionFontSize * 3 + 20} height={selectionFontSize + 12} fill="#0284c7" cornerRadius={[6, 6, 0, 0]} />
        <Text x={selection.x + 10} y={selection.y - selectionFontSize - 6} text="選択中" fontSize={selectionFontSize} fontStyle="bold" fill="#ffffff" />
      </Group>}

      {/* === テーブルの図形 === */}
      {table.shape === "circle" ? (
        <Circle
          name="table-body"
          radius={table.radius!}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={tableStrokeWidth}
        />
      ) : (
        <Rect
          name="table-body"
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

      {/* 長机をくっつけたデザインの境界線 */}
      {table.shape === "rectangle" && table.design === "joined" && (
        <>
          <Line
            points={[0, -table.height! / 2, 0, table.height! / 2]}
            stroke="#64748b"
            strokeWidth={1}
            listening={false}
          />
          <Line
            points={[-table.width! / 2, 0, table.width! / 2, 0]}
            stroke="#64748b"
            strokeWidth={1}
            listening={false}
          />
          <Rect
            width={Math.min(table.width!, 120)}
            height={fontSize * 2.6 + 4}
            offsetX={Math.min(table.width!, 120) / 2}
            y={-fontSize - 4}
            fill={tableFill}
            listening={false}
          />
        </>
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
      {renderTableSeats(table, fontSize, tables, selectedSeat, setSelectedSeat, setTables,
        interaction ?? { showNames: true })}
    </Group>
  );
};
