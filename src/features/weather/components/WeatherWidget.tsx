import type { WindObservation } from '../../../core/instruments/resolveWind';
import React from 'react';
import { Cloud, Navigation, Wind } from 'lucide-react';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';
import type { WeatherData } from '../../../lib/useWeather';

interface WeatherWidgetProps {
  referenceLabel?: string;
  weather: WeatherData | null;
  windObservation?: WindObservation;
  marineWeather?: MarineWeatherData | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

const formatAtmospheric = (value: number | undefined, suffix: string, digits = 0): string =>
  value === undefined ? '--' : `${value.toFixed(digits)}${suffix}`;

const formatMarine = (value: number | null | undefined, suffix: string, digits = 0): string =>
  value === null || value === undefined ? '--' : `${value.toFixed(digits)}${suffix}`;

const formatVisibility = (visibility?: number): string =>
  visibility === undefined ? '--' : `${(visibility / 1000).toFixed(1)} km`;

/** Columna izquierda de la carta, siempre bajo la banda Command Center (ver --vl-* en index.css). */
const WIDGET_POSITION: React.CSSProperties = {
  top: 'var(--vl-content-top)',
  left: 'var(--vl-gap)',
  width: 'var(--vl-weather-w)',
};

const formatUpdateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Compact chartplotter instrument using centralized atmospheric and marine observations. */
export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather, windObservation, marineWeather = null, isLoading = false, error, className, referenceLabel }) => {
  if (!weather && (windObservation?.source === 'BOAT' || windObservation?.instrumentMode)) {
    return <section className={`vl-surface pointer-events-auto absolute z-(--vl-z-chart-widget) rounded-xl font-mono ${className ?? ''}`} style={WIDGET_POSITION} aria-label="Viento de los instrumentos del barco">
      <WindReadings wind={windObservation} weather={null} />
      <p className="px-3 py-2 text-[10px] text-slate-400">Atmósfera y mar: sin datos disponibles</p>
    </section>;
  }
  if (!weather) {
    return (
      <div
        className={`vl-surface absolute z-(--vl-z-chart-widget) flex min-h-[72px] items-center justify-center rounded-xl px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 ${className ?? ''}`}
        style={WIDGET_POSITION}
        role="status"
        aria-label="Meteorología"
      >
        <div className="flex min-w-0 flex-col items-center gap-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <Cloud size={18} className="shrink-0 text-slate-500" />
            <span>{isLoading ? 'Meteo cargando' : 'Meteo no disponible'}</span>
          </div>
          {!isLoading && error && (
            <span className="max-w-full break-words text-[8px] font-medium normal-case tracking-normal text-amber-300/80">
              {error}
            </span>
          )}
        </div>
      </div>
    );
  }

  const rain = weather.precipitation.rain1hMm;
  const waveDirection = marineWeather?.waveDirection ?? null;
  const currentDirection = marineWeather?.currentDirection ?? null;

  return (
    <section
      className={`vl-surface pointer-events-auto absolute z-(--vl-z-chart-widget) overflow-hidden rounded-xl font-mono ${className ?? ''}`}
      style={WIDGET_POSITION}
      title={`Atmósfera: ${weather.source}. Viento: ${windObservation?.source ?? "METEO"}. Marine: ${marineWeather?.source ?? 'sin datos'}.`}
      aria-label="Observación meteorológica y marina actual"
    >
      {referenceLabel && (
        <div className="px-3 py-1 text-[8px] font-bold text-cyan-400">
          {referenceLabel}
        </div>
      )}
      <header className="flex h-8 items-center gap-2 border-b border-white/10 px-3">
        <Cloud size={15} className="shrink-0 text-slate-400" />
        <span className="text-sm font-black text-white">{weather.temperature.toFixed(0)}°C</span>
        <span className="min-w-0 flex-1 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{weather.condition}</span>
        <span className="shrink-0 text-[8px] font-bold text-slate-500" title="Hora de la última actualización (OpenWeather)">
          {formatUpdateTime(weather.timestamp)}
        </span>
      </header>

      <WindReadings wind={windObservation} weather={weather} />

      <div className="grid h-[48px] grid-cols-2 gap-x-3 border-b border-white/10 px-3 py-1.5 text-[8px]">
        <MarineReading
          label="WAVE"
          value={formatMarine(marineWeather?.waveHeight, ' m', 2)}
          direction={waveDirection}
          directionLabel="FROM"
          detail={`PERIOD ${formatMarine(marineWeather?.wavePeriod, ' s', 1)}`}
        />
        <MarineReading
          label="CURRENT"
          value={formatMarine(marineWeather?.currentSpeed, ' kt', 1)}
          direction={currentDirection}
          directionLabel="TOWARD"
          detail="MARINE · MODEL"
          current
        />
      </div>

      <div className="grid h-[26px] grid-cols-5 items-center gap-1 px-3 text-[8px]">
        <Atmosphere label="PRESS" value={formatAtmospheric(weather.pressure, ' hPa')} />
        <Atmosphere label="HUM" value={formatAtmospheric(weather.humidity, ' %')} />
        <Atmosphere label="VIS" value={formatVisibility(weather.visibility)} />
        <Atmosphere label="RAIN" value={formatAtmospheric(rain, ' mm/h', 1)} />
        <Atmosphere label="CLOUD" value={formatAtmospheric(weather.cloudCover, ' %')} />
      </div>
    </section>
  );
};

interface WeatherValueProps {
  label: string;
  value: string;
  unit?: string;
  prominent?: boolean;
}

const WeatherValue: React.FC<WeatherValueProps> = ({ label, value, unit, prominent = false }) => (
  <div className="min-w-0 text-center leading-none">
    <span className={prominent ? 'block text-[17px] font-black text-white' : 'block truncate text-[11px] font-black text-slate-200'}>{value}{unit && <small className="ml-0.5 text-[8px] text-slate-500">{unit}</small>}</span>
    <span className="mt-1 block text-[7px] font-bold tracking-[0.12em] text-slate-500">{label}</span>
  </div>
);

interface MarineReadingProps {
  label: string;
  value: string;
  direction: number | null;
  directionLabel: 'FROM' | 'TOWARD';
  detail: string;
  current?: boolean;
}

const MarineReading: React.FC<MarineReadingProps> = ({ label, value, direction, directionLabel, detail, current = false }) => (
  <div className="min-w-0 leading-none">
    <div className="flex items-center gap-1">
      <span className="w-10 text-[8px] font-bold tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-[11px] font-black text-slate-200">{value}</span>
      {direction !== null && <Navigation size={11} className={current ? 'ml-auto text-teal-300' : 'ml-auto text-sky-300'} style={{ transform: `rotate(${direction}deg)` }} />}
      <span className="text-[10px] font-bold text-slate-300">{direction === null ? '--' : `${direction.toFixed(0)}°`}</span>
    </div>
    <div className="mt-1 flex justify-between text-[6px] font-bold tracking-[0.08em] text-slate-600">
      <span>{detail}</span>
      <span className={current ? 'text-teal-500' : 'text-sky-500'}>{directionLabel}</span>
    </div>
  </div>
);

interface AtmosphereProps {
  label: string;
  value: string;
}

const Atmosphere: React.FC<AtmosphereProps> = ({ label, value }) => (
  <div className="min-w-0 text-center leading-none">
    <span className="block truncate text-[8px] font-bold text-slate-300">{value}</span>
    <span className="mt-1 block text-[6px] font-bold tracking-[0.08em] text-slate-600">{label}</span>
  </div>
);


function WindReadings({ wind, weather }: { wind?: WindObservation; weather: WeatherData | null }) {
  const boat = wind?.source === 'BOAT' || wind?.instrumentMode === true;
  const tws = boat ? wind?.tws ?? null : weather?.tws ?? null;
  const twd = boat ? wind?.twd ?? null : weather?.twd ?? null;
  const apparentOnly = boat && tws === null;
  const speed = apparentOnly ? wind?.aws : tws;
  const angle = apparentOnly ? wind?.awa : twd ?? (boat ? wind?.twa : null);
  const relative = apparentOnly || twd === null;
  const fmt = (value: number | null | undefined, digits: number) => value == null ? '--' : value.toFixed(digits);
  return <div className="border-b border-white/10 px-3 py-2">
    <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-cyan-400">
      {boat ? wind?.source === 'BOAT' ? `NMEA · instrumentos · ${Math.floor((wind.ageMs ?? 0) / 1000)} s` : 'NMEA · sin viento vigente' : 'METEO · OpenWeather'}
    </div>
    <div className="flex items-center gap-2">
      <Wind size={16} className="text-cyan-400" />
      <WeatherValue label={apparentOnly ? 'AWS' : 'TWS'} value={fmt(speed, 1)} unit="kt" prominent />
      <WeatherValue label={relative ? (apparentOnly ? 'AWA rel.' : 'TWA rel.') : 'TWD FROM'} value={`${fmt(angle, 0)}°`} prominent />
      {!boat && <WeatherValue label="GUST" value={formatAtmospheric(weather?.gust, ' kt', 1)} />}
    </div>
  </div>;
}
