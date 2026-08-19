import { createContext, useContext } from "react";
import { MissionState } from "./types";

export const MissionContext =
    createContext<MissionState | null>(null);

export function useMission() {

    const ctx = useContext(MissionContext);

    if (!ctx)
        throw new Error(
            "MissionContext no disponible."
        );

    return ctx;
}