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
    >
): void {

    setSensorQuality(prev =>
        markSensorUpdated(prev, ids, "real")
    );

    setDataSource(prev =>
        ids.reduce(
            (next, id) => ({
                ...next,
                [id]: "real" as const
            }),
            prev
        )
    );

}