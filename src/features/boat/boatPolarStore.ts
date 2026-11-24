import { useEffect, useState } from 'react';
import { parseBoatPolar, type BoatPolar } from '../../core/navigation/BoatPolar';
export interface BoatPolarConfiguration { readonly name: string; readonly text: string; readonly savedAt: number; readonly polar: BoatPolar }
const EVENT = 'gaulos:boat-polar-changed';
const key = (shipId: string) => `VELARIS_boat_polar:${shipId}`;
export function loadBoatPolar(shipId: string | null): BoatPolarConfiguration | null {
    if (!shipId) return null;
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(key(shipId)) ?? 'null');
        if (!raw || typeof raw !== 'object' || !('text' in raw) || typeof raw.text !== 'string'
            || !('name' in raw) || typeof raw.name !== 'string' || !('savedAt' in raw) || typeof raw.savedAt !== 'number') return null;
        return { name: raw.name, text: raw.text, savedAt: raw.savedAt, polar: parseBoatPolar(raw.text) };
    } catch { return null; }
}
export function saveBoatPolar(shipId: string, name: string, text: string): void {
    parseBoatPolar(text);
    localStorage.setItem(key(shipId), JSON.stringify({ version: 1, name: name.trim().slice(0, 120), text, savedAt: Date.now() }));
    window.dispatchEvent(new Event(EVENT));
}
export function removeBoatPolar(shipId: string): void {
    localStorage.removeItem(key(shipId)); window.dispatchEvent(new Event(EVENT));
}
export function useBoatPolar(shipId: string | null): BoatPolarConfiguration | null {
    const [state, setState] = useState(() => ({ shipId, value: loadBoatPolar(shipId) }));
    useEffect(() => {
        const refresh = () => setState({ shipId, value: loadBoatPolar(shipId) });
        refresh(); window.addEventListener(EVENT, refresh); window.addEventListener('storage', refresh);
        return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh); };
    }, [shipId]);
    return state.shipId === shipId ? state.value : null;
}
