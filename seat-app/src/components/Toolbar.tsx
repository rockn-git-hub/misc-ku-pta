// src/components/Toolbar.tsx
import React from "react";
import type { Table, Participant } from "../types";

type Orientation = "portrait" | "landscape";

interface ToolbarProps {
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  orientation: Orientation;
  onChangeOrientation: (o: Orientation) => void;
  onAddTable: (shape: "circle" | "square" | "rectangle", orientation?: Orientation) => void;
  onCopy: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSeatModal: () => void;
  onOpenParticipants: () => void;
  selectedId: string | null;
  tableCount: number;
  fontSize: number;
  setFontSize: (size: number) => void;
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setParticipantsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  setTitle,
  orientation,
  onChangeOrientation,
  onAddTable,
  onCopy,
  onDelete,
  onExport,
  onImport,
  onExportPdf,
  onExportXlsx,
  onOpenSeatModal,
  onOpenParticipants,
  selectedId,
  tableCount,
  fontSize,
  setFontSize,
  scale,
  setScale,
  setTables,
  setParticipants,
  setParticipantsOpen,
}) => {
  // 共通寸法（28px行高で統一）※確認済み
  const CONTROL_HEIGHT = 28;
  const COPYRIGHT = "© 2025 Hamster";

  const buttonStyle: React.CSSProperties = {
    marginRight: 6,
    padding: "4px 10px", // ← 高さを詰める
    height: CONTROL_HEIGHT, // ← 明示指定
    lineHeight: `${CONTROL_HEIGHT - 8}px`,
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 4,
    border: "1px solid #666",
    background: "#333",
    color: "white",
    cursor: "pointer",
  };

  const selectedButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "#ffd700",
    color: "black",
    border: "1px solid #999",
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 12,
    marginRight: 6,
    color: "#ddd",
  };

  return (
    <div
      className="toolbar"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        background: "#222",
        padding: "4px 8px", // ← 8→4 に圧縮（上下の余白を削る）
        borderBottom: "1px solid #444",
        rowGap: 0, // 念のため行間を0
      }}
    >
      {/* 上段：タイトル＋基本情報 */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          gap: 16, // ← 32→16
          width: "100%",
          marginBottom: 4, // ← 10→2 にして上下の間を短縮（要件の核心）
        }}
      >
        {/* 左：タイトル */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label
            htmlFor="titleInput"
            style={{
              minWidth: 68,
              fontSize: 13,
              fontWeight: 600,
              color: "#ddd",
              textAlign: "left",
              lineHeight: `${CONTROL_HEIGHT}px`,
              height: CONTROL_HEIGHT,
            }}
          >
            席次表名
          </label>
          <input
            id="titleInput"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="第３学年 懇親会 席次表 など"
            style={{
              width: 280, // ← 少しだけ小さく
              padding: "4px 8px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid #888",
              background: "#111",
              color: "#fff",
              textAlign: "left",
              height: CONTROL_HEIGHT, // ← 高さを合わせる
              lineHeight: `${CONTROL_HEIGHT - 8}px`,
            }}
          />
        </div>

        {/* 右：情報 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              background: "#045536",
              color: "#fff",
              padding: "0 8px",
              borderRadius: 6,
              fontWeight: "bold",
              height: CONTROL_HEIGHT, // ← 28px に統一
              lineHeight: `${CONTROL_HEIGHT}px`,
            }}
          >
            テーブル数: {tableCount}
          </span>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: "#ccc",
              height: CONTROL_HEIGHT,
            }}
          >
            スケール:
            <input
              type="number"
              step="0.1"
              min={0}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              style={{ width: 52, fontSize: 14, height: CONTROL_HEIGHT, padding: "2px 6px" }}
            />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: "#ccc",
              height: CONTROL_HEIGHT,
            }}
          >
            フォント:
            <input
              type="number"
              min={0}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              style={{ width: 52, fontSize: 14, height: CONTROL_HEIGHT, padding: "2px 6px" }}
            />
          </label>
        </div>
      </div>

      {/* 下段：ボタン行 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 4, // ← ボタン群の横・縦の隙間も少し詰める
          marginTop: 0, // ← 念のため
        }}
      >
        {/* group 単位の余白は下を0に固定（※確認済み） */}
        <div
          className="toolbar-group"
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}
        >
          <span style={labelStyle}>用紙</span>
          <button
            onClick={() => onChangeOrientation("portrait")}
            style={orientation === "portrait" ? selectedButtonStyle : buttonStyle}
          >
            A4縦
          </button>
          <button
            onClick={() => onChangeOrientation("landscape")}
            style={orientation === "landscape" ? selectedButtonStyle : buttonStyle}
          >
            A4横
          </button>
        </div>

        <div
          className="toolbar-group"
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}
        >
          <span style={labelStyle}>追加</span>
          <button style={buttonStyle} onClick={() => onAddTable("circle")}>
            円卓
          </button>
          <button style={buttonStyle} onClick={() => onAddTable("square")}>
            正方形
          </button>
          <button style={buttonStyle} onClick={() => onAddTable("rectangle", "landscape")}>
            横長机
          </button>
          <button style={buttonStyle} onClick={() => onAddTable("rectangle", "portrait")}>
            縦長机
          </button>
        </div>

        <div
          className="toolbar-group"
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}
        >
          <span style={labelStyle}>操作</span>
          <button style={buttonStyle} onClick={onOpenSeatModal}>
            座席編集
          </button>
          <button style={buttonStyle} onClick={onCopy} disabled={!selectedId}>
            コピー
          </button>
          <button style={buttonStyle} onClick={onDelete} disabled={!selectedId}>
            削除
          </button>
        </div>

        <div
          className="toolbar-group"
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}
        >
          <span style={labelStyle}>データ</span>
          <button style={buttonStyle} onClick={onExport}>
            保存
          </button>
          <button style={buttonStyle} onClick={() => document.getElementById("fileInput")?.click()}>
            読み込み
          </button>
          <input
            id="fileInput"
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onImport}
          />
          <button style={buttonStyle} onClick={onOpenParticipants}>
            参加者
          </button>
          <button style={buttonStyle} onClick={onExportPdf}>
            PDF出力
          </button>
          <button style={buttonStyle} onClick={onExportXlsx}>
            Excel出力
          </button>
          <button
            style={{ ...buttonStyle, background: "#8B0000", color: "#fff", fontWeight: "bold" }}
            onClick={() => {
              if (
                window.confirm(
                  "全てのテーブルと座席情報を削除して初期状態に戻します。\nこの操作は取り消せません。実行しますか？"
                )
              ) {
                setTables([]);
                setParticipants([]);
                setParticipantsOpen(false);
              }
            }}
          >
            全クリア
          </button>
        </div>
        {/* 右端：コピーライト */}
        <div
          style={{
            fontSize: 15,
            color: "#888",
            whiteSpace: "nowrap",
            marginLeft: "auto",
            paddingLeft: 8,
            alignSelf: "flex-end", // ★ これで下揃え！
            paddingBottom: 2, // ★ 微調整（お好みで）
          }}
        >
          {COPYRIGHT}
        </div>
      </div>
    </div>
  );
};
