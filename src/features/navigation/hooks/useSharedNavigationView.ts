import { useEffect, useRef, useState } from "react";
import { app } from "@/application";
import {
    presentSharedNavigation,
    sharedNavigationViewKey,
    SHARED_NAVIGATION_REFRESH_MS,
    type SharedNavigationView
} from "@/features/navigation/utils/sharedNavigationPresentation";

/**
 * Vista del estado de navegación compartido para la interfaz.
 *
 * Se reevalúa periódicamente porque un dato puede caducar (barco → Droid →
 * UNKNOWN) sin que llegue ningún mensaje nuevo. Solo provoca un render cuando
 * cambia algo visible; un único temporizador por componente que lo usa.
 */
export function useSharedNavigationView(refreshMs: number = SHARED_NAVIGATION_REFRESH_MS): SharedNavigationView {
    const [view, setView] = useState<SharedNavigationView>(() => presentSharedNavigation(app.navigationState.snapshot()));
    const keyRef = useRef(sharedNavigationViewKey(view));

    useEffect(() => {
        const refresh = () => {
            const next = presentSharedNavigation(app.navigationState.snapshot());
            const key = sharedNavigationViewKey(next);
            if (key === keyRef.current) return;
            keyRef.current = key;
            setView(next);
        };
        refresh();
        const interval = window.setInterval(refresh, refreshMs);
        return () => window.clearInterval(interval);
    }, [refreshMs]);

    return view;
}
