import React, { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Crosshair } from "lucide-react";
import {
    FOLLOW_PAN_DURATION_S,
    INITIAL_FOLLOW_STATE,
    followReducer,
    followStatus,
    isValidFollowPosition,
    shouldRecenter,
    type FollowPoint
} from "@/features/navigation/utils/followBoat";

type CenterZoomOption = boolean | "center";

const PAN_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * Botón «Seguir barco» de la carta. Es un control de Leaflet en la misma esquina que el zoom
 * (se apila debajo) y usa la misma instancia del mapa. [position] solo debe ser la posición
 * válida y actual del barco (null si no la hay).
 */
const FollowBoatControl: React.FC<{ position: FollowPoint | null; focusRequest?: number }> = ({ position, focusRequest = 0 }) => {
    const map = useMap();
    const [state, dispatch] = useReducer(followReducer, INITIAL_FOLLOW_STATE);
    useEffect(() => { if (focusRequest > 0) dispatch('userPan'); }, [focusRequest]);
    const [container] = useState(() => {
        const element = L.DomUtil.create("div", "leaflet-bar");
        // Los clics y la rueda sobre el botón no llegan a la carta (no añaden waypoints ni hacen zoom).
        L.DomEvent.disableClickPropagation(element);
        L.DomEvent.disableScrollPropagation(element);
        return element;
    });

    useEffect(() => {
        const control = new L.Control({ position: "topright" });
        control.onAdd = () => container;
        control.addTo(map);
        return () => {
            control.remove();
        };
    }, [map, container]);

    // Desplazar la carta a mano (arrastrar o flechas del teclado) suspende el seguimiento; los
    // desplazamientos propios (panTo) no generan estos eventos.
    useMapEvents({
        dragstart: () => dispatch("userPan"),
        keydown: (event) => {
            if (PAN_KEYS.has(event.originalEvent.key)) dispatch("userPan");
        }
    });

    // Mientras se sigue, el zoom (rueda, doble clic, pellizco) mantiene el centro: el barco no se sale.
    const previousZoomOptions = useRef<Record<string, CenterZoomOption> | null>(null);
    useEffect(() => {
        if (!state.following) return;
        const options = map.options as unknown as Record<string, CenterZoomOption>;
        const keys = ["scrollWheelZoom", "doubleClickZoom", "touchZoom"];
        previousZoomOptions.current = Object.fromEntries(keys.map((key) => [key, options[key]]));
        for (const key of keys) if (options[key]) options[key] = "center";
        return () => {
            const previous = previousZoomOptions.current;
            if (previous) for (const key of keys) options[key] = previous[key];
            previousZoomOptions.current = null;
        };
    }, [map, state.following]);

    const lat = isValidFollowPosition(position) ? position.lat : null;
    const lng = isValidFollowPosition(position) ? position.lng : null;

    // Recentrar solo al activar o cuando el barco se separa del centro: sin bucles ni movimientos constantes.
    useEffect(() => {
        if (lat === null || lng === null) return;
        const target = L.latLng(lat, lng);
        const offset = map.latLngToContainerPoint(target).distanceTo(map.latLngToContainerPoint(map.getCenter()));
        if (!shouldRecenter(state.following, { lat, lng }, offset)) return;
        map.panTo(target, { animate: true, duration: FOLLOW_PAN_DURATION_S, easeLinearity: 0.5 });
    }, [map, state.following, lat, lng]);

    const status = followStatus(state, lat !== null);

    return createPortal(
        <button
            type="button"
            onClick={() => dispatch("toggle")}
            title={status.title}
            aria-label="Seguir barco"
            aria-pressed={status.active}
            className={
                "flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.12em] transition-colors " +
                (status.active
                    ? "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                    : "bg-[rgba(7,12,22,0.92)] text-slate-300 hover:bg-[rgba(8,47,73,0.95)] hover:text-cyan-300")
            }
            style={{ minWidth: 34 }}
        >
            <Crosshair size={16} />
            <span>Seguir barco</span>
            {status.note && <span className="text-[8px] normal-case tracking-normal text-amber-400">{status.note}</span>}
        </button>,
        container
    );
};

export default FollowBoatControl;
