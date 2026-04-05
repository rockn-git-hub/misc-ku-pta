import React, { useState } from "react";
import { Rnd } from "react-rnd";
import XLSX from "xlsx-js-style"; // ✅ 型エラー回避構文（allowSyntheticDefaultImports=true 必須）
import type { Participant, Table } from "../types";
import { ParticipantsPreviewModal } from "./ParticipantsPreviewModal";
import {
  DEFAULT_CIRCLE_RADIUS,
  DEFAULT_SQUARE_SIZE,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
} from "../hooks/useTables"; // ✅ ← 追加
interface Props {
  onClose: () => void;
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  tables: Table[];
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
}

export const ParticipantsModal: React.FC<Props> = ({
  onClose,
  participants,
  setParticipants,
  setTables,
}) => {
  const [hasHeader, setHasHeader] = useState(true);
  const [columnMap, setColumnMap] = useState<Record<string, number | null>>({
    table: null,
    name: null,
    attr1: null,
    attr2: null,
  });

  const [allRows, setAllRows] = useState<string[][]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);

  // --------------------------
  // Excelインポート
  // --------------------------
  const handleImportXlsx = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (rows.length === 0) return;

      const firstRow = rows[0].map((h: unknown) => String(h ?? "").trim());
      setHeaders(firstRow);

      // 自動マッピング
      const autoMap: Record<string, number | null> = {
        table: null,
        name: null,
        attr1: null,
        attr2: null,
      };
      firstRow.forEach((colName: string, idx: number) => {
        if (colName.includes("テーブル")) autoMap.table = idx;
        if (colName.includes("名前")) autoMap.name = idx;
        if (colName.includes("属性1")) autoMap.attr1 = idx;
        if (colName.includes("属性2")) autoMap.attr2 = idx;
      });

      setColumnMap(autoMap);
      setAllRows(rows);
      setPreviewRows(rows.slice(0, 5));

      // ✅ プレビューを開く
      setPreviewOpen(true);
    };
    reader.readAsArrayBuffer(file);
  };

  // --------------------------
  // 取り込み確定処理
  // --------------------------
  const applyImport = (
    rows: string[][],
    seatType: "circle" | "square" | "landscape" | "portrait"
  ) => {
    const dataStartIndex = hasHeader ? 1 : 0;

    const parsed = rows
      .slice(dataStartIndex)
      .map((row, idx) => ({
        id: String(idx + 1),
        tableName: columnMap.table !== null ? String(row[columnMap.table] ?? "") : "",
        name: columnMap.name !== null ? String(row[columnMap.name] ?? "") : "",
        attr1: columnMap.attr1 !== null ? String(row[columnMap.attr1] ?? "") : "",
        attr2: columnMap.attr2 !== null ? String(row[columnMap.attr2] ?? "") : "",
      }))
      .filter((r) => r.name);

    const grouped = new Map<string, Participant[]>();
    for (const p of parsed) {
      if (!grouped.has(p.tableName)) grouped.set(p.tableName, []);
      grouped.get(p.tableName)!.push({ id: p.id, name: p.name, attr1: p.attr1, attr2: p.attr2 });
    }

    setTables((prev) => {
      const newTables = [...prev];
      let index = 0;

      grouped.forEach((people, tableKey) => {
        // === 入力名を優先 ===
        const rawName = tableKey.trim() || "";
        const numMatch = rawName.match(/\d+/); // 数字を含む場合に抽出
        const num = numMatch ? Number(numMatch[0]) : index + 1;

        // === 既存テーブル検索（number または alias 名で） ===
        let t =
          newTables.find((x) => x.number === num) || newTables.find((x) => x.alias === rawName);

        if (!t) {
          const row = Math.floor(index / 3);
          const col = index % 3;
          const baseX = 160 + col * 600;
          const baseY = 200 + row * 500;

          // === alias名は入力を優先、なければデフォルト ===
          const aliasName = rawName && !/^テーブル\d+$/.test(rawName) ? rawName : `テーブル${num}`;

          // === 選択された形状で生成 ===
          if (seatType === "circle") {
            t = {
              id: `T${Date.now()}_${num}`,
              number: num,
              alias: aliasName,
              shape: "circle",
              x: baseX,
              y: baseY,
              radius: DEFAULT_CIRCLE_RADIUS,
              seats: people.length,
              seatsDetail: [],
            } as Table;
          } else if (seatType === "square") {
            t = {
              id: `T${Date.now()}_${num}`,
              number: num,
              alias: aliasName,
              shape: "square",
              x: baseX,
              y: baseY,
              width: DEFAULT_SQUARE_SIZE,
              height: DEFAULT_SQUARE_SIZE,
              seats: people.length,
              seatsDetail: [],
            } as Table;
          } else if (seatType === "landscape") {
            t = {
              id: `T${Date.now()}_${num}`,
              number: num,
              alias: aliasName,
              shape: "rectangle",
              x: baseX,
              y: baseY,
              width: DEFAULT_RECT_WIDTH,
              height: DEFAULT_RECT_HEIGHT,
              seats: people.length,
              seatsDetail: [],
              orientation: "landscape",
            } as Table;
          } else {
            t = {
              id: `T${Date.now()}_${num}`,
              number: num,
              alias: aliasName,
              shape: "rectangle",
              x: baseX,
              y: baseY,
              width: DEFAULT_RECT_HEIGHT,
              height: DEFAULT_RECT_WIDTH,
              seats: people.length,
              seatsDetail: [],
              orientation: "portrait",
            } as Table;
          }

          newTables.push(t);
          index++;
        }

        // === 座席情報を反映 ===
        t.seats = people.length;
        t.seatsDetail = people.map((p, i) => ({
          seatNumber: i + 1,
          id: p.id,
          name: p.name,
          attr1: p.attr1,
          attr2: p.attr2,
        }));
      });

      return newTables;
    });

    setParticipants(parsed.map(({ tableName, ...rest }) => rest));
    setPreviewOpen(false);
  };

  // --------------------------
  // JSX
  // --------------------------
  return (
    <Rnd
      default={{ x: 650, y: 120, width: 500, height: 500 }}
      minWidth={400}
      minHeight={300}
      bounds="window"
      dragHandleClassName="participants-header"
      className="modal-rnd"
    >
      {/* ParticipantsPreviewModal の呼び出し */}
      {isPreviewOpen && (
        <ParticipantsPreviewModal
          rows={previewRows}
          headers={headers}
          columnMap={columnMap}
          setColumnMap={setColumnMap}
          hasHeader={hasHeader}
          setHasHeader={setHasHeader}
          onSelectSeatType={(type) => applyImport([...allRows], type)} // ← ここ！
          onCancel={() => setPreviewOpen(false)}
        />
      )}
      <div className="modal" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="modal-header participants-header">
          <span>参加者リスト</span>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: 8, overflow: "auto", flexGrow: 1 }}>
          {/* ツールバー */}
          <div className="toolbar-group toolbar-group--full">
            <div className="toolbar-left">
              <span className="toolbar-label">データ</span>
              <button
                onClick={() => document.getElementById("importXlsxInputParticipants")?.click()}
              >
                インポート
              </button>
              <input
                id="importXlsxInputParticipants"
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportXlsx(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => {
                  // TODO: exportParticipantsXlsx(participants);  // ← 実装予定
                  alert("エクスポート処理はまだ未実装です。");
                }}
                disabled={participants.length === 0}
              >
                エクスポート
              </button>
            </div>
            <div className="toolbar-right">
              <button
                className="btn-danger"
                onClick={() => {
                  if (window.confirm("参加者データを全てクリアしますか？")) {
                    setParticipants([]);
                    setTables([]);
                  }
                }}
              >
                データクリア
              </button>
            </div>
          </div>

          {participants.length > 0 && (
            <table className="common-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>属性1</th>
                  <th>属性2</th>
                  <th>名前</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.attr1}</td>
                    <td>{p.attr2}</td>
                    <td>{p.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Rnd>
  );
};
