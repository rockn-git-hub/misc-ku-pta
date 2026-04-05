// src/components/SeatEditModal.tsx
import React, { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import type { Table, Participant } from "../types";

import { EditableSeatCell } from "../components/EditableSeatCell";

interface SeatEditModalProps {
  tables: Table[];
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  onClose: () => void;
  focusTableId?: string | null;
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  duplicateIds: Set<string>;
}

export const SeatEditModal: React.FC<SeatEditModalProps> = ({
  tables,
  setTables,
  onClose,
  focusTableId,
  participants,
  setParticipants,
  duplicateIds,
}) => {
  // 背景スクロールをロック
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 先頭付近に追加 or 置換
  function nextNumericIdFromStates(tables: Table[], participants: Participant[]) {
    const nums: number[] = [];
    for (const p of participants) {
      const n = Number(p.id);
      if (Number.isFinite(n)) nums.push(n);
    }
    for (const t of tables) {
      for (const s of t.seatsDetail ?? []) {
        const n = Number(s.id);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
    const max = nums.length ? Math.max(...nums) : 0;
    return String(max + 1);
  }

  function getShapeLabel(t: Table): string {
    if (t.shape === "circle") return "円卓";
    if (t.shape === "square") return "四角";

    // 長方形の場合は orientation で分岐
    if (t.shape === "rectangle") {
      if (t.orientation === "landscape") return "横長";
      if (t.orientation === "portrait") return "縦長";
      return "長方形";
    }

    return "";
  }

  useEffect(() => {
    if (focusTableId && sectionRefs.current[focusTableId]) {
      sectionRefs.current[focusTableId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [focusTableId]);

  /**
   * 未リンクの席に対して：
   *  - 名前が唯一一致 ⇒ 既存Participantに再リンク
   *  - それ以外（かつ何か入力あり）⇒ 新規Participant作成してリンク
   *  - 何も入力なし ⇒ 何もしない（空席許容）
   * 戻り値：リンク後の seatId（リンクできなければ空文字）
   */
  function upsertLinkForSeat(params: {
    seatId: string | undefined | null;
    seatFields: { name?: string; attr1?: string; attr2?: string };
    participants: Participant[];
    setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
    tryRelinkByUniqueName?: boolean;
  }) {
    const {
      seatId,
      seatFields,
      participants,
      setParticipants,
      tryRelinkByUniqueName = true,
    } = params;

    // 既にIDがあり、participantsにも存在 → そのまま
    if (seatId && participants.some((p) => p.id === seatId)) return seatId;

    const name = (seatFields.name ?? "").trim();
    const a1 = (seatFields.attr1 ?? "").trim();
    const a2 = (seatFields.attr2 ?? "").trim();
    const hasInput = name !== "" || a1 !== "" || a2 !== "";

    // 名寄せ（同名が1件だけなら再リンク）
    if (tryRelinkByUniqueName && name) {
      const hits = participants.filter((p) => p.name === name);
      if (hits.length === 1) return hits[0].id;
    }

    // 入力が全くないならリンク作成しない
    if (!hasInput) return "";

    // upsertLinkForSeat の中で新規作成する箇所を差し替え
    const newId = nextNumericIdFromStates(tables, participants); // ★ ここをUUID→連番へ
    const newParticipant = {
      id: newId,
      name: (seatFields.name ?? "").trim(),
      attr1: (seatFields.attr1 ?? "").trim(),
      attr2: (seatFields.attr2 ?? "").trim(),
    };
    setParticipants((prev) => [...prev, newParticipant]);
    // 席にも即反映（既存の setTables 更新ロジックでOK）
    return newId;
  }

  // 席のフィールド更新（自動リンク→同期まで面倒を見る）
  const updateSeatField = (
    tableId: string,
    seatIndex: number,
    field: "id" | "attr1" | "attr2" | "name",
    value: string,
    opts?: { syncParticipants?: boolean; seatIdForSync?: string }
  ) => {
    const sync = opts?.syncParticipants ?? true;

    // いまの席のスナップショットを取得
    const tNow = tables.find((t) => t.id === tableId);
    const sNow = tNow?.seatsDetail[seatIndex] ?? {
      seatNumber: seatIndex + 1,
      id: "",
      attr1: "",
      attr2: "",
      name: "",
    };

    // 編集後の席フィールド（ローカルで合成）
    const sAfter = { ...sNow, [field]: value };

    // 1) 「ID手入力」の場合はまず席を更新して終了（participants同期はしない）
    if (field === "id") {
      setTables((prev) =>
        prev.map((tt) =>
          tt.id === tableId
            ? {
                ...tt,
                seatsDetail: (() => {
                  const arr = [...tt.seatsDetail];
                  while (arr.length < tt.seats) {
                    arr.push({
                      seatNumber: arr.length + 1,
                      id: "",
                      attr1: "",
                      attr2: "",
                      name: "",
                    });
                  }
                  arr[seatIndex] = sAfter;
                  return arr;
                })(),
              }
            : tt
        )
      );

      // 入力IDに一致する参加者があれば、席側の表示値も合わせる（片方向補完）
      const matched = participants.find((p) => p.id === value);
      if (matched) {
        setTables((prev) =>
          prev.map((tt) =>
            tt.id === tableId
              ? {
                  ...tt,
                  seatsDetail: (() => {
                    const arr = [...tt.seatsDetail];
                    const cur = arr[seatIndex] ?? sAfter;
                    arr[seatIndex] = {
                      ...cur,
                      attr1: matched.attr1 ?? "",
                      attr2: matched.attr2 ?? "",
                      name: matched.name ?? "",
                    };
                    return arr;
                  })(),
                }
              : tt
          )
        );
      }
      return;
    }

    // 2) attr1/attr2/name の編集：未リンクなら「その場でリンク」を確定
    let seatId = sAfter.id || "";
    if (!seatId) {
      seatId = upsertLinkForSeat({
        seatId: sAfter.id,
        seatFields: { name: sAfter.name, attr1: sAfter.attr1, attr2: sAfter.attr2 },
        participants,
        setParticipants,
        tryRelinkByUniqueName: true,
      });
      if (seatId) sAfter.id = seatId; // 新規 or 再リンクでIDがついたら席に反映
    }

    // 3) tables を更新（編集したフィールド＋必要なら新しいID）
    setTables((prev) =>
      prev.map((tt) =>
        tt.id === tableId
          ? {
              ...tt,
              seatsDetail: (() => {
                const arr = [...tt.seatsDetail];
                while (arr.length < tt.seats) {
                  arr.push({
                    seatNumber: arr.length + 1,
                    id: "",
                    attr1: "",
                    attr2: "",
                    name: "",
                  });
                }
                arr[seatIndex] = sAfter;
                return arr;
              })(),
            }
          : tt
      )
    );

    // 4) participants も同期（IDが確定しているときだけ）
    if (!sync) return;
    const seatIdForSync =
      seatId ||
      opts?.seatIdForSync ||
      tables.find((t) => t.id === tableId)?.seatsDetail[seatIndex]?.id;
    if (!seatIdForSync) return;

    if (field === "attr1" || field === "attr2" || field === "name") {
      setParticipants((prev) =>
        prev.map((p) => (p.id === seatIdForSync ? { ...p, [field]: value } : p))
      );
    }
  };

  const [editingCell, setEditingCell] = useState<{
    tableId: string;
    seatIndex: number;
    field: "attr1" | "attr2" | "name";
  } | null>(null);

  return (
    <Rnd
      default={{ x: 100, y: 100, width: 600, height: 500 }}
      minWidth={400}
      minHeight={300}
      bounds="window"
      dragHandleClassName="modal-header"
      className="modal-rnd"
    >
      <div className="modal modal-body">
        {/* ヘッダー */}
        <div className="modal-header">
          <span>座席リスト</span>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 本文 */}
        <div className="modal-content" onWheel={(e) => e.stopPropagation()}>
          {tables.map((t) => (
            <div
              key={t.id}
              ref={(el) => {
                sectionRefs.current[t.id] = el;
              }}
              className="seat-section"
            >
              {/* ← h3 の代わりにカスタムヘッダー */}
              <div className="table-header">
                <strong>座席タイプ</strong> {getShapeLabel(t)}
                <label>
                  テーブル名:
                  <input
                    type="text"
                    value={t.alias}
                    onChange={(e) =>
                      setTables((prev) =>
                        prev.map((tt) => (tt.id === t.id ? { ...tt, alias: e.target.value } : tt))
                      )
                    }
                    className="table-header-input"
                  />
                </label>
                <label>
                  座席数:
                  <input
                    type="number"
                    value={t.seats}
                    min={1}
                    max={100} // ✅ 追加：内部100席固定なので上限を設定
                    onChange={(e) => {
                      const next = Math.min(Number(e.target.value), 100);
                      setTables((prev) =>
                        prev.map((tt) => (tt.id === t.id ? { ...tt, seats: next } : tt))
                      );
                    }}
                    className="table-header-input"
                  />
                </label>
              </div>

              {/* 座席テーブル */}
              <table className="common-table seat-table">
                <thead>
                  <tr>
                    <th className="col-seat">席</th>
                    <th className="col-id">ID</th>
                    <th className="col-attr">属性1</th>
                    <th className="col-attr">属性2</th>
                    <th className="col-name">名前</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: t.seats }, (_, idx) => {
                    const seat = t.seatsDetail[idx] ?? {
                      seatNumber: idx + 1,
                      id: "",
                      attr1: "",
                      attr2: "",
                      name: "",
                    };

                    const editable = !duplicateIds.has(seat.id); // ← これに変更！

                    return (
                      <tr key={idx} className={editable ? "row-normal" : "row-missing"}>
                        <td className="cell-center">{seat.seatNumber}</td>
                        <td>
                          <input
                            type="text"
                            value={seat.id ?? ""}
                            className={`cell-input ${
                              duplicateIds.has(seat.id) ? "input-duplicate" : ""
                            }`}
                            onChange={(e) => {
                              const newId = e.target.value;
                              updateSeatField(t.id, idx, "id", newId, {
                                syncParticipants: false,
                              });
                              const matched = participants.find((p) => p.id === newId);
                              updateSeatField(t.id, idx, "attr1", matched?.attr1 ?? "", {
                                syncParticipants: false,
                              });
                              updateSeatField(t.id, idx, "attr2", matched?.attr2 ?? "", {
                                syncParticipants: false,
                              });
                              updateSeatField(t.id, idx, "name", matched?.name ?? "", {
                                syncParticipants: false,
                              });
                            }}
                          />
                        </td>

                        <EditableSeatCell
                          tableId={t.id}
                          seatIndex={idx}
                          field="attr1"
                          value={seat.attr1}
                          editable={editable}
                          editingCell={editingCell}
                          setEditingCell={setEditingCell}
                          updateSeatField={updateSeatField}
                          seatId={seat.id}
                        />
                        <EditableSeatCell
                          tableId={t.id}
                          seatIndex={idx}
                          field="attr2"
                          value={seat.attr2}
                          editable={editable}
                          editingCell={editingCell}
                          setEditingCell={setEditingCell}
                          updateSeatField={updateSeatField}
                          seatId={seat.id}
                        />
                        <EditableSeatCell
                          tableId={t.id}
                          seatIndex={idx}
                          field="name"
                          value={seat.name}
                          editable={editable}
                          editingCell={editingCell}
                          setEditingCell={setEditingCell}
                          updateSeatField={updateSeatField}
                          seatId={seat.id}
                        />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </Rnd>
  );
};
