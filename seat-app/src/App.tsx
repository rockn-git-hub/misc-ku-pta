// src/App.tsx
import "./App.css";
import { loadState, saveState } from "./lib/persist";

import { Text } from "react-konva"; // ← 追加（タイトル描画用）

import { useState, useRef, useEffect, useMemo } from "react";
import { Stage, Layer, Transformer, Rect } from "react-konva";

import { SeatEditModal } from "./components/SeatEditModal";
import { ParticipantsModal } from "./components/ParticipantsModal";
import { TableBox } from "./components/TableBox";
import { Toolbar } from "./components/Toolbar";
import type { Table, Participant } from "./types";

import { useHotkeys } from "./hooks/useHotkeys";
import { useTables } from "./hooks/useTables";
import { rotateTablesForOrientationChange } from "./lib/rotate";
import { exportJson, importJson, exportPdf, exportXlsx } from "./lib/io";

type Orientation = "portrait" | "landscape";

function App() {
  // =========================================
  // 1️⃣ 初期ロード時に seatsDetail を補完
  // =========================================
  const restored = loadState();
  if (restored?.tables) {
    restored.tables = restored.tables.map((t: Table) => {
      const seatsDetail = [...(t.seatsDetail ?? [])];
      while (seatsDetail.length < 100) {
        seatsDetail.push({
          seatNumber: seatsDetail.length + 1,
          id: "",
          attr1: "",
          attr2: "",
          name: "",
        });
      }
      return { ...t, seatsDetail };
    });
  }

  // === 状態 ===
  const [orientation, setOrientation] = useState<Orientation>(restored?.orientation ?? "landscape");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(restored?.fontSize ?? 24);
  const [title, setTitle] = useState<string>(restored?.title ?? "席次表");
  const [isSeatModalOpen, setSeatModalOpen] = useState(false);
  const [focusTableId, setFocusTableId] = useState<string | null>(null);

  const [selectedSeat, setSelectedSeat] = useState<{
    tableIndex: number;
    seatIndex: number;
  } | null>(null);

  const [isParticipantsOpen, setParticipantsOpen] = useState(false);

  const trRef = useRef<any>(null);
  const shapeRefs = useRef<Record<string, any>>({});
  const stageRef = useRef<any>(null); // ★ PDF出力用

  const [scale, setScale] = useState<number>(restored?.scale ?? 1.0);

  const [tables, setTables] = useState<Table[]>(restored?.tables ?? []);
  const [participants, setParticipants] = useState<Participant[]>(restored?.participants ?? []);

  const A4_PORTRAIT = useMemo(() => ({ width: 794 * scale, height: 1123 * scale }), [scale]);
  const A4_LANDSCAPE = useMemo(() => ({ width: 1123 * scale, height: 794 * scale }), [scale]);

  const canvasSize = orientation === "portrait" ? A4_PORTRAIT : A4_LANDSCAPE;

  useEffect(() => {
    setTables((prev) =>
      prev.map((t) => ({
        ...t,
        seatsDetail: (t.seatsDetail ?? []).map((s) => {
          if (!s) return { id: "", attr1: "", attr2: "", name: "", seatNumber: 0 };
          const matched = participants.find((p) => p.id === s.id);
          return matched
            ? {
                ...s,
                attr1: matched.attr1,
                attr2: matched.attr2,
                name: matched.name,
              }
            : s;
        }),
      }))
    );
  }, [participants]);

  // 状態を保存
  useEffect(() => {
    saveState({
      version: 1,
      updatedAt: new Date().toISOString(),
      orientation,
      scale,
      fontSize,
      title, // ✅ 追加
      tables,
      participants,
    });
  }, [orientation, scale, fontSize, title, tables, participants]);

  // グローバル関数
  useEffect(() => {
    (window as any).openSeatModal = (id: string) => {
      setFocusTableId(id);
      setSeatModalOpen(true);
    };
  }, []);

  useEffect(() => {
    if (trRef.current) {
      const node = selectedId ? shapeRefs.current[selectedId] : null;
      trRef.current.nodes(node ? [node] : []);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, tables]);

  const usedIds = tables.flatMap((t) => (t.seatsDetail ?? []).map((s) => s?.id).filter((id) => id));
  const duplicateIds = new Set(usedIds.filter((id, idx, arr) => arr.indexOf(id) !== idx));

  const { addTable, deleteTable, copyTable, updateTable } = useTables({
    tables,
    setTables,
    setSelectedId,
  });

  const deleteSeat = (tableIndex: number, seatIndex: number) => {
    setTables((prev) =>
      prev.map((table, index) => {
        if (index !== tableIndex || seatIndex < 0 || seatIndex >= table.seats) return table;

        const seatsDetail = [...table.seatsDetail];
        for (let i = seatIndex; i < table.seats - 1; i += 1) {
          seatsDetail[i] = { ...seatsDetail[i + 1], seatNumber: i + 1 };
        }
        seatsDetail[table.seats - 1] = {
          seatNumber: table.seats,
          id: "",
          attr1: "",
          attr2: "",
          name: "",
        };

        return { ...table, seats: table.seats - 1, seatsDetail };
      })
    );
    setSelectedSeat(null);
    setSelectedId(null);
  };

  useHotkeys({
    isSeatModalOpen,
    selectedId,
    selectedSeat,
    copyTable,
    deleteTable,
    deleteSeat,
  });

  const handleExportJson = () => {
    exportJson(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        orientation,
        scale,
        fontSize,
        tables,
        participants,
      },
      title
    );
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importJson(
      file,
      (obj) => {
        setOrientation(obj.orientation);
        setScale(obj.scale ?? 1.8); // ← 念のためスケールも復元
        setFontSize(obj.fontSize ?? 16); // ← 追加
        setTables(
          obj.tables.map((t: Table) => {
            const seatsDetail = [...(t.seatsDetail ?? [])];
            while (seatsDetail.length < 100) {
              seatsDetail.push({
                seatNumber: seatsDetail.length + 1,
                id: "",
                attr1: "",
                attr2: "",
                name: "",
              });
            }
            return { ...t, seatsDetail };
          })
        );
        setParticipants(obj.participants ?? []);
      },
      (msg) => alert(msg)
    );
    e.target.value = "";
  };

  const handleChangeOrientation = (next: Orientation) => {
    setTables((prev) =>
      rotateTablesForOrientationChange(
        prev,
        orientation,
        next,
        canvasSize,
        next === "portrait" ? A4_PORTRAIT : A4_LANDSCAPE
      )
    );
    setOrientation(next);
  };

  // ★ PDF出力ハンドラ
  const handleExportPdf = () => {
    if (!stageRef.current) return;
    exportPdf(stageRef.current, orientation, title);
  };

  const handleExportXlsx = () => {
    exportXlsx(tables, participants, title);
  };

  // ★ 追加：数値IDの次番号を採番（participants と tables の両方を見て MAX+1）
  function nextNumericId(tables: Table[], participants: Participant[]) {
    const nums: number[] = [];

    // participants 側（数字だけのIDのみ対象）
    for (const p of participants) {
      const n = Number(p.id);
      if (Number.isFinite(n)) nums.push(n);
    }
    // tables 側（座席IDに数字が入ってるもの）
    for (const t of tables) {
      for (const s of t.seatsDetail ?? []) {
        const n = Number(s.id);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
    const max = nums.length ? Math.max(...nums) : 0;
    return String(max + 1); // 文字列IDとして返す
  }

  // ★ 追加：座席から参加者リストを生成
  function buildParticipantsFromSeats(tables: Table[]): Participant[] {
    const list: Participant[] = [];
    const used = new Set<string>();

    // 1周目：IDが数字の席はそのIDで作成
    for (const t of tables) {
      for (const s of t.seatsDetail ?? []) {
        const hasSome = s.name?.trim() || s.attr1?.trim() || s.attr2?.trim();
        if (!hasSome) continue;

        const idStr = String(s.id ?? "").trim();
        if (idStr && /^\d+$/.test(idStr) && !used.has(idStr)) {
          list.push({ id: idStr, name: s.name ?? "", attr1: s.attr1 ?? "", attr2: s.attr2 ?? "" });
          used.add(idStr);
        }
      }
    }

    // 2周目：ID未設定や非数値の席に新規IDを振って作成
    for (const t of tables) {
      for (const s of t.seatsDetail ?? []) {
        const hasSome = s.name?.trim() || s.attr1?.trim() || s.attr2?.trim();
        if (!hasSome) continue;

        const idStr = String(s.id ?? "").trim();
        if (!idStr || !/^\d+$/.test(idStr) || used.has(idStr)) {
          // 採番
          const newId = (() => {
            const n = Number(nextNumericId(tables, list));
            // listに入れるたびに max が上がるので、ここは list ベースでOK
            return String(n);
          })();
          list.push({ id: newId, name: s.name ?? "", attr1: s.attr1 ?? "", attr2: s.attr2 ?? "" });
          used.add(newId);
        }
      }
    }

    return list;
  }

  // ★ 追加：初期化フック（participants が空なら seats から自動生成し、席IDも欠けていれば埋める）
  useEffect(() => {
    if (participants.length > 0) return; // 既に名簿があるなら何もしない

    // 座席に一つも名前/属性が無いなら何もしない（空会場想定） ※これは印象
    const hasAny = tables.some((t) =>
      (t.seatsDetail ?? []).some((s) => s.name?.trim() || s.attr1?.trim() || s.attr2?.trim())
    );
    if (!hasAny) return;

    const built = buildParticipantsFromSeats(tables);

    // 座席側の空IDも埋める（数値IDで）
    setTables((prev) => {
      const next = prev.map((tt) => {
        const ss = (tt.seatsDetail ?? []).map((s) => {
          let idStr = String(s.id ?? "").trim();
          if (!idStr || !/^\d+$/.test(idStr)) {
            // 同一の name/attr で participants 側を検索（最初に見つかった1件）
            const hit = built.find(
              (p) =>
                p.name === (s.name ?? "") &&
                p.attr1 === (s.attr1 ?? "") &&
                p.attr2 === (s.attr2 ?? "")
            );
            if (hit) idStr = hit.id;
          }
          return { ...s, id: idStr };
        });
        return { ...tt, seatsDetail: ss };
      });
      return next;
    });

    setParticipants(built);
  }, [tables]); // tables 初期ロード後に1回走ればOK（participants が空のときだけ動く）

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        margin: 0,
        padding: 0,
      }}
    >
      {/* ヘッダー（ツールバー） */}
      <div
        style={{
          flexShrink: 0,
          background: "#222", // ← ダークモード時の背景が切れないように
          padding: "6px 8px", // ← ✅ これで上下に余白を追加
        }}
      >
        <Toolbar
          title={title}
          setTitle={setTitle}
          orientation={orientation}
          onChangeOrientation={handleChangeOrientation}
          onAddTable={addTable}
          onCopy={() => selectedId && copyTable(selectedId)}
          onDelete={() => selectedId && deleteTable(selectedId)}
          onExport={handleExportJson}
          onImport={handleImportJson}
          onExportPdf={handleExportPdf}
          onExportXlsx={handleExportXlsx}
          onOpenSeatModal={() => setSeatModalOpen(true)}
          onOpenParticipants={() => setParticipantsOpen(true)}
          selectedId={selectedId}
          tableCount={tables.filter((t) => t.seats > 0).length}
          fontSize={fontSize}
          setFontSize={setFontSize}
          scale={scale}
          setScale={setScale}
          setTables={setTables}
          setParticipants={setParticipants}
          setParticipantsOpen={setParticipantsOpen}
        />
      </div>

      {/* メインフレーム */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #ccc",
          background: "#eee",
        }}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width + 1}
          height={canvasSize.height + 1}
          style={{
            backgroundColor: "white",
            marginLeft: "0px",
          }}
          onMouseDown={(e) => {
            // 背景（Layer）をクリックした場合のみ選択解除
            if (e.target === e.target.getStage()) {
              console.log("背景クリック検知 OK"); // ← 追加

              setSelectedId(null);
            }
          }}
        >
          <Layer>
            {/* 🟢 タイトルを左上に描画 */}
            {title && (
              <Text
                text={title}
                x={10}
                y={10}
                fontSize={fontSize * 1.2}
                fontStyle="bold"
                fill="black"
              />
            )}
            <Rect
              x={0}
              y={0}
              width={canvasSize.width}
              height={canvasSize.height}
              fill="transparent" // ← 背景クリックを検知するため必須
              stroke="black"
              strokeWidth={3}
              listening={true} // ← イベントを有効化
              onMouseDown={() => {
                setSelectedId(null); // ← フォーカス解除
              }}
            />
            {tables.map((table) => (
              <TableBox
                key={table.id}
                table={table}
                fontSize={fontSize}
                tables={tables}
                selectedSeat={selectedSeat}
                setSelectedSeat={setSelectedSeat}
                setTables={setTables}
                setSelectedId={setSelectedId}
                updateTable={updateTable}
                isSeatModalOpen={isSeatModalOpen}
                setFocusTableId={setFocusTableId}
                selectedId={selectedId}
                shapeRefs={shapeRefs}
              />
            ))}
            <Transformer ref={trRef} />
          </Layer>
          {/* === 透かしレイヤー === */}
          <Layer listening={false}>
            <Text
              text="© 2025 Hamster"
              fontSize={24}
              fill="#000"
              opacity={0.5} // ← 少し強めの透かし
              x={canvasSize.width - 200} // ← 右端から左へずらす（文字幅分）
              y={canvasSize.height - 40} // ← 下端から上へずらす
              fontStyle="bold"
            />
          </Layer>
        </Stage>
      </div>

      {/* モーダル類 */}
      {isSeatModalOpen && (
        <SeatEditModal
          tables={tables}
          setTables={setTables}
          onClose={() => setSeatModalOpen(false)}
          focusTableId={focusTableId}
          participants={participants}
          setParticipants={setParticipants}
          duplicateIds={duplicateIds}
        />
      )}
      {isParticipantsOpen && (
        <ParticipantsModal
          onClose={() => setParticipantsOpen(false)}
          participants={participants}
          setParticipants={setParticipants}
          tables={tables}
          setTables={setTables}
        />
      )}
    </div>
  );
}

export default App;
