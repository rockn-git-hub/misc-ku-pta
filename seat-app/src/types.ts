// src/types.ts

export interface SeatDetail {
  seatNumber: number;
  id: string;
  attr1: string;
  attr2: string;
  name: string;
}

export interface Table {
  id: string;
  number: number;
  alias: string;
  shape: "circle" | "rectangle" | "square";
  design?: "joined"; // 長机をくっつけた外観
  joinedLayout?: { firstSeats: number; firstReversed: boolean; secondReversed: boolean }; // 連結した2台の席数と配置方向
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  scaleX?: number;
  scaleY?: number;
  seats: number;
  plannedSeats?: number; // 基本の席数
  seatsDetail: SeatDetail[];
  orientation?: "landscape" | "portrait";
}

export type Category = { name: string; color: string };

export type Participant = {
  id: string;
  name: string;
  attr1: string;
  attr2: string;
  category?: string | null; // 未指定・null・noneはカテゴリなし
  pta?: boolean; // 旧ファイルの読み込み用。名札の色には使用しない
  attending?: boolean; // 未指定は参加ON
};
