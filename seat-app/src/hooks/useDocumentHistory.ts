import { useEffect, useRef, useState } from "react";
import { loadState } from "../lib/persist";
import { blankDocument, cloneDocument, normalizeDocument } from "../lib/workspace";
import type { DocumentState, Journal } from "../lib/workspace";

const HISTORY_KEY = "seatAppHistoryV1";

/** 作業データと対応する永続履歴の復元 */
function restoreJournal(): Journal {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const journal = JSON.parse(raw) as Journal;
      return { present: normalizeDocument(journal.present), past: journal.past.map(normalizeDocument), future: journal.future.map(normalizeDocument) };
    }
  } catch { /* 履歴が不正な場合も最新データの復元を試行 */ }
  try { const saved = loadState(); if (saved) return { present: normalizeDocument(saved), past: [], future: [] }; }
  catch { /* 不正データを上書きしないため初期状態の保存は保留 */ }
  return { present: blankDocument(), past: [], future: [] };
}

/** データと履歴を一体管理し、確定した操作だけを記録 */
export function useDocumentHistory() {
  const [journal, setJournal] = useState(restoreJournal);
  const journalRef = useRef(journal);
  const [saveStatus, setSaveStatus] = useState("このブラウザーから復元済み");
  const [dirty, setDirty] = useState(false);
  journalRef.current = journal;

  useEffect(() => {
    if (!dirty) return;
    try {
      const serialized = JSON.stringify(journal);
      localStorage.setItem(HISTORY_KEY, serialized);
      localStorage.setItem("seatAppData", JSON.stringify(journal.present));
      setSaveStatus("このブラウザーに自動保存済み");
    } catch {
      setSaveStatus("自動保存に失敗しました。ファイルへ保存してください");
    }
  }, [journal, dirty]);

  /** 一連の編集を1履歴として確定 */
  function commit(edit: (draft: DocumentState) => void) {
    const current = journalRef.current;
    const draft = cloneDocument(current.present);
    edit(draft);
    if (JSON.stringify(draft) === JSON.stringify(current.present)) return;
    draft.updatedAt = new Date().toISOString();
    const next = { present: draft, past: [...current.past, current.present], future: [] };
    journalRef.current = next; setJournal(next); setDirty(true);
  }

  /** 全体復元と新規作成の履歴区切り */
  function replace(data: DocumentState) {
    const next = { present: { ...data, updatedAt: new Date().toISOString() }, past: [], future: [] };
    journalRef.current = next; setJournal(next); setDirty(true);
  }

  /** 編集データと履歴をまとめて前後へ移動 */
  function travel(direction: "undo" | "redo") {
    const current = journalRef.current;
    const list = direction === "undo" ? current.past : current.future;
    if (!list.length) return;
    const present = { ...list[list.length - 1], updatedAt: new Date().toISOString() };
    const next = direction === "undo"
      ? { present, past: list.slice(0, -1), future: [...current.future, current.present] }
      : { present, past: [...current.past, current.present], future: list.slice(0, -1) };
    journalRef.current = next; setJournal(next); setDirty(true);
  }
  return { data: journal.present, commit, replace, undo: () => travel("undo"), redo: () => travel("redo"), canUndo: !!journal.past.length, canRedo: !!journal.future.length, saveStatus };
}
