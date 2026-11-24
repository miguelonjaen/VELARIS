import { useEffect, useState } from 'react';
import { app } from '../application';
import { resolveWind, type WindObservation } from '../core/instruments/resolveWind';
import type { WeatherData } from './useWeather';

export function useInstrumentWind(weather: WeatherData | null): WindObservation {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const navigation = app.navigationState.snapshot(now);
    const instrumentMode = navigation.position.status === 'VALID' && navigation.position.source === 'BOAT';
    return { ...resolveWind(app.boatInstruments.snapshot(now), navigation, instrumentMode ? null : weather, now), instrumentMode };
}
