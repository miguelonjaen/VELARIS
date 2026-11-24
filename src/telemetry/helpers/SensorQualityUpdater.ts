import {
    SensorId,
    markSensorUpdated,
    SensorQualityMap,
    SensorSource
} from "@/lib/sensorQuality";

import React from "react";

export function updateRealSensors(
    ids: SensorId[],
    setSensorQuality: React.Dispatch<React.SetStateAction<SensorQualityMap>>,
    setDataSource: React.Dispatch<
        React.SetStateAction<Record<string, SensorSource>>
    >,
    receivedAt: number = Date.now()
): void {

    setSensorQuality(prev =>
        markSensorUpdated(prev, ids, "real", receivedAt)
    );

    setDataSource(prev => {
        if (ids.every(id => prev[id] === "real")) {
            return prev;
        }

        const next = { ...prev };

        for (const id of ids) {
            next[id] = "real";
        }

        return next;
    });

}