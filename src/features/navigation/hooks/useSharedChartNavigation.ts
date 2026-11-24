import { useEffect, useMemo, useRef, useState } from "react";
import { app } from "@/application";
import {
    selectChartNavigation,
    sharedChartFieldsKey,
    type ChartNavigation,
    type ChartPoint,
    type SharedChartFields
} from "@/features/navigation/utils/chartNavigation";
import { SHARED_NAVIGATION_REFRESH_MS } from "@/features/navigation/utils/sharedNavigationPresentation";

const readSharedFields = (): SharedChartFields => {
    const now = Date.now();
    return {
        position: app.navigationState.resolve("position", now),
        headingTrue: app.navigationState.resolve("headingTrue", now)
    };
};

/**
 * Posición y rumbo que dibuja la carta (solo visualización). Se reevalúa con la
 * misma cadencia que la banda porque un dato puede caducar sin que llegue ningún
 * mensaje; solo provoca render cuando cambia algo visible.
 */
export function useSharedChartNavigation(
    fallbackPosition: ChartPoint | null,
    fallbackHeading: number,
    refreshMs: number = SHARED_NAVIGATION_REFRESH_MS
): ChartNavigation {
    const [shared, setShared] = useState<SharedChartFields>(readSharedFields);
    const keyRef = useRef(sharedChartFieldsKey(shared));

    useEffect(() => {
        const refresh = () => {
            const next = readSharedFields();
            const key = sharedChartFieldsKey(next);
            if (key === keyRef.current) return;
            keyRef.current = key;
            setShared(next);
        };
        refresh();
        const interval = window.setInterval(refresh, refreshMs);
        return () => window.clearInterval(interval);
    }, [refreshMs]);

    const fallbackLat = fallbackPosition?.lat;
    const fallbackLng = fallbackPosition?.lng;
    return useMemo(
        () => selectChartNavigation(shared, {
            position: fallbackLat !== undefined && fallbackLng !== undefined ? { lat: fallbackLat, lng: fallbackLng } : null,
            heading: fallbackHeading
        }),
        [shared, fallbackLat, fallbackLng, fallbackHeading]
    );
}
