import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, SetStateAction } from "react";
import { Stage, Layer, Group, Rect, Text, Transformer } from "react-konva";
import Konva from "konva";
import { TableBox } from "./TableBox";
import { MenuIcon } from "./MenuIcon";
import { SeatInteractionContext } from "./SeatInteractionContext";
import { useDocumentHistory } from "../hooks/useDocumentHistory";
import { blankDocument, emptySeat, integerTablePixels, uniqueTableName } from "../lib/workspace";
import type { DocumentState } from "../lib/workspace";
import { downloadDocument, downloadWorkbook, readImport } from "../lib/workbook";
import type { ImportPreview } from "../lib/workbook";
import { exportPdf } from "../lib/io";
import { rotateTablesForOrientationChange } from "../lib/rotate";
import { fitTableToLabels, joinedLayout } from "../lib/seatGeometry";
import { arrangeTables, detectTableColumns } from "../lib/tableLayout";
import type { Participant, Table } from "../types";
import "../workspace.css";

type Selection = { tableId: string; seatIndex: number };
type Confirmation = { title: string; message: string; accept: () => void };
type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
type RangeBox = { x: number; y: number; endX: number; endY: number };
const CANVAS_PADDING = 12;

/** 卓本体と選択範囲の交差判定（氏名・席番号は対象外） */
function intersectsRange(table: Table, box: RangeBox) {
  const left = Math.min(box.x, box.endX), right = Math.max(box.x, box.endX);
  const top = Math.min(box.y, box.endY), bottom = Math.max(box.y, box.endY);
  if (table.shape === "circle") {
    const x = Math.max(left, Math.min(right, table.x)), y = Math.max(top, Math.min(bottom, table.y));
    return Math.hypot(x - table.x, y - table.y) <= (table.radius ?? 117);
  }
  return table.x + (table.width ?? 270) / 2 >= left && table.x - (table.width ?? 270) / 2 <= right
    && table.y + (table.height ?? 140) / 2 >= top && table.y - (table.height ?? 140) / 2 <= bottom;
}

/** 卓本体の端または中心を基準卓に合わせた整数座標 */
function alignedPosition(table: Table, reference: Table, alignment: Alignment) {
  const horizontal = alignment === "left" || alignment === "center" || alignment === "right";
  const axis = horizontal ? "x" : "y";
  const length = horizontal ? "width" : "height";
  const extent = (value: Table) => value.shape === "circle" ? (value.radius ?? 117) * 2 : value[length] ?? (horizontal ? 270 : 140);
  const direction = alignment === "left" || alignment === "top" ? -1 : alignment === "right" || alignment === "bottom" ? 1 : 0;
  return { [axis]: Math.floor(reference[axis] + direction * (extent(reference) - extent(table)) / 2) };
}

/** 両端を固定し、卓本体の間隔差が最大1pxとなる中間卓の整数座標 */
function distributedPositions(tables: Table[], axis: "x" | "y") {
  if (tables.length < 3) return [];
  const sorted = [...tables].sort((a, b) => a[axis] - b[axis]);
  const lengths = sorted.map(t => t.shape === "circle" ? (t.radius ?? 117) * 2 : (axis === "x" ? t.width ?? 270 : t.height ?? 140));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const distance = last[axis] - first[axis];
  const gap = (distance - lengths[0] / 2 - lengths[lengths.length - 1] / 2 - lengths.slice(1, -1).reduce((sum, length) => sum + length, 0)) / (sorted.length - 1);
  const steps = lengths.slice(1).map((length, index) => gap + (lengths[index] + length) / 2);
  const integers = steps.map(Math.floor);
  const remainder = distance - integers.reduce((sum, step) => sum + step, 0);
  // 小数部分の大きい移動量から1pxを配分し、両端の位置を保持
  const order = steps.map((step, index) => ({ index, fraction: step - integers[index] })).sort((a, b) => b.fraction - a.fraction);
  for (const entry of order.slice(0, remainder)) integers[entry.index] += 1;
  let coordinate = first[axis];
  return sorted.slice(1, -1).map((t, index) => {
    coordinate += integers[index];
    return { id: t.id, coordinate };
  });
}

/** 画面上の形状が一致する選択卓から各寸法の最大値を取得 */
function maximumTableSize(tables: Table[]): Partial<Pick<Table, "width" | "height" | "radius">> | null {
  if (tables.length < 2) return null;
  const kind = (t: Table) => t.shape === "rectangle" && t.design === "joined" ? "joined" : t.shape;
  if (tables.some(t => kind(t) !== kind(tables[0]))) return null;
  return tables[0].shape === "circle" ? { radius: Math.max(...tables.map(t => t.radius ?? 117)) }
    : { width: Math.max(...tables.map(t => t.width ?? 270)), height: Math.max(...tables.map(t => t.height ?? 140)) };
}

/** 最初に選んだ卓の寸法を初期値にした即時プレビューと一括確定 */
function BatchSizeEditor({ tables, apply, applyMaximum, preview }: { tables: Table[]; apply: (sizes: { width: number; height: number; radius: number }) => void; applyMaximum: () => void; preview: (sizes: { width: number; height: number; radius: number } | null) => void }) {
  const rectangle = tables.find(t => t.shape !== "circle"), circle = tables.find(t => t.shape === "circle");
  const sizes = { width: rectangle?.width ?? 270, height: rectangle?.height ?? 140, radius: circle?.radius ?? 117 };
  /** 入力欄ごとの有効な値を選択卓全体へ一時反映 */
  function previewSize(key: keyof typeof sizes, value: string | null) {
    preview(value === null ? null : { ...sizes, [key]: Number(value) });
  }
  return <form className="batch-size-editor" onSubmit={e => { e.preventDefault(); apply(sizes); }}>
    <h3 title="初期値は最初に選んだ卓のサイズ。位置・席数・着席情報は保持">サイズ</h3>
    {rectangle && <><small>長机・正方形 {tables.filter(t => t.shape !== "circle").length}卓</small>
      <div className="field-grid"><EditField label="幅" ariaLabel="一括変更の幅" value={sizes.width} type="number" min={1} step={1} onPreview={value => previewSize("width", value)} onCommit={value => apply({ ...sizes, width: Number(value) })} />
      <EditField label="高さ" ariaLabel="一括変更の高さ" value={sizes.height} type="number" min={1} step={1} onPreview={value => previewSize("height", value)} onCommit={value => apply({ ...sizes, height: Number(value) })} /></div></>}
    {circle && <><small>円卓 {tables.filter(t => t.shape === "circle").length}卓</small>
      <EditField label="半径" ariaLabel="一括変更の半径" value={sizes.radius} type="number" min={1} step={1} onPreview={value => previewSize("radius", value)} onCommit={value => apply({ ...sizes, radius: Number(value) })} /></>}
    <div className="size-actions"><button type="button" onClick={applyMaximum} disabled={!maximumTableSize(tables)} title="同じ形状の卓の最大寸法に揃える">最大サイズに揃える</button><button className="primary" type="submit">適用</button></div>
    {!maximumTableSize(tables) && <small>最大サイズ：同じ形状の卓のみ</small>}
  </form>;
}

/** 旧形式の未使用コールバックとの互換 */
function ignoreSelection() {}

/** 入力中の文字を履歴へ逐次追加せず、確定時だけ反映 */
function EditField({ label, value, type = "text", min, max, step, integer = false, onCommit, onPreview, ariaLabel }: { label: string; value: string | number; type?: string; min?: number; max?: number; step?: number; integer?: boolean; onCommit: (value: string) => void; onPreview?: (value: string | null) => void; ariaLabel?: string }) {
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  /** 空欄・範囲外・整数制約をプレビューと確定で共通検証 */
  function validNumber(text: string) {
    const number = Number(text);
    return text.trim() !== "" && Number.isFinite(number)
      && (min === undefined || number >= min) && (max === undefined || number <= max)
      && (!integer || Number.isInteger(number));
  }
  return <label className="field"><span title={label}>{label}</span><input type={type} min={min} max={max} step={step} title={String(value)} aria-label={ariaLabel} value={draft} onChange={e => {
      const next = e.target.value;
      setDraft(next);
      onPreview?.(validNumber(next) ? next : null);
    }}
    onBlur={() => {
      // 数値の空欄・範囲外を確定せず、入力前の値を保持
      const valid = type !== "number" || validNumber(draft);
      if (!cancelled.current && valid && draft !== String(value)) onCommit(draft);
      cancelled.current = false; onPreview?.(null); setDraft(String(value));
    }} onKeyDown={e => {
      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === "Escape") { cancelled.current = true; onPreview?.(null); setDraft(String(value)); e.currentTarget.blur(); }
    }} /></label>;
}

/** 文字サイズを即時プレビューし、入力確定時に1回だけ履歴へ記録 */
function FontSizeField({ value, onPreview, onCommit, label = "文字サイズ", max = 72, hint }: { value: number; onPreview: (value: number | null) => void; onCommit: (value: number) => void; label?: string; max?: number; hint?: string }) {
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="font-size-control">{label}<input type="number" min={6} max={max} step={1} value={draft} title={hint ? `${hint}（6〜${max}）` : `6〜${max}で指定`} onChange={e => {
    const next = e.target.value;
    const number = Number(next);
    setDraft(next);
    onPreview(next !== "" && Number.isInteger(number) && number >= 6 && number <= max ? number : null);
  }} onBlur={() => {
    const number = Number(draft);
    if (!cancelled.current && draft !== "" && Number.isInteger(number) && number >= 6 && number <= max && number !== value) onCommit(number);
    cancelled.current = false;
    onPreview(null); setDraft(String(value));
  }} onKeyDown={e => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") { cancelled.current = true; onPreview(null); setDraft(String(value)); e.currentTarget.blur(); }
  }} /></label>;
}

/** キャンバス倍率を即時プレビューし、入力確定時に1回だけ履歴へ記録 */
function CanvasScaleField({ value, onPreview, onCommit }: { value: number; onPreview: (value: number | null) => void; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="canvas-scale-control">用紙の大きさ<input type="number" min={0.1} max={10} step={0.1} value={draft} title="大きくすると、より多くの卓を配置できます" onChange={e => {
    const next = e.target.value;
    const number = Number(next);
    setDraft(next);
    onPreview(next !== "" && Number.isFinite(number) && number >= 0.1 && number <= 10 ? number : null);
  }} onBlur={() => {
    const number = Number(draft);
    if (!cancelled.current && draft !== "" && Number.isFinite(number) && number >= 0.1 && number <= 10 && number !== value) onCommit(number);
    cancelled.current = false; onPreview(null); setDraft(String(value));
  }} onKeyDown={e => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") { cancelled.current = true; onPreview(null); setDraft(String(value)); e.currentTarget.blur(); }
  }} /></label>;
}

/** キーボードで閉じられる確認・編集ダイアログ */
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-cancel]") ?? []);
    (buttons.find(button => button.textContent === "キャンセル") ?? buttons[0])?.focus();
  }, []);
  return <div className="dialog-backdrop"><div ref={ref} className="workspace-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input,select,[tabindex='0']"));
      const first = fields[0], last = fields[fields.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><header><h2>{title}</h2><button data-cancel onClick={close} aria-label="閉じる">×</button></header>{children}</div></div>;
}

/** 読み込み前に机配置を確認する縮小図 */
function LayoutPreview({ data }: { data: DocumentState }) {
  const width = (data.orientation === "landscape" ? 1123 : 794) * (data.scale ?? 1);
  const height = (data.orientation === "landscape" ? 794 : 1123) * (data.scale ?? 1);
  return <svg className="layout-preview" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="読み込み後の配置"><rect width={width} height={height} fill="#f8fafc" />{data.tables.map(t => <g key={t.id} transform={`translate(${t.x} ${t.y})`}>
    {t.shape === "circle" ? <circle r={t.radius} fill="#dbeafe" stroke="#64748b" /> : <rect x={-(t.width ?? 0) / 2} y={-(t.height ?? 0) / 2} width={t.width} height={t.height} rx="8" fill="#bbf7d0" stroke="#64748b" />}
    <text textAnchor="middle" dominantBaseline="middle" fontSize={width / 55} fill="#14243b">{t.alias}</text>
  </g>)}</svg>;
}

/** 会場図と席次を一体で編集するワークスペース */
export function SeatWorkspace() {
  const history = useDocumentHistory();
  const { data, commit: commitDocument, replace } = history;

  /** 入力・追加・移動・サイズ変更の確定時に卓のピクセル値を整数化 */
  function commit(edit: (draft: DocumentState) => void) {
    commitDocument(draft => { edit(draft); draft.tables = draft.tables.map(integerTablePixels); });
  }
  const [mode, setMode] = useState<"layout" | "seating">("layout");
  const [selectedId, setPrimaryId] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [rangeActive, setRangeActive] = useState(false);
  const [rangeBox, setRangeBox] = useState<RangeBox | null>(null);
  const range = useRef<RangeBox | null>(null);

  /** 個別操作へ移る際の複数選択解除 */
  function setSelectedId(id: string | null) { setPrimaryId(id); setSelectedTableIds(id ? [id] : []); }

  /** Ctrlクリックで追加・解除し、最初の卓を基準として保持 */
  function selectTable(id: string, additive = false) {
    const ids = mode === "layout" && additive
      ? selectedTableIds.includes(id) ? selectedTableIds.filter(value => value !== id) : [...selectedTableIds, id]
      : [id];
    setSelectedTableIds(ids); setPrimaryId(ids[0] ?? null); setSelectedSeat(null); setSwapFrom(null); setPanelOpen(true);
  }
  const [selectedSeat, setSelectedSeat] = useState<Selection | null>(null);
  const [swapFrom, setSwapFrom] = useState<Selection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [canvasOrigin, setCanvasOrigin] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [fontPreview, setFontPreview] = useState<number | null>(null);
  const [scalePreview, setScalePreview] = useState<number | null>(null);
  const [tablePreviews, setTablePreviews] = useState<Record<string, Partial<Table>>>({});
  const displayFontSize = fontPreview ?? data.fontSize ?? 24;
  const [titleFontPreview, setTitleFontPreview] = useState<number | null>(null);
  const displayTitleFontSize = titleFontPreview ?? data.titleFontSize ?? (data.fontSize ?? 24) * 1.2;
  const [query, setQuery] = useState("");
  const [fileMenu, setFileMenu] = useState(false);
  const [otherMenu, setOtherMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState<"all" | "unassigned" | "pick" | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [importMode, setImportMode] = useState<"full" | "roster">("full");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState("");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panActive, setPanActive] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewToolsHeight, setViewToolsHeight] = useState(32);
  const [viewScroll, setViewScroll] = useState({ left: 0, top: 0 });
  const canvasArea = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const viewTools = useRef<HTMLDivElement>(null);
  const seatList = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, Konva.Group>>({});
  const tableDrag = useRef<{ id: string; x: number; y: number; tables: { id: string; x: number; y: number }[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileMenuAnchor = useRef<HTMLDivElement>(null);
  const otherMenuAnchor = useRef<HTMLDivElement>(null);
  const addMenuAnchor = useRef<HTMLDivElement>(null);
  const settingsMenuAnchor = useRef<HTMLDetailsElement>(null);
  const clipboard = useRef<Table | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean; clearSelection: boolean } | null>(null);
  const wheelScroll = useRef<{ left: number; top: number } | null>(null);
  const buttonZoomSize = useRef<{ width: number; height: number } | null>(null);
  const fitted = useRef(false);
  const pageWidth = (data.orientation === "landscape" ? 1123 : 794) * (scalePreview ?? data.scale ?? 1);
  const pageHeight = (data.orientation === "landscape" ? 794 : 1123) * (scalePreview ?? data.scale ?? 1);
  const canvasLeft = canvasOrigin?.left ?? CANVAS_PADDING + Math.max(0, (size.width - CANVAS_PADDING * 2 - pageWidth * zoom) / 2);
  const canvasTopPadding = viewToolsHeight + 20;
  const canvasTop = canvasOrigin ? Math.max(canvasTopPadding, canvasOrigin.top) : canvasTopPadding + Math.max(0, (size.height - canvasTopPadding - CANVAS_PADDING - pageHeight * zoom) / 2);
  const displayTables = useMemo(() => data.tables.map(t => {
    const patch = tablePreviews[t.id];
    if (!patch) return t;
    const next = integerTablePixels({ ...t, ...patch });
    if (patch.seats !== undefined) { next.plannedSeats = next.seats; next.seatsDetail = Array.from({ length: next.seats }, (_, index) => t.seatsDetail[index] ?? emptySeat(index)); }
    return next;
  }), [data.tables, tablePreviews]);
  const selectedTables = selectedTableIds.map(id => data.tables.find(t => t.id === id)).filter((t): t is Table => !!t);
  const table = data.tables.find(t => t.id === selectedId);
  const displayTable = displayTables.find(t => t.id === selectedId);
  const seat = selectedSeat && table?.id === selectedSeat.tableId ? table.seatsDetail[selectedSeat.seatIndex] : null;
  const person = data.participants.find(p => p.id === seat?.id);
  const assigned = useMemo(() => {
    const result = new Map<string, { table: Table; index: number }>();
    data.tables.forEach(t => t.seatsDetail.slice(0, t.seats).forEach((s, index) => { if (s.id) result.set(s.id, { table: t, index }); }));
    return result;
  }, [data.tables]);
  const attending = useMemo(() => data.participants.filter(p => p.attending !== false), [data.participants]);
  const seatedCount = useMemo(() => attending.filter(p => assigned.has(p.id)).length, [attending, assigned]);
  const totalSeats = useMemo(() => data.tables.reduce((sum, t) => sum + t.seats, 0), [data.tables]);

  useEffect(() => {
    /** メニュー内の操作を維持し、各メニューの外側を押したときだけ閉じる処理 */
    function dismissMenus(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!fileMenuAnchor.current?.contains(event.target)) setFileMenu(false);
      if (!otherMenuAnchor.current?.contains(event.target)) setOtherMenu(false);
      if (!addMenuAnchor.current?.contains(event.target)) setAddMenu(false);
      if (!settingsMenuAnchor.current?.contains(event.target)) settingsMenuAnchor.current?.removeAttribute("open");
    }
    document.addEventListener("pointerdown", dismissMenus, true);
    return () => document.removeEventListener("pointerdown", dismissMenus, true);
  }, []);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    // 常時表示の操作パネルが折り返しても会場図と重ならない余白の確保
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth, height = node.clientHeight;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
      if (viewTools.current) { const toolsHeight = viewTools.current.offsetHeight; setViewToolsHeight(current => current === toolsHeight ? current : toolsHeight); }
    });
    observer.observe(node);
    if (viewTools.current) observer.observe(viewTools.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!fitted.current && size.width > 0 && size.height > 0) { setZoom(Math.max(0.05, Math.min((size.width - CANVAS_PADDING * 2) / pageWidth, (size.height - canvasTopPadding - CANVAS_PADDING) / pageHeight, 1))); fitted.current = true; }
  }, [size, pageWidth, pageHeight, canvasTopPadding]);
  useEffect(() => {
    transformer.current?.nodes(mode === "layout" && selectedTableIds.length === 1 && !selectedSeat && !swapFrom && selectedId && shapeRefs.current[selectedId] ? [shapeRefs.current[selectedId]] : []);
  }, [mode, selectedId, selectedTableIds, selectedSeat, swapFrom, displayTables]);

  useLayoutEffect(() => {
    const list = seatList.current;
    const row = list?.querySelector<HTMLTableRowElement>("tr.selected");
    if (!list || !row || (!selectedSeat && !swapFrom)) return;
    // 固定見出しを除いた一覧の中央へ選択行だけを移動
    const bounds = list.getBoundingClientRect(), rowBounds = row.getBoundingClientRect();
    const headerHeight = list.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = list.scrollTop + rowBounds.top - bounds.top - list.clientTop + rowBounds.height / 2 - (list.clientHeight + headerHeight) / 2;
    list.scrollTop = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, top));
  }, [selectedSeat, swapFrom, panelOpen, mode, selectedId]);

  useEffect(() => {
    const node = viewport.current;
    const area = canvasArea.current;
    if (!node || !area) return;
    let frame: number | null = null;
    let input: { delta: number; clientX: number; clientY: number } | null = null;
    /** 連続入力を1画面更新へまとめ、カーソル下の会場座標を保持 */
    function flushWheel() {
      frame = null;
      const event = input;
      input = null;
      if (!event) return;
      const sheet = node!.querySelector<HTMLElement>(".canvas-sheet");
      if (!sheet) return;
      const bounds = node!.getBoundingClientRect();
      const sheetBounds = sheet.getBoundingClientRect();
      const currentZoom = sheetBounds.width / pageWidth;
      const nextZoom = Math.max(0.05, Math.min(3, currentZoom * Math.exp(-Math.max(-600, Math.min(600, event.delta)) * Math.log(1.2) / 100)));
      if (nextZoom === currentZoom) return;
      const x = (event.clientX - sheetBounds.left) / currentZoom;
      const y = (event.clientY - sheetBounds.top) / currentZoom;
      const originX = event.clientX - bounds.left - x * nextZoom;
      const originY = event.clientY - bounds.top - y * nextZoom;
      const left = Math.max(CANVAS_PADDING, originX);
      const top = Math.max(canvasTopPadding, originY);
      wheelScroll.current = { left: left - originX, top: top - originY };
      // 用紙が表示領域より小さくなっても、拡縮中心を保持するための末尾余白
      const right = Math.max(0, wheelScroll.current.left + node!.clientWidth - left - pageWidth * nextZoom - CANVAS_PADDING);
      const bottom = Math.max(0, wheelScroll.current.top + node!.clientHeight - top - pageHeight * nextZoom - CANVAS_PADDING);
      setCanvasOrigin({ left, top, right, bottom }); setZoom(nextZoom);
      pointer.current = x >= 0 && x <= pageWidth && y >= 0 && y <= pageHeight ? { x, y } : null;
    }
    /** 編集欄へ影響させず会場図内のホイール入力を蓄積 */
    function wheel(event: WheelEvent) {
      if (!event.deltaY || (event.target as HTMLElement).closest(".canvas-controls,input,textarea,select,[contenteditable=true]")) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node!.clientHeight : 1);
      input = { delta: (input?.delta ?? 0) + Math.max(-100, Math.min(100, delta)), clientX: event.clientX, clientY: event.clientY };
      if (frame === null) frame = requestAnimationFrame(flushWheel);
    }
    // ブラウザーの通常スクロールを会場図内だけで抑止する非passiveリスナー
    area.addEventListener("wheel", wheel, { passive: false });
    return () => { area.removeEventListener("wheel", wheel); if (frame !== null) cancelAnimationFrame(frame); };
  }, [pageWidth, pageHeight, canvasTopPadding]);

  useLayoutEffect(() => {
    if (!wheelScroll.current || !viewport.current) return;
    const node = viewport.current;
    // ボタン拡縮ではスクロールバーによる表示領域中央の変化も補正
    const previousSize = buttonZoomSize.current;
    if (previousSize && (previousSize.width !== node.clientWidth || previousSize.height !== node.clientHeight)) {
      wheelScroll.current.left += (previousSize.width - node.clientWidth) / 2;
      wheelScroll.current.top += (previousSize.height - node.clientHeight) / 2;
      buttonZoomSize.current = { width: node.clientWidth, height: node.clientHeight };
      const shiftX = Math.max(0, -wheelScroll.current.left), shiftY = Math.max(0, -wheelScroll.current.top);
      wheelScroll.current.left += shiftX; wheelScroll.current.top += shiftY;
      if (shiftX || shiftY) {
        setCanvasOrigin(origin => origin && { ...origin, left: origin.left + shiftX, top: origin.top + shiftY });
        return;
      }
    }
    // スクロールバーの出現・消失で変わる表示領域を実際の描画寸法から補正
    const right = Math.max(0, wheelScroll.current.left - (node.scrollWidth - node.clientWidth));
    const bottom = Math.max(0, wheelScroll.current.top - (node.scrollHeight - node.clientHeight));
    if (right > 0 || bottom > 0) {
      setCanvasOrigin(origin => origin && { ...origin, right: origin.right + (right > 0 ? Math.ceil(right) + 1 : 0), bottom: origin.bottom + (bottom > 0 ? Math.ceil(bottom) + 1 : 0) });
      return;
    }
    node.scrollTo(wheelScroll.current.left, wheelScroll.current.top);
    setViewScroll({ left: node.scrollLeft, top: node.scrollTop });
    wheelScroll.current = null;
    buttonZoomSize.current = null;
  }, [zoom, canvasOrigin]);

  /** 拡縮ボタンの操作前後で表示領域中央の会場座標を保持 */
  function zoomFromCenter(factor: number) {
    const node = viewport.current;
    const sheet = node?.querySelector<HTMLElement>(".canvas-sheet");
    if (!node || !sheet) return;
    const bounds = node.getBoundingClientRect();
    const sheetBounds = sheet.getBoundingClientRect();
    const currentZoom = sheetBounds.width / pageWidth;
    const nextZoom = Math.max(0.05, Math.min(3, currentZoom * factor));
    if (nextZoom === currentZoom) return;
    buttonZoomSize.current = { width: node.clientWidth, height: node.clientHeight };
    const centerX = node.clientWidth / 2, centerY = node.clientHeight / 2;
    const x = (bounds.left + centerX - sheetBounds.left) / currentZoom;
    const y = (bounds.top + centerY - sheetBounds.top) / currentZoom;
    const originX = centerX - x * nextZoom, originY = centerY - y * nextZoom;
    const left = Math.max(CANVAS_PADDING, originX), top = Math.max(canvasTopPadding, originY);
    wheelScroll.current = { left: left - originX, top: top - originY };
    const right = Math.max(0, wheelScroll.current.left + node.clientWidth - left - pageWidth * nextZoom - CANVAS_PADDING);
    const bottom = Math.max(0, wheelScroll.current.top + node.clientHeight - top - pageHeight * nextZoom - CANVAS_PADDING);
    setCanvasOrigin({ left, top, right, bottom }); setZoom(nextZoom);
  }

  /** 画面中央を会場内座標へ変換 */
  function visibleCenter() {
    const node = viewport.current;
    return { x: ((node?.scrollLeft ?? 0) + (node?.clientWidth ?? size.width) / 2 - canvasLeft) / zoom, y: ((node?.scrollTop ?? 0) + ((node?.clientHeight ?? size.height) + canvasTopPadding - CANVAS_PADDING) / 2 - canvasTop) / zoom };
  }

  /** 卓の設定だけを貼り付け、参加者はコピーしない */
  function pasteTable() {
    if (!clipboard.current) { setNotice("先に卓を選択してコピーしてください"); return; }
    const position = pointer.current ?? visibleCenter();
    const id = crypto.randomUUID();
    commit(draft => {
      const source = clipboard.current!;
      draft.tables.push({ ...structuredClone(source), id, number: Math.max(0, ...draft.tables.map(t => t.number)) + 1, alias: uniqueTableName(draft.tables, `${source.alias}のコピー`), ...position, seatsDetail: Array.from({ length: source.seats }, (_, index) => emptySeat(index)) });
    });
    setSelectedId(id); setSelectedSeat(null); setPanelOpen(true); setNotice("空席の卓を貼り付けました");
  }

  /** 着席情報を保持しない卓の削除 */
  function deleteTable() {
    if (!table) return;
    const count = table.seatsDetail.filter(s => s.id).length;
    setConfirmation({ title: "テーブルを削除", message: `${table.alias}を削除します。${count}名の割り当てを解除し、名簿と参加設定は保持します。`, accept: () => {
      commit(d => { d.tables = d.tables.filter(t => t.id !== table.id); });
      setSelectedId(null); setSelectedSeat(null);
    } });
  }

  /** 選択席だけを削除し、後続の席番号を詰める既存操作の引き継ぎ */
  function deleteSeat(selection: Selection) {
    commit(draft => {
      const target = draft.tables.find(t => t.id === selection.tableId);
      if (!target || selection.seatIndex < 0 || selection.seatIndex >= target.seats) return;
      target.seatsDetail.splice(selection.seatIndex, 1);
      target.seats -= 1; target.plannedSeats = target.seats;
      target.seatsDetail = target.seatsDetail.map((seat, index) => ({ ...seat, seatNumber: index + 1 }));
    });
    setSelectedSeat(null); setSwapFrom(null); setSelectedId(null);
  }

  useEffect(() => {
    /** 入力中とダイアログ内では卓のショートカットを実行しない */
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      if (event.key === "Escape") { setSwapFrom(null); setFileMenu(false); setOtherMenu(false); setAddMenu(false); range.current = null; setRangeBox(null); setRangeActive(false); return; }
      if (event.code === "Space") { event.preventDefault(); setSpaceHeld(true); }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "z") { event.preventDefault(); setSwapFrom(null); if (event.shiftKey) history.redo(); else history.undo(); }
        if (key === "y") { event.preventDefault(); setSwapFrom(null); history.redo(); }
        if (key === "c" && table && selectedTables.length === 1) { event.preventDefault(); clipboard.current = structuredClone(table); setNotice("卓をコピーしました。Ctrl+Vで貼り付けます"); }
        if (key === "v" && clipboard.current) { event.preventDefault(); pasteTable(); }
      } else if (mode === "layout" && selectedTables.length && !event.altKey && event.key.startsWith("Arrow")) {
        // 表示倍率によらず、選択卓の用紙上の座標を同じ距離だけ移動
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        event.preventDefault();
        commit(draft => {
          draft.tables.forEach(t => {
            if (selectedTableIds.includes(t.id)) { t.x += dx; t.y += dy; }
          });
        });
      } else if (event.key === "Delete" && (selectedSeat || swapFrom)) { event.preventDefault(); deleteSeat((selectedSeat ?? swapFrom)!); }
      else if (event.key === "Delete" && table && selectedTables.length === 1) { event.preventDefault(); deleteTable(); }
    }
    /** パン操作の解除 */
    function keyup(event: KeyboardEvent) { if (event.code === "Space") { setSpaceHeld(false); pan.current = null; setPanActive(false); } }
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); };
  });

  /** 氏名のクリックでは入れ替え待ちを解除し、対象席の編集だけを表示 */
  function selectSeat(tableId: string, seatIndex: number) {
    setSwapFrom(null);
    setSelectedId(tableId); setSelectedSeat({ tableId, seatIndex }); setPanelOpen(true);
  }

  /** 席番号の1クリック目で選択、2クリック目で着席情報を入れ替え */
  function swapSeat(tableId: string, seatIndex: number) {
    const next = { tableId, seatIndex };
    setSelectedId(tableId); setSelectedSeat(null);
    if (swapFrom?.tableId === tableId && swapFrom.seatIndex === seatIndex) { setSwapFrom(null); return; }
    if (swapFrom) {
      commit(draft => {
        const from = draft.tables.find(t => t.id === swapFrom.tableId)!;
        const to = draft.tables.find(t => t.id === tableId)!;
        const a = from.seatsDetail[swapFrom.seatIndex], b = to.seatsDetail[seatIndex];
        from.seatsDetail[swapFrom.seatIndex] = { ...b, seatNumber: swapFrom.seatIndex + 1 };
        to.seatsDetail[seatIndex] = { ...a, seatNumber: seatIndex + 1 };
      });
      setSwapFrom(null); setNotice("席を入れ替えました");
    } else setSwapFrom(next);
  }

  /** 参加者の変更を名簿と割り当て席へ同時反映 */
  function updatePerson(id: string, changes: Partial<Participant>) {
    commit(draft => {
      const p = draft.participants.find(p => p.id === id);
      if (!p) return;
      Object.assign(p, changes);
      draft.tables.forEach(t => t.seatsDetail.forEach(s => { if (s.id === id) Object.assign(s, { name: p.name, attr1: p.attr1, attr2: p.attr2 }); }));
    });
  }

  /** 指定席への移動。元の席と移動先の割り当てを分離 */
  function assignPerson(p: Participant) {
    if (!selectedSeat) return;
    const destination = selectedSeat;
    const execute = () => {
      commit(draft => {
        draft.tables.forEach(t => { t.seatsDetail = t.seatsDetail.map((s, index) => s.id === p.id ? emptySeat(index) : s); });
        const target = draft.tables.find(t => t.id === destination.tableId)!;
        target.seatsDetail[destination.seatIndex] = { seatNumber: destination.seatIndex + 1, id: p.id, name: p.name, attr1: p.attr1, attr2: p.attr2 };
      });
      setPeopleOpen(null);
    };
    if (seat?.id && seat.id !== p.id) setConfirmation({ title: "参加者を置き換える", message: `${seat.name}さんを未着席に戻し、${p.name}さんをこの席へ移動します。`, accept: execute });
    else execute();
  }

  /** 卓の設定を1操作として変更 */
  function updateTable(id: string, changes: Partial<Table>) {
    if (changes.alias !== undefined && (!changes.alias.trim() || data.tables.some(t => t.id !== id && t.alias === changes.alias!.trim()))) { setNotice("テーブル名は空欄や重複にできません"); return; }
    const numeric = [changes.x, changes.y, changes.width, changes.height, changes.radius].filter(n => n !== undefined);
    if (numeric.some(n => !Number.isFinite(n)) || [changes.width, changes.height, changes.radius].some(n => n !== undefined && n <= 0)) { setNotice("寸法は正の数、座標は数値で指定してください"); return; }
    commit(d => { const target = d.tables.find(t => t.id === id); if (target) Object.assign(target, changes, changes.alias === undefined ? {} : { alias: changes.alias.trim() }); });
  }

  /** 選択卓を同じ整数距離だけ描画移動し、終了時に1操作として確定 */
  function dragTable(id: string, phase: "start" | "move" | "end", x: number, y: number) {
    if (phase === "start") {
      const ids = selectedTableIds.includes(id) ? selectedTableIds : [id];
      const origin = data.tables.find(t => t.id === id);
      if (!origin) return;
      tableDrag.current = { id, x: origin.x, y: origin.y, tables: data.tables.filter(t => ids.includes(t.id)).map(t => ({ id: t.id, x: t.x, y: t.y })) };
      if (!selectedTableIds.includes(id)) setSelectedId(id);
      setSelectedSeat(null); setSwapFrom(null);
      return;
    }
    const start = tableDrag.current;
    if (!start || start.id !== id) return;
    const dx = Math.floor(x - start.x), dy = Math.floor(y - start.y);
    for (const t of start.tables) shapeRefs.current[t.id]?.position({ x: t.x + dx, y: t.y + dy });
    if (phase !== "end") return;
    tableDrag.current = null;
    if (!dx && !dy) return;
    commit(draft => {
      for (const t of start.tables) {
        const target = draft.tables.find(value => value.id === t.id);
        if (target) { target.x = t.x + dx; target.y = t.y + dy; }
      }
    });
  }

  /** 単独の数値入力を保存データとは分離して一時描画 */
  function previewTableNumber(key: "seats" | "width" | "height" | "radius" | "x" | "y", value: string | null) {
    setTablePreviews(table && value !== null ? { [table.id]: { [key]: Number(value) } } : {});
  }

  /** 一括サイズ入力の有効値を選択卓の形状に応じて一時描画 */
  function previewBatchSize(sizes: { width: number; height: number; radius: number } | null) {
    setTablePreviews(sizes ? Object.fromEntries(selectedTables.map(t => [t.id, t.shape === "circle" ? { radius: sizes.radius } : { width: sizes.width, height: sizes.height }])) : {});
  }

  /** 席数削減に伴う参加者の未着席化 */
  function changeSeats(value: string) {
    if (!table) return;
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 100) { setNotice("席数は0〜100の整数にしてください"); return; }
    const removed = table.seatsDetail.slice(count).filter(s => s.id).length;
    const execute = () => commit(d => {
      const target = d.tables.find(t => t.id === table.id)!;
      target.seats = count; target.plannedSeats = count;
      target.seatsDetail = Array.from({ length: count }, (_, i) => target.seatsDetail[i] ?? emptySeat(i));
    });
    if (removed) setConfirmation({ title: "席数を減らす", message: `${removed}名を未着席に戻します。名簿と参加設定は保持します。`, accept: execute });
    else execute();
  }

  /** 形状を変更しても席番号と着席情報を保持 */
  function changeShape(value: string) {
    if (!table) return;
    const portrait = table.orientation === "portrait";
    updateTable(table.id, value === "circle" ? { shape: "circle", design: undefined, radius: 117 }
      : value === "square" ? { shape: "square", design: undefined, width: 200, height: 200 }
      : { shape: "rectangle", design: value === "joined" ? "joined" : undefined, width: portrait ? 140 : value === "joined" ? 540 : 270, height: portrait ? value === "joined" ? 540 : 270 : 140 });
  }

  /** 現在の表示範囲の中央へ空席の卓を追加 */
  function addTable(value: string) {
    const id = crypto.randomUUID(); const position = visibleCenter();
    commit(d => {
      const number = Math.max(0, ...d.tables.map(t => t.number)) + 1;
      const seats = value === "circle" ? 8 : value === "joined" ? 9 : 4;
      d.tables.push({ id, number, alias: uniqueTableName(d.tables, `テーブル${number}`), shape: value === "circle" ? "circle" : value === "square" ? "square" : "rectangle", ...(value === "joined" ? { design: "joined" as const } : {}), orientation: "landscape", ...position, radius: 117, width: value === "joined" ? 540 : value === "square" ? 200 : 270, height: value === "square" ? 200 : 140, seats, plannedSeats: seats, seatsDetail: Array.from({ length: seats }, (_, i) => emptySeat(i)) });
    });
    setAddMenu(false); setSelectedId(id); setSelectedSeat(null); setPanelOpen(true);
  }

  /** 用紙中心を基準に配置と長机の縦横を回転 */
  function changeOrientation(value: "portrait" | "landscape") {
    if (value === data.orientation) return;
    const newSize = { width: pageHeight, height: pageWidth };
    commit(d => { d.tables = rotateTablesForOrientationChange(d.tables, d.orientation, value, { width: pageWidth, height: pageHeight }, newSize); d.orientation = value; });
    fitted.current = false;
    setCanvasOrigin(null);
  }

  /** 編集用の枠を除いた独立ステージによるPDF出力 */
  function savePdf() {
    if (!stage.current) return;
    const container = document.createElement("div");
    const copy = stage.current.clone({ container, width: pageWidth, height: pageHeight, scaleX: 1, scaleY: 1 }) as Konva.Stage;
    // 画面のスクロールと表示倍率を除き、用紙全体を原寸で出力
    copy.findOne<Konva.Group>(".document-root")?.setAttrs({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    copy.find("Transformer").forEach(node => node.destroy());
    copy.find(".selection-overlay").forEach(node => node.destroy());
    copy.find<Konva.Shape>(".table-body").forEach(node => { node.stroke("#64748b"); node.strokeWidth(1.5); });
    copy.find<Konva.Shape>(".seat-body").forEach(node => { node.stroke("#64748b"); node.strokeWidth(1.25); node.fill("#ffffff"); });
    copy.find<Konva.Text>(".seat-number").forEach(node => node.fill("black"));
    copy.draw(); exportPdf(copy, data.orientation, data.title); copy.destroy();
  }

  /** ファイルの検証結果を現在データへの反映前に表示 */
  async function loadFile(file: File) {
    try { setPreview(await readImport(file, data, importMode)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "読み込みに失敗しました"); }
  }

  /** 卓と検索対象を表示領域へ移動 */
  function reveal(t: Table, index?: number) {
    setSelectedId(t.id); setSelectedSeat(index === undefined ? null : { tableId: t.id, seatIndex: index }); setPanelOpen(true); setQuery("");
    viewport.current?.scrollTo({ left: Math.max(0, t.x * zoom - size.width / 2 + canvasLeft), top: Math.max(0, t.y * zoom - (size.height + canvasTopPadding - CANVAS_PADDING) / 2 + canvasTop), behavior: "smooth" });
  }

  /** 選択卓それぞれを名札に合わせた寸法へ1回の履歴で調整 */
  function fitSelectedTables() {
    commit(draft => {
      draft.tables = draft.tables.map(t => selectedTableIds.includes(t.id)
        ? { ...t, ...fitTableToLabels(t, displayFontSize, { showNames: draft.showNames, participants: draft.participants }) } : t);
    });
  }

  /** 最初の選択卓を固定し、他の選択卓の位置だけを1操作で整列 */
  function alignSelectedTables(alignment: Alignment) {
    const reference = selectedTables[0];
    if (!reference || selectedTables.length < 2) return;
    const updates = selectedTables.slice(1).map(t => ({ id: t.id, position: alignedPosition(t, reference, alignment) }));
    if (updates.every(update => {
      const target = selectedTables.find(t => t.id === update.id)!;
      return Object.entries(update.position).every(([axis, value]) => target[axis as "x" | "y"] === value);
    })) return;
    commit(draft => {
      for (const update of updates) {
        const target = draft.tables.find(t => t.id === update.id);
        if (target) Object.assign(target, update.position);
      }
    });
  }

  /** 指定方向の中間卓だけを等間隔に移動し、1操作として確定 */
  function distributeSelectedTables(axis: "x" | "y") {
    const updates = distributedPositions(selectedTables, axis);
    if (!updates.length || updates.every(update => selectedTables.find(t => t.id === update.id)?.[axis] === update.coordinate)) return;
    commit(draft => {
      for (const update of updates) {
        const target = draft.tables.find(t => t.id === update.id);
        if (target) target[axis] = update.coordinate;
      }
    });
  }

  /** 選択卓の列順を保った再配置を1回の履歴として確定 */
  function arrangeSelectedTables() {
    const positions = arrangeTables(selectedTables, displayFontSize, { showNames: data.showNames, participants: data.participants }, { width: pageWidth, height: pageHeight });
    if (!positions.length || positions.every(position => {
      const target = selectedTables.find(t => t.id === position.id)!;
      return target.x === position.x && target.y === position.y;
    })) return;
    commit(draft => {
      for (const position of positions) {
        const target = draft.tables.find(t => t.id === position.id);
        if (target) { target.x = position.x; target.y = position.y; }
      }
    });
  }

  /** 同じ形状の全選択卓を最大寸法へ1操作で変更 */
  function applyMaximumSize() {
    const sizes = maximumTableSize(selectedTables);
    if (!sizes || selectedTables.every(t => Object.entries(sizes).every(([key, value]) => t[key as "width" | "height" | "radius"] === value))) return;
    commit(draft => {
      for (const t of draft.tables) {
        if (selectedTableIds.includes(t.id)) Object.assign(t, sizes);
      }
    });
  }

  /** 選択卓の寸法だけを1回の履歴として確定 */
  function applyBatchSize(sizes: { width: number; height: number; radius: number }) {
    if (Object.values(sizes).some(value => !Number.isFinite(value) || value < 1)) return;
    commit(draft => {
      draft.tables.forEach(t => {
        if (!selectedTableIds.includes(t.id)) return;
        if (t.shape === "circle") t.radius = sizes.radius;
        else { t.width = sizes.width; t.height = sizes.height; }
      });
    });
  }

  const setTables: Dispatch<SetStateAction<Table[]>> = action => commit(d => { d.tables = typeof action === "function" ? action(d.tables) : action; });
  /** 余白またはSpace併用時だけ画面移動を開始し、卓・席の操作を保持 */
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType !== "mouse" || (event.target as HTMLElement).closest(".canvas-controls")) return;
    const node = viewport.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    if (event.clientX - bounds.left >= node.clientWidth || event.clientY - bounds.top >= node.clientHeight) return;
    const canvasBounds = stage.current?.container().getBoundingClientRect();
    const hit = canvasBounds && stage.current?.getIntersection({ x: event.clientX - canvasBounds.left, y: event.clientY - canvasBounds.top });
    if (!spaceHeld && hit && hit.name() !== "paper-background") return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "layout" && !spaceHeld && (event.shiftKey || rangeActive)) {
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      range.current = { x, y, endX: x, endY: y }; setRangeBox(range.current);
      return;
    }
    pan.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop, moved: false, clearSelection: !spaceHeld && hit?.name() === "paper-background" };
  }

  /** 小さな手ぶれをクリックとして扱い、4px以上の左ドラッグで画面移動 */
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const node = viewport.current;
    if (range.current && node) {
      const bounds = node.getBoundingClientRect();
      range.current = { ...range.current, endX: Math.max(0, Math.min(node.clientWidth, event.clientX - bounds.left)), endY: Math.max(0, Math.min(node.clientHeight, event.clientY - bounds.top)) };
      setRangeBox(range.current); event.stopPropagation(); return;
    }
    const start = pan.current;
    if (!start || !node) return;
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    start.moved = true; setPanActive(true);
    node.scrollLeft = start.left - event.clientX + start.x;
    node.scrollTop = start.top - event.clientY + start.y;
  }

  /** ドラッグ終了・中断時に掴み状態を解除し、余白のクリックだけ選択解除 */
  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const box = range.current, node = viewport.current;
    if (box) {
      event.preventDefault(); event.stopPropagation(); range.current = null; setRangeBox(null); setRangeActive(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (event.type === "pointerup" && node && Math.hypot(box.endX - box.x, box.endY - box.y) >= 4) {
        const documentBox = { x: (box.x + node.scrollLeft - canvasLeft) / zoom, y: (box.y + node.scrollTop - canvasTop) / zoom,
          endX: (box.endX + node.scrollLeft - canvasLeft) / zoom, endY: (box.endY + node.scrollTop - canvasTop) / zoom };
        const ids = data.tables.filter(t => intersectsRange(t, documentBox)).map(t => t.id);
        setSelectedTableIds(ids); setPrimaryId(ids[0] ?? null); setSelectedSeat(null); setSwapFrom(null); if (ids.length) setPanelOpen(true);
      }
      return;
    }
    const start = pan.current;
    if (!start) return;
    event.stopPropagation(); pan.current = null; setPanActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === "pointerup" && !start.moved && start.clearSelection) { setSelectedId(null); setSelectedSeat(null); setSwapFrom(null); }
  }

  const legacySeat = useMemo(() => {
    const selection = swapFrom ?? selectedSeat;
    return selection ? { tableIndex: data.tables.findIndex(t => t.id === selection.tableId), seatIndex: selection.seatIndex } : null;
  }, [swapFrom, selectedSeat, data.tables]);
  const matchedTables = useMemo(() => query ? data.tables.filter(t => t.alias.includes(query)).slice(0, 8) : [], [query, data.tables]);
  const matchedPeople = useMemo(() => query ? data.participants.filter(p => `${p.name} ${p.attr1} ${p.attr2}`.includes(query)).slice(0, 12) : [], [query, data.participants]);
  const filteredPeople = useMemo(() => data.participants.filter(p => (peopleOpen !== "unassigned" || p.attending !== false && !assigned.has(p.id)) && `${p.name} ${p.attr1} ${p.attr2}`.includes(peopleQuery)), [data.participants, peopleOpen, peopleQuery, assigned]);
  const editingPerson = data.participants.find(p => p.id === editingPersonId);

  const sceneActions = useRef({ selectTable, selectSeat, swapSeat, updateTable, setTables, dragTable });
  sceneActions.current = { selectTable, selectSeat, swapSeat, updateTable, setTables, dragTable };
  const sceneSelectSeat = useCallback((id: string, index: number) => sceneActions.current.selectSeat(id, index), []);
  const sceneSwapSeat = useCallback((id: string, index: number) => sceneActions.current.swapSeat(id, index), []);
  const sceneUpdateTable = useCallback((id: string, patch: Partial<Table>) => sceneActions.current.updateTable(id, patch), []);
  const sceneSetTables = useCallback((action: SetStateAction<Table[]>) => sceneActions.current.setTables(action), []);
  const sceneSelectTable = useCallback((id: string, additive = false) => sceneActions.current.selectTable(id, additive), []);
  const sceneDragTable = useCallback((id: string, phase: "start" | "move" | "end", x: number, y: number) => sceneActions.current.dragTable(id, phase, x, y), []);
  // 拡縮とスクロールでは卓・席のReact要素と参加者照合を再生成しない描画内容
  const diagram = useMemo(() => <SeatInteractionContext.Provider value={{ mode, selectedTableIds, swapFrom, selectTable: sceneSelectTable, dragTable: sceneDragTable, showNames: data.showNames, participants: data.participants, selectSeat: sceneSelectSeat, swapSeat: sceneSwapSeat }}>
    {displayTables.map(t => <TableBox key={t.id} table={t} fontSize={displayFontSize} tables={displayTables} selectedSeat={legacySeat} setSelectedSeat={ignoreSelection} setTables={sceneSetTables} setSelectedId={sceneSelectTable} updateTable={sceneUpdateTable} isSeatModalOpen={false} setFocusTableId={ignoreSelection} selectedId={selectedId} shapeRefs={shapeRefs} />)}
  </SeatInteractionContext.Provider>, [mode, selectedTableIds, swapFrom, data.showNames, data.participants, displayTables, displayFontSize, legacySeat, selectedId, sceneSelectSeat, sceneSwapSeat, sceneSetTables, sceneSelectTable, sceneUpdateTable, sceneDragTable]);

  /** 会場図のドラッグ処理が既定のフォーカス移動を止める前に入力を確定 */
  function blurOutsideField(event: ReactPointerEvent<HTMLDivElement>) {
    const active = document.activeElement;
    const target = event.target;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !(target instanceof Node)) return;
    if (active === target || active.closest("label")?.contains(target)) return;
    active.blur();
  }

  return <div className="seat-workspace" onPointerDownCapture={blurOutsideField}>
    <header className="workspace-header"><strong className="brand">席次表</strong><EditField label="席次表名" value={data.title} onCommit={value => commit(d => { d.title = value; })} />
      <FontSizeField label="サイズ" hint="タイトルの文字サイズ" max={144} value={data.titleFontSize ?? (data.fontSize ?? 24) * 1.2} onPreview={setTitleFontPreview} onCommit={titleFontSize => commit(d => { d.titleFontSize = titleFontSize; })} />
      <div className="file-actions"><button className="file-action" title="席次表を開く（Excel／JSON）" onClick={() => { setImportMode("full"); setFileMenu(false); setOtherMenu(false); fileInput.current!.accept = ".xlsx,.json"; fileInput.current?.click(); }}><MenuIcon name="open" /><span>開く</span></button>
      <div ref={fileMenuAnchor} className="menu-anchor"><button className="file-action" title="席次表を保存（Excel／JSON）" aria-expanded={fileMenu} onClick={() => { setFileMenu(!fileMenu); setOtherMenu(false); }}><MenuIcon name="save" /><span>保存</span><span aria-hidden="true">▾</span></button>{fileMenu && <div className="dropdown">
        <button onClick={() => { downloadWorkbook(data); setFileMenu(false); }}>席次表を保存（Excel）</button>
        <button onClick={() => { downloadDocument(data); setFileMenu(false); }}>席次表を保存（JSON）</button>
      </div>}</div>
      <button className="file-action" aria-label="PDF出力" title="席次表をPDF出力" onClick={() => { savePdf(); setFileMenu(false); setOtherMenu(false); }}><MenuIcon name="pdf" /><span>PDF</span></button>
      <div ref={otherMenuAnchor} className="menu-anchor file-other-menu"><button className="file-action file-action-more" aria-label="その他" title="その他（席次の読み込み・新規作成）" aria-expanded={otherMenu} onClick={() => { setOtherMenu(!otherMenu); setFileMenu(false); }}><MenuIcon name="more" /></button>{otherMenu && <div className="dropdown">
        <button onClick={() => { setImportMode("roster"); setOtherMenu(false); fileInput.current!.accept = ".xlsx"; fileInput.current?.click(); }}>席次だけ読み込む</button>
        <hr /><button className="danger" onClick={() => { setOtherMenu(false); setConfirmation({ title: "新規作成", message: "机・参加者名簿・操作履歴をすべて消去します。この操作は元に戻せません。必要なら先にExcelまたはJSONへ保存してください。", accept: () => { replace(blankDocument()); setSelectedId(null); setSelectedSeat(null); setSwapFrom(null); setCanvasOrigin(null); fitted.current = false; } }); }}>新規作成</button>
      </div>}</div></div><details ref={settingsMenuAnchor} className="menu-anchor settings-menu"><summary>設定 ▾</summary><div className="dropdown"><button onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); setSettings(true); }}>属性の見出し</button></div></details><div className="history-buttons"><button aria-label="↶ 元に戻す" title="元に戻す (Ctrl+Z)" disabled={!history.canUndo} onClick={() => { history.undo(); setSwapFrom(null); }}>↶</button><button aria-label="↷ やり直す" title="やり直す (Ctrl+Y)" disabled={!history.canRedo} onClick={() => { history.redo(); setSwapFrom(null); }}>↷</button></div>
      <div className="mode-switch"><button title="配置：卓を動かす・サイズや位置を整える" aria-pressed={mode === "layout"} onClick={() => { setMode("layout"); setSelectedSeat(null); setSwapFrom(null); }}>配置</button><button title="席次：参加者を編集する・席を入れ替える（卓はドラッグしない）" aria-pressed={mode === "seating"} onClick={() => { setMode("seating"); setSelectedId(selectedId); setRangeActive(false); }}>席次</button></div>
      <div ref={addMenuAnchor} className="menu-anchor"><button className="primary toolbar-icon" aria-label="卓追加" title="卓追加" aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}><MenuIcon name="add-table" /></button>{addMenu && <div className="dropdown">{[["circle", "円卓"], ["square", "正方形"], ["rectangle", "長机"], ["joined", "くっつけた長机"]].map(([value, name]) => <button key={value} onClick={() => addTable(value)}>{name}</button>)}</div>}</div>
      {mode === "layout" && <button className="toolbar-icon" aria-label="範囲選択" aria-pressed={rangeActive} title="範囲選択：余白からドラッグして卓を囲む (Shift+ドラッグでも選択可能)" onClick={() => setRangeActive(!rangeActive)}><MenuIcon name="range-select" /></button>}
      <button className="toolbar-icon" aria-label="参加者名簿" title="参加者名簿" onClick={() => { setPeopleQuery(""); setPeopleOpen("all"); }}><MenuIcon name="participants" /></button>
      <div className="search-anchor"><MenuIcon name="search" /><input aria-label="卓名・参加者を検索" placeholder="卓名・参加者名を検索" value={query} onChange={e => setQuery(e.target.value)} />{query && <div className="dropdown search-results">{matchedTables.map(t => <button key={t.id} onClick={() => reveal(t)}>{t.alias}</button>)}{matchedPeople.map(p => {
        const at = assigned.get(p.id);
        return <button key={p.id} onClick={() => { if (at) reveal(at.table, at.index); else { setPeopleQuery(p.name); setPeopleOpen("all"); setQuery(""); } }}>{p.name}<small>{p.attr1} {p.attr2}｜{at ? `${at.table.alias}・席${at.index + 1}` : "未着席"}{p.attending === false ? "｜不参加" : ""}</small></button>;
      })}{!matchedTables.length && !matchedPeople.length && <p>該当なし</p>}</div>}</div>
      <button className="toolbar-icon inspector-toggle" aria-label="編集欄を開閉" title={panelOpen ? "編集欄を閉じる" : "編集欄を開く"} aria-pressed={panelOpen} onClick={() => setPanelOpen(!panelOpen)}><MenuIcon name="inspector" /></button>
    </header>
    <main className="workspace-main"><div ref={canvasArea} className={`canvas-area ${spaceHeld ? "panning" : ""} ${panActive ? "pan-active" : ""} ${rangeActive || rangeBox ? "range-selecting" : ""}`} onMouseMove={e => {
      const node = viewport.current;
      if (!node || (e.target as HTMLElement).closest(".canvas-controls")) { pointer.current = null; return; }
      const rect = node.getBoundingClientRect();
      const x = (e.clientX - rect.left + node.scrollLeft - canvasLeft) / zoom;
      const y = (e.clientY - rect.top + node.scrollTop - canvasTop) / zoom;
      pointer.current = x >= 0 && x <= pageWidth && y >= 0 && y <= pageHeight ? { x, y } : null;
    }} onMouseLeave={() => { pointer.current = null; }} onPointerDownCapture={startPan} onPointerMoveCapture={movePan} onPointerUpCapture={finishPan} onPointerCancel={finishPan} onLostPointerCapture={() => { pan.current = null; setPanActive(false); range.current = null; setRangeBox(null); }}>
    <div ref={viewTools} className="canvas-controls" aria-label="会場図の表示操作">
      <div className="canvas-control-panel" role="group" aria-label="用紙・文字・氏名表示">
      <div className="view-control-group" role="group" aria-label="用紙の向き"><span>用紙</span><button aria-pressed={data.orientation === "portrait"} title="卓の位置と長机の向きを90度回転" onClick={() => changeOrientation("portrait")}>A4縦</button><button aria-pressed={data.orientation === "landscape"} title="卓の位置と長机の向きを90度回転" onClick={() => changeOrientation("landscape")}>A4横</button></div>
      <CanvasScaleField value={data.scale ?? 1} onPreview={setScalePreview} onCommit={scale => commit(d => { d.scale = scale; })} />
      <FontSizeField value={data.fontSize ?? 24} onPreview={setFontPreview} onCommit={fontSize => commit(d => { d.titleFontSize ??= (d.fontSize ?? 24) * 1.2; d.fontSize = fontSize; })} />
      <label className="check"><input type="checkbox" checked={data.showNames} onChange={e => commit(d => { d.showNames = e.target.checked; })} />氏名表示</label>
      </div>
      <div className="canvas-control-panel view-control-group" role="group" aria-label="表示倍率"><span>表示倍率</span><button onClick={() => zoomFromCenter(1 / 1.2)}>− 縮小</button><output aria-label="現在の表示倍率">{Math.round(zoom * 100)}%</output><button onClick={() => zoomFromCenter(1.2)}>＋ 拡大</button><button onClick={() => { setCanvasOrigin(null); setZoom(Math.max(0.05, Math.min((size.width - CANVAS_PADDING * 2) / pageWidth, (size.height - canvasTopPadding - CANVAS_PADDING) / pageHeight, 1))); viewport.current?.scrollTo(0, 0); }}>全体表示</button></div>
    </div>
    <div ref={viewport} style={{ paddingTop: canvasTopPadding, paddingRight: CANVAS_PADDING + (canvasOrigin?.right ?? 0), paddingBottom: CANVAS_PADDING + (canvasOrigin?.bottom ?? 0) }} className="canvas-viewport" onScroll={e => setViewScroll({ left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop })}>
      <div className="canvas-sheet" style={{ width: pageWidth * zoom, height: pageHeight * zoom, marginLeft: canvasLeft - CANVAS_PADDING, marginTop: canvasTop - canvasTopPadding }} />
    </div>
      {/* スクロール領域から独立させ、キャンバスの寸法によるサイズ再計算の循環を防止 */}
      <div className="viewport-renderer" style={{ width: size.width, height: size.height }}>
        <Stage ref={stage} width={size.width} height={size.height}>
          <Layer><Group name="document-root" x={canvasLeft - viewScroll.left} y={canvasTop - viewScroll.top} scaleX={zoom} scaleY={zoom}><Rect name="paper-background" width={pageWidth} height={pageHeight} fill="#f8fafc" stroke="#cbd5e1" onClick={() => { setSelectedId(null); setSelectedSeat(null); setSwapFrom(null); }} />
            <Text x={18} y={16} text={data.title} fontSize={displayTitleFontSize} fill="#0f172a" listening={false} />
            {diagram}
            <Transformer ref={transformer} rotateEnabled={false} boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 40 * zoom || Math.abs(newBox.height) < 30 * zoom ? oldBox : newBox} />
          </Group></Layer>
        </Stage>
      </div>
      {rangeBox && <div className="selection-rubber" style={{ left: Math.min(rangeBox.x, rangeBox.endX), top: Math.min(rangeBox.y, rangeBox.endY), width: Math.abs(rangeBox.endX - rangeBox.x), height: Math.abs(rangeBox.endY - rangeBox.y) }} />}
    </div>
    {panelOpen && <aside className={`inspector${table && (mode === "seating" || selectedSeat) ? " inspector-seating" : ""}`}><header><h2>{selectedTables.length > 1 ? `選択中：${selectedTables.length}卓` : table?.alias ?? "編集"}</h2><button aria-label="編集欄を閉じる" onClick={() => setPanelOpen(false)}>×</button></header>
      <div className="inspector-content">
      {mode === "layout" && selectedTables.length > 1 ? <>
        <section className="batch-size-editor" aria-label="配置を整える">
          <div className="inspector-action-row"><h3>配置</h3><button type="button" className="primary" onClick={arrangeSelectedTables}>綺麗に配置</button></div>
          <small>列：{detectTableColumns(selectedTables).map(column => column.length).join("・")}卓</small>
        </section>
        <section className="alignment-editor" aria-label="位置を揃える">
          <h3>整列</h3><p className="muted inspector-reference" title={`基準：${selectedTables[0].alias}（最初に選んだ卓）`}>基準：{selectedTables[0].alias}</p>
          <div className="inspector-action-row"><span>横</span><div className="alignment-buttons">{([["left", "左揃え"], ["center", "左右中央"], ["right", "右揃え"]] as const).map(([value, label]) => <button key={value} title={label} aria-label={label} onClick={() => alignSelectedTables(value)}>{label.includes("中央") ? "中央" : label.replace("揃え", "")}</button>)}</div></div>
          <div className="inspector-action-row"><span>縦</span><div className="alignment-buttons">{([["top", "上揃え"], ["middle", "上下中央"], ["bottom", "下揃え"]] as const).map(([value, label]) => <button key={value} title={label} aria-label={label} onClick={() => alignSelectedTables(value)}>{label.includes("中央") ? "中央" : label.replace("揃え", "")}</button>)}</div></div>
        </section>
        {selectedTables.length >= 3 && <section className="distribution-editor" aria-label="等間隔に配置">
          <div className="inspector-action-row"><h3 title="両端の卓を固定し、卓本体の間隔を揃える">等間隔</h3><div className="distribution-buttons"><button onClick={() => distributeSelectedTables("x")}>横方向</button><button onClick={() => distributeSelectedTables("y")}>縦方向</button></div></div>
        </section>}
        <BatchSizeEditor key={selectedTables.map(t => `${t.id}:${t.width}:${t.height}:${t.radius}`).join("|")} tables={selectedTables} apply={applyBatchSize} applyMaximum={applyMaximumSize} preview={previewBatchSize} />
        <details className="selected-table-list"><summary>選択した卓の一覧</summary><div>{selectedTables.map(t => <div key={t.id}>{t.alias}</div>)}</div></details>
      </> : !table ? <p className="muted">会場図のテーブル{mode === "seating" ? "または席" : ""}を選んでください。</p> : <>
        <p className="muted">{displayTable?.seats ?? table.seats}席・{(displayTable ?? table).seatsDetail.filter(s => s.id && data.participants.find(p => p.id === s.id)?.attending !== false).length}名</p>
        {mode === "layout" && !selectedSeat ? <>
          <EditField key={`alias-${table.id}`} label="卓名" value={table.alias} onCommit={alias => updateTable(table.id, { alias })} />
          <label className="field">形状<select value={table.design === "joined" ? "joined" : table.shape} onChange={e => changeShape(e.target.value)}><option value="circle">円卓</option><option value="square">正方形</option><option value="rectangle">長机</option><option value="joined">くっつけた長机</option></select></label>
          {table.shape === "rectangle" && <label className="field">向き<select value={table.orientation ?? "landscape"} onChange={e => { if (e.target.value !== table.orientation) updateTable(table.id, { orientation: e.target.value as Table["orientation"], width: table.height, height: table.width }); }}><option value="landscape">横</option><option value="portrait">縦</option></select></label>}
          <EditField key={`seats-${table.id}`} label="席数" type="number" min={0} max={100} step={1} integer value={table.seats} onPreview={value => previewTableNumber("seats", value)} onCommit={changeSeats} /><small>予定席数：{displayTable?.plannedSeats ?? table.plannedSeats ?? table.seats}</small>
          {table.shape === "rectangle" && table.design === "joined" && <section className="seat-editor">
            <h3>左右・上下の席数</h3>
            <p className="muted">参加者の並び順を保ち、席の配分を変更します。</p>
            <EditField label={table.orientation === "portrait" ? "上の机の席数" : "左の机の席数"} type="number" min={0} max={table.seats} step={1} integer value={joinedLayout(table).firstSeats} onCommit={value => updateTable(table.id, { joinedLayout: { ...joinedLayout(table), firstSeats: Number(value) } })} />
            <p>{table.orientation === "portrait" ? "下" : "右"}の机：{table.seats - joinedLayout(table).firstSeats}席（合計{table.seats}席）</p>
            <div className="table-actions" style={{ gridTemplateColumns: "1fr" }}>
              <button onClick={() => { const layout = joinedLayout(table); updateTable(table.id, { joinedLayout: { firstSeats: table.seats - layout.firstSeats, firstReversed: layout.secondReversed, secondReversed: layout.firstReversed } }); }}>{table.orientation === "portrait" ? "上" : "左"}{table.seats - joinedLayout(table).firstSeats}席・{table.orientation === "portrait" ? "下" : "右"}{joinedLayout(table).firstSeats}席にする</button>
              {(["firstReversed", "secondReversed"] as const).map((key, index) => {
                const layout = joinedLayout(table);
                const count = index === 0 ? layout.firstSeats : table.seats - layout.firstSeats;
                if (count % 2 === 0) return null;
                const vertical = table.orientation === "portrait";
                const position = vertical ? index === 0 ? "上" : "下" : index === 0 ? "左" : "右";
                const nextFirst = layout[key] ? Math.ceil(count / 2) : Math.floor(count / 2);
                return <button key={key} onClick={() => updateTable(table.id, { joinedLayout: { ...layout, [key]: !layout[key] } })}>{position}の机：{vertical ? "左" : "上"}{nextFirst}席・{vertical ? "右" : "下"}{count - nextFirst}席にする</button>;
              })}
            </div>
          </section>}
          {table.shape === "circle" ? <EditField label="半径" min={1} step={1} value={table.radius ?? 117} type="number" onPreview={value => previewTableNumber("radius", value)} onCommit={v => updateTable(table.id, { radius: Number(v) })} /> : <div className="field-grid"><EditField label="幅" min={1} step={1} value={table.width ?? 270} type="number" onPreview={value => previewTableNumber("width", value)} onCommit={v => updateTable(table.id, { width: Number(v) })} /><EditField label="高さ" min={1} step={1} value={table.height ?? 140} type="number" onPreview={value => previewTableNumber("height", value)} onCommit={v => updateTable(table.id, { height: Number(v) })} /></div>}
          <details><summary>座標</summary><EditField label="X座標" step={1} value={table.x} type="number" onPreview={value => previewTableNumber("x", value)} onCommit={v => updateTable(table.id, { x: Number(v) })} /><EditField label="Y座標" step={1} value={table.y} type="number" onPreview={value => previewTableNumber("y", value)} onCommit={v => updateTable(table.id, { y: Number(v) })} /></details>
          <div className="table-actions"><button onClick={() => { clipboard.current = structuredClone(table); setNotice("コピーしました。Ctrl+Vで貼り付けます"); }}>卓をコピー</button><button onClick={pasteTable}>貼り付け</button><button className="danger" onClick={deleteTable}>卓を削除</button></div>
        </> : <>
          {selectedSeat && seat && <section className="seat-editor"><h3>選択中：席{selectedSeat.seatIndex + 1}</h3>{person ? <>
            <EditField key={`name-${person.id}`} label="氏名" value={person.name} onCommit={name => { if (name.trim()) updatePerson(person.id, { name: name.trim() }); else setNotice("氏名を入力してください。空席化は専用ボタンを使ってください"); }} />
            <EditField key={`attr1-${person.id}`} label={data.attributeLabels[0]} value={person.attr1} onCommit={attr1 => updatePerson(person.id, { attr1 })} /><EditField key={`attr2-${person.id}`} label={data.attributeLabels[1]} value={person.attr2} onCommit={attr2 => updatePerson(person.id, { attr2 })} />
            <label className="check"><input type="checkbox" checked={person.attending !== false} onChange={e => updatePerson(person.id, { attending: e.target.checked })} />参加</label>
          </> : <p>空席</p>}
            <div className="seat-actions"><button className="primary" onClick={() => { setPeopleQuery(""); setPeopleOpen("pick"); }}>参加者変更</button><button onClick={() => setSwapFrom(selectedSeat)}>入れ替え</button><button onClick={() => commit(d => { const target = d.tables.find(t => t.id === selectedSeat.tableId)!; target.seatsDetail[selectedSeat.seatIndex] = emptySeat(selectedSeat.seatIndex); })}>空席にする</button></div>
          </section>}
          <h3>席次一覧</h3><div ref={seatList} className="seat-list"><table><thead><tr><th>席</th><th>氏名</th><th>{data.attributeLabels[0]}</th></tr></thead><tbody>{table.seatsDetail.map((s, index) => {
            const p = data.participants.find(p => p.id === s.id);
            return <tr key={index} className={(swapFrom ?? selectedSeat)?.seatIndex === index ? "selected" : ""}><td><button onClick={() => swapSeat(table.id, index)}>{index + 1}</button></td><td><button onClick={() => selectSeat(table.id, index)}>{p?.name ?? "空席"}{p?.attending === false && <small>不参加</small>}</button></td><td>{p?.attr1}</td></tr>;
          })}</tbody></table></div>
        </>}
      </>}
      {mode === "layout" && !selectedSeat && selectedTables.length > 0 && <button onClick={fitSelectedTables}>名札に合わせてサイズ調整</button>}
      </div>
      <button className="unassigned" onClick={() => { setPeopleQuery(""); setPeopleOpen("unassigned"); }}>未着席の参加者 {attending.length - seatedCount}名</button>
    </aside>}
    </main>
    <footer className="workspace-status"><div><strong>{data.tables.length}卓</strong><span>着席{seatedCount}／{attending.length}名</span><span>空席{totalSeats - seatedCount}</span><button onClick={() => { setPeopleQuery(""); setPeopleOpen("unassigned"); }}>未着席{attending.length - seatedCount}名</button><span>不参加{data.participants.length - attending.length}名</span></div>
      <small className="operation-hint">{swapFrom ? <><strong>入れ替え先の席番号をクリック</strong><button onClick={() => setSwapFrom(null)}>キャンセル</button></> : mode === "layout" ? "Ctrl+卓で複数選択・Shift+余白ドラッグで範囲選択。矢印で1px移動・Shift+矢印で10px移動" : "席番号2つで入れ替え・氏名で編集。余白はドラッグで画面移動"}｜{history.saveStatus}</small>
      <small className="workspace-credit">© 2025–2026 Hamster</small>
    </footer>
    {notice && <div className="workspace-notice" role="status">{notice}<button aria-label="通知を閉じる" onClick={() => setNotice("")}>×</button></div>}
    <input ref={fileInput} hidden type="file" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void loadFile(file); }} />
    {confirmation && <Dialog title={confirmation.title} close={() => setConfirmation(null)}><p>{confirmation.message}</p><div className="dialog-actions"><button data-cancel onClick={() => setConfirmation(null)}>キャンセル</button><button className="primary" onClick={() => { confirmation.accept(); setConfirmation(null); }}>実行する</button></div></Dialog>}
    {preview && <Dialog title={importMode === "full" ? "席次表を読み込む" : "席次だけ読み込む"} close={() => setPreview(null)}><p>{importMode === "full" ? "現在の机・名簿を置き換え、操作履歴をリセットします。" : "配置を保ち、参加者名簿と席次を置き換えます。元に戻すで復旧できます。"}</p><ul>{preview.summary.map((line, index) => <li key={index}>{line}</li>)}</ul><LayoutPreview data={preview.data} /><div className="import-plan">{preview.data.tables.map(t => <div key={t.id}><strong>{t.alias}</strong><small>{t.seats}席</small><span>{t.seatsDetail.map(s => s.name || "空席").join(" ／ ")}</span></div>)}</div><div className="dialog-actions"><button data-cancel onClick={() => setPreview(null)}>キャンセル</button><button className="primary" onClick={() => { if (importMode === "full") replace(preview.data); else commit(d => Object.assign(d, preview.data)); setPreview(null); setSelectedId(null); setSelectedSeat(null); setSwapFrom(null); if (importMode === "full") { setCanvasOrigin(null); fitted.current = false; } }}>この内容で反映</button></div></Dialog>}
    {settings && <Dialog title="属性設定" close={() => setSettings(false)}><EditField label="属性1の見出し" value={data.attributeLabels[0]} onCommit={v => commit(d => { d.attributeLabels[0] = v.trim() || "属性1"; })} /><EditField label="属性2の見出し" value={data.attributeLabels[1]} onCommit={v => commit(d => { d.attributeLabels[1] = v.trim() || "属性2"; })} /><button data-cancel onClick={() => setSettings(false)}>閉じる</button></Dialog>}
    {peopleOpen && !confirmation && <Dialog title={peopleOpen === "pick" ? "参加者を選ぶ" : peopleOpen === "unassigned" ? "未着席の参加者" : "参加者名簿"} close={() => setPeopleOpen(null)}><input aria-label="参加者を検索" placeholder="氏名・属性で検索" value={peopleQuery} onChange={e => setPeopleQuery(e.target.value)} /><div className="people-list">{filteredPeople.map(p => {
      const at = assigned.get(p.id);
      return <div key={p.id}><button disabled={peopleOpen !== "pick" && !at} onClick={() => { if (peopleOpen === "pick") assignPerson(p); else if (at) { reveal(at.table, at.index); setPeopleOpen(null); } }}>{p.name}<small>{p.attr1} {p.attr2}｜{at ? `${at.table.alias}・席${at.index + 1}` : "未着席"}{p.attending === false ? "｜不参加" : ""}</small></button><button aria-label={`${p.name}の名簿情報を編集`} onClick={() => setEditingPersonId(p.id)}>編集</button><label className="check"><input type="checkbox" checked={p.attending !== false} onChange={e => updatePerson(p.id, { attending: e.target.checked })} />参加</label></div>;
    })}{!filteredPeople.length && <p>該当する参加者はいません</p>}</div>{editingPerson && <section><h3>名簿情報を編集</h3><EditField key={`person-name-${editingPerson.id}`} label="氏名" value={editingPerson.name} onCommit={name => { if (name.trim()) updatePerson(editingPerson.id, { name: name.trim() }); else setNotice("氏名を入力してください"); }} /><EditField key={`person-attr1-${editingPerson.id}`} label={data.attributeLabels[0]} value={editingPerson.attr1} onCommit={attr1 => updatePerson(editingPerson.id, { attr1 })} /><EditField key={`person-attr2-${editingPerson.id}`} label={data.attributeLabels[1]} value={editingPerson.attr2} onCommit={attr2 => updatePerson(editingPerson.id, { attr2 })} /><button onClick={() => setEditingPersonId(null)}>編集を閉じる</button></section>}{peopleOpen === "all" && <form className="new-person" onSubmit={e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const name = String(form.get("name") ?? "").trim(); if (!name) return;
      const attr1 = String(form.get("attr1") ?? ""), attr2 = String(form.get("attr2") ?? "");
      commit(d => { d.participants.push({ id: crypto.randomUUID(), name, attr1, attr2, attending: true }); }); e.currentTarget.reset();
    }}><h3>参加者を追加</h3><input name="name" aria-label="追加する氏名" placeholder="氏名" required /><input name="attr1" placeholder={data.attributeLabels[0]} /><input name="attr2" placeholder={data.attributeLabels[1]} /><button type="submit">追加</button></form>}<button data-cancel onClick={() => setPeopleOpen(null)}>閉じる</button></Dialog>}
  </div>;
}
