import { createContext } from "react";
import type { Participant } from "../types";

export type SeatInteraction = {
  mode: "layout" | "seating";
  selectedTableIds: string[];
  swapFrom: { tableId: string; seatIndex: number } | null;
  selectTable: (tableId: string, additive?: boolean) => void;
  dragTable: (tableId: string, phase: "start" | "move" | "end", x: number, y: number) => void;
  showNames: boolean;
  participants: Participant[];
  selectSeat: (tableId: string, seatIndex: number) => void;
  swapSeat: (tableId: string, seatIndex: number) => void;
};
export const SeatInteractionContext = createContext<SeatInteraction | null>(null);
