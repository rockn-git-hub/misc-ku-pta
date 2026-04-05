// src/components/TableInfoPanel.tsx
import React from "react";
import type { Table } from "../types";

type TableInfoPanelProps = {
  selectedId: string;
  tables: Table[];
  updateTable: (id: string, updates: Partial<Table>) => void;
};

export const TableInfoPanel: React.FC<TableInfoPanelProps> = ({
  selectedId,
  tables,
  updateTable,
}) => {
  const t = tables.find((x) => x.id === selectedId);
  if (!t) return null;

  const shapeLabels: Record<Table["shape"], string> = {
    circle: "円卓",
    square: "正方形テーブル",
    rectangle: "長方形テーブル",
  };

  return (
    <div
      style={{
        marginBottom: 15,
        padding: "8px",
        border: "1px solid #ccc",
        borderRadius: 4,
        background: "#f9f9f9",
        display: "flex",
        alignItems: "center",
        gap: "20px",
      }}
    >
      <div>
        <strong>座席タイプ</strong> {shapeLabels[t.shape]}
      </div>

      <label>
        <strong>テーブル名 </strong>
        <input
          type="text"
          value={t.alias}
          onChange={(e) => updateTable(selectedId, { alias: e.target.value })}
          className="input-box"
        />
      </label>

      <label>
        <strong>座席数 </strong>
        <input
          type="number"
          value={t.seats}
          onChange={(e) =>
            updateTable(selectedId, { seats: Number(e.target.value) })
          }
          className="input-box small"
        />
      </label>
    </div>
  );
};
