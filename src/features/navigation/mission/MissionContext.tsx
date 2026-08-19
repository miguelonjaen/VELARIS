import { createContext, useContext } from "react";
import { MissionState } from "./MissionTypes";

export interface MissionContextValue {
  mission: MissionState;

  setMission: React.Dispatch<React.SetStateAction<MissionState>>;
}

export const MissionContext =
  createContext<MissionContextValue | null>(null);

export function useMission() {
  const ctx = useContext(MissionContext);

  if (!ctx) {
    throw new Error(
      "useMission debe usarse dentro de MissionProvider"
    );
  }

  return ctx;
}