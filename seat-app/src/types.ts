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

export type Participant = {
  id: string;
  name: string;
  attr1: string;
  attr2: string;
  attending?: boolean; // 未指定は参加ON
};
