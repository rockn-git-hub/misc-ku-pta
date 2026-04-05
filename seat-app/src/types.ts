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
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  scaleX?: number;
  scaleY?: number;
  seats: number;
  seatsDetail: SeatDetail[];
  orientation?: "landscape" | "portrait";
}

export type Participant = {
  id: string;
  name: string;
  attr1: string;
  attr2: string;
};
