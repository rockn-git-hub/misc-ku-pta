// src/lib/io.ts
import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import Konva from "konva"; // ← これを追加！
import type { SaveSchemaV1 } from "./persist";
import type { Table, Participant, SeatDetail } from "../types";

/* ---------------------------
   JSON I/O
--------------------------- */
const MAX_SEATS = 100;

// 100席ぶんの空データを生成（読み込み時の補完用）
function createEmptySeats(fromIndex: number): SeatDetail[] {
  return Array.from({ length: MAX_SEATS - fromIndex }, (_, i) => ({
    seatNumber: fromIndex + i + 1,
    id: "",
    attr1: "",
    attr2: "",
    name: "",
  }));
}

// ------------------------------------------------------------
// ✅ JSON エクスポート（座席数分だけ保存）
// ------------------------------------------------------------
export const exportJson = (data: SaveSchemaV1, title?: string) => {
  const safeTitle = (title?.trim() || "席次表").replace(/[\\\/\?\*\[\]\:]/g, "");

  const normalized = {
    version: data.version,
    updatedAt: data.updatedAt,
    orientation: data.orientation,
    scale: data.scale ?? 1.8,
    fontSize: data.fontSize ?? 16,
    title: data.title ?? safeTitle,
    tables: data.tables.map((t: Table) => ({
      ...t,
      // ✅ 保存時は表示席数分だけ出力
      seatsDetail: t.seatsDetail.slice(0, t.seats).map((s) => ({
        seatNumber: s.seatNumber,
        id: s.id ?? "",
        attr1: s.attr1 ?? "",
        attr2: s.attr2 ?? "",
        name: s.name ?? "",
      })),
    })),
    participants: data.participants ?? [],
  };

  const blob = new Blob([JSON.stringify(normalized, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.json`; // ✅ ファイル名をタイトルに変更
  a.click();
  URL.revokeObjectURL(url);
};

// ------------------------------------------------------------
// ✅ JSON インポート（読み込み後に100席へ補完）
// ------------------------------------------------------------
export const importJson = (
  file: File,
  onSuccess: (data: SaveSchemaV1) => void,
  onError: (msg: string) => void
) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target?.result as string);
      if (
        obj &&
        obj.version === 1 &&
        (obj.orientation === "portrait" || obj.orientation === "landscape") &&
        Array.isArray(obj.tables)
      ) {
        const normalized: SaveSchemaV1 = {
          version: 1,
          updatedAt: obj.updatedAt ?? new Date().toISOString(),
          orientation: obj.orientation,
          scale: obj.scale ?? 1.8,
          fontSize: obj.fontSize ?? 16,
          title: obj.title ?? "席次表",
          tables: obj.tables.map((t: Table) => {
            const seatsDetail: SeatDetail[] = (t.seatsDetail ?? []).map((s: any) => ({
              seatNumber: s.seatNumber,
              id: s.id ?? "",
              attr1: s.attr1 ?? "",
              attr2: s.attr2 ?? "",
              name: s.name ?? "",
            }));

            // ✅ 足りない分を補完して100件にする
            if (seatsDetail.length < MAX_SEATS) {
              const extra = createEmptySeats(seatsDetail.length);
              seatsDetail.push(...extra);
            }

            return { ...t, seatsDetail };
          }),
          participants: obj.participants ?? [],
        };
        onSuccess(normalized);
      } else {
        onError("不正なフォーマットの JSON です。");
      }
    } catch {
      onError("JSON の読み込みに失敗しました。");
    }
  };
  reader.readAsText(file);
};

/* ---------------------------
   Excel I/O
--------------------------- */

export const importParticipantsXlsx = (
  file: File,
  useHeader: boolean,
  columnMap: { name: number; attr1: number; attr2: number },
  onSuccess: (data: Participant[]) => void,
  onError: (msg: string) => void
) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      const dataStartIndex = useHeader ? 1 : 0;
      const result: Participant[] = rows
        .slice(dataStartIndex)
        .map((row, idx) => ({
          id: String(idx + 1),
          name: row[columnMap.name] ?? "",
          attr1: row[columnMap.attr1] ?? "",
          attr2: row[columnMap.attr2] ?? "",
        }))
        .filter((p) => p.name);
      onSuccess(result);
    } catch {
      onError("Excel の読み込みに失敗しました。");
    }
  };
  reader.readAsArrayBuffer(file);
};

export const exportXlsx = (tables: Table[], participants: Participant[], title?: string) => {
  const rows: any[] = [];

  tables.forEach((table: Table) => {
    // ✅ 実際の座席数だけ出力
    const validSeats = table.seatsDetail.slice(0, table.seats);

    validSeats.forEach((seat, index: number) => {
      const person = participants.find((p: Participant) => p.id === seat.id);
      rows.push({
        テーブル名: table.alias || `テーブル${table.number}`,
        座席番号: seat.seatNumber ?? index + 1,
        名前: seat.name || person?.name || "",
        属性1: seat.attr1 || person?.attr1 || "",
        属性2: seat.attr2 || person?.attr2 || "",
      });
    });
  });

  // === A1から出力 ===
  const ws = XLSX.utils.json_to_sheet(rows, { origin: "A1" });

  // === ヘッダ書式設定 ===
  const headerCells = ["A1", "B1", "C1", "D1", "E1"];
  headerCells.forEach((cell) => {
    if (ws[cell]) {
      ws[cell].s = {
        fill: { fgColor: { rgb: "DCE6F1" } }, // 淡い水色
        font: { name: "ＭＳ ゴシック", bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };
    }
  });

  // === データ部分の罫線・フォント ===
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;
      if (!ws[cellRef].s) ws[cellRef].s = {};
      ws[cellRef].s.border = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      };
      ws[cellRef].s.alignment = { horizontal: "center", vertical: "center" };
      ws[cellRef].s.font = { name: "ＭＳ ゴシック", sz: 11 };
    }
  }

  // === 列幅設定 ===
  // === 列幅をデータから自動算出 ===
  const colWidths = ["テーブル名", "座席番号", "名前", "属性1", "属性2"].map((key) => {
    // 各列の最大文字長を求める
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => (r[key] ? r[key].toString().length : 0))
    );
    // 全角文字も考慮して1.2倍くらい余裕を持たせる
    return { wch: Math.ceil(maxLen * 3.0) };
  });
  ws["!cols"] = colWidths;

  // === シート名処理 ===
  let safeTitle = title?.trim() || "席次表";
  // Excelで使えない文字を除去
  safeTitle = safeTitle.replace(/[\\\/\?\*\[\]\:]/g, "");

  // === ワークブック作成 ===
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeTitle);

  // === ファイル出力 ===
  const filename = `${safeTitle}.xlsx`;
  XLSX.writeFile(wb, filename);
};

export function exportPdf(stage: any, orientation: "portrait" | "landscape", title?: string) {
  const safeTitle = (title?.trim() || "席次表").replace(/[\\\/\?\*\[\]\:]/g, "");

  const layer = stage.findOne("Layer");
  const background = new Konva.Rect({
    x: 0,
    y: 0,
    width: stage.width(),
    height: stage.height(),
    fill: "white",
  });
  layer.add(background);
  background.moveToBottom();
  layer.draw();

  const dataUrl = stage.toDataURL({ pixelRatio: 1 });
  const pdf = new jsPDF({
    orientation: orientation === "portrait" ? "p" : "l",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (pageWidth - w) / 2;
    const y = (pageHeight - h) / 2;

    pdf.addImage(dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
    pdf.save(`${safeTitle}.pdf`); // ✅ タイトルベースのファイル名
  };

  background.destroy();
  layer.draw();
}
