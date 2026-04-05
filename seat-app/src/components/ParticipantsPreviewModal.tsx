"use client";

import React from "react";
import { Rnd } from "react-rnd";

interface Props {
  rows: string[][];
  headers: string[];
  columnMap: Record<string, number | null>;
  setColumnMap: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  hasHeader: boolean;
  setHasHeader: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectSeatType: (type: "circle" | "square" | "landscape" | "portrait") => void; // ✅ 追加
  onCancel: () => void;
}

/**
 * Excelプレビュー＋列マッピングモーダル
 */
export const ParticipantsPreviewModal: React.FC<Props> = ({
  rows,
  headers,
  columnMap,
  setColumnMap,
  hasHeader,
  setHasHeader,
  onSelectSeatType,
  onCancel,
}) => {
  // === イベントハンドラ ===
  const handleColumnChange = (key: string, value: string) => {
    setColumnMap((prev) => ({
      ...prev,
      [key]: value ? Number(value) : null,
    }));
  };

  return (
    <Rnd
      default={{ x: 200, y: 200, width: 750, height: 420 }}
      minWidth={500}
      minHeight={300}
      bounds="window"
      dragHandleClassName="preview-header"
      className="modal-rnd"
    >
      <div className="modal" style={{ display: "flex", flexDirection: "column" }}>
        {/* === ヘッダー === */}
        <div className="modal-header preview-header">
          <span>Excelプレビュー（先頭5行）</span>
          <button className="close-btn" onClick={onCancel}>
            ✕
          </button>
        </div>

        {/* === 本文 === */}
        <div className="modal-content" onWheel={(e) => e.stopPropagation()}>
          {/* オプション */}
          <div
            style={{
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              fontSize: "15px", // ✅ フォントサイズを上げる
              color: "#eee", // ✅ ダークモードで視認性アップ
              fontWeight: 500,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px", // ✅ チェックボックス自体も少し大きく
                  accentColor: "#00bfff", // ✅ 水色系のアクセントカラー（好みに応じて変更可）
                  cursor: "pointer",
                }}
              />
              1行目をヘッダーとして扱う
            </label>
          </div>

          {/* 列マッピング */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {[
              { key: "table", label: "テーブル名" },
              { key: "name", label: "名前" },
              { key: "attr1", label: "属性1" },
              { key: "attr2", label: "属性2" },
            ].map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "15px", // ✅ ラベルの文字を大きく
                  fontWeight: 500,
                  color: "#eee",
                }}
              >
                {label}:
                <select
                  value={columnMap[key] ?? ""}
                  onChange={(e) => handleColumnChange(key, e.target.value)}
                  style={{
                    fontSize: "15px", // ✅ セレクトボックス内の文字も大きく
                    padding: "4px 8px",
                    borderRadius: "4px",
                    background: "#222",
                    color: "#fff",
                    border: "1px solid #555",
                  }}
                >
                  <option value="">(未設定)</option>
                  {headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* === プレビュー表 === */}
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          >
            <table className="common-table">
              {hasHeader ? (
                <>
                  <thead>
                    <tr>
                      {rows[0]?.map((cell, j) => (
                        <th key={j}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </div>

        {/* === フッター === */}
        <div
          style={{
            padding: 8,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <div
            className="modal-footer"
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button onClick={onCancel}>キャンセル</button>
            <button onClick={() => onSelectSeatType("circle")}>円卓で取り込み</button>
            <button onClick={() => onSelectSeatType("square")}>正方形で取り込み</button>
            <button onClick={() => onSelectSeatType("landscape")}>横長机で取り込み</button>
            <button onClick={() => onSelectSeatType("portrait")}>縦長机で取り込み</button>
          </div>
        </div>
      </div>
    </Rnd>
  );
};
