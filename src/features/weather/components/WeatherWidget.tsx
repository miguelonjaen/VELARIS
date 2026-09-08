import React from 'react';
import { Cloud, Navigation, Wind } from 'lucide-react';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';
import type { WeatherData } from '../../../lib/useWeather';

interface WeatherWidgetProps {
  weather: WeatherData | null;
  marineWeather?: MarineWeatherData | null;
  isLoading?: boolean;
  className?: string;
}

const formatAtmospheric = (value: number | undefined, suffix: string, digits = 0): string =>
  value === undefined ? '--' : `${value.toFixed(digits)}${suffix}`;

const formatMarine = (value: number | null | undefined, suffix: string, digits = 0): string =>
  value === null || value === undefined ? '--' : `${value.toFixed(digits)}${suffix}`;

const formatVisibility = (visibility?: number): string =>
  visibility === undefined ? '--' : `${(visibility / 1000).toFixed(1)} km`;

/** Compact chartplotter instrument using centralized atmospheric and marine observations. */
export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather, marineWeather = null, isLoading = false, className }) => {
  if (!weather) {
    return (
      <div className={`absolute top-24 left-6 z-[1000] flex h-[108px] w-[218px] items-center justify-center rounded-xl border border-white/10 bg-[#070b14]/85 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 shadow-2xl backdrop-blur-xl ${className ?? ''}`}>
        <Cloud size={18} className="mr-2 text-slate-500" />
        {isLoading ? 'Meteo cargando' : 'Meteo no disponible'}
      </div>
    );
  }

  const rain = weather.precipitation.rain1hMm;
  const waveDirection = marineWeather?.waveDirection ?? null;
  const currentDirection = marineWeather?.currentDirection ?? null;

  return (
    <section
      className={`absolute top-24 left-6 z-[1000] h-[162px] w-[218px] overflow-hidden rounded-xl border border-white/10 bg-[#070b14]/85 font-mono shadow-2xl backdrop-blur-xl pointer-events-auto ${className ?? ''}`}
      title={`Atmósfera: ${weather.source}. TWD ${weather.twd.toFixed(0)}° FROM. Marine: ${marineWeather?.source ?? 'sin datos'}.`}
      aria-label="Observación meteorológica y marina actual"
    >
      <header className="flex h-8 items-center gap-2 border-b border-white/10 px-3">
        <Cloud size={15} className="shrink-0 text-slate-400" />
        <span className="text-sm font-black text-white">{weather.temperature.toFixed(0)}°C</span>
        <span className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{weather.condition}</span>
      </header>

      <div className="flex h-[50px] items-center border-b border-white/10 px-3">
        <div className="mr-3 flex flex-col">
          <span className="text-[8px] font-bold tracking-[0.16em] text-cyan-500">WIND</span>
          <span className="text-[8px] font-bold tracking-[0.14em] text-slate-600">TWD FROM</span>
        </div>
        <Wind size={18} className="mr-1.5 text-cyan-400" style={{ transform: `rotate(${weather.twd}deg)` }} />
        <WeatherValue label="TWS" value={weather.tws.toFixed(1)} unit="kt" prominent />
        <span className="mx-2 h-7 w-px bg-white/10" />
        <WeatherValue label="TWD" value={`${weather.twd.toFixed(0).padStart(3, '0')}°`} prominent />
        <span className="mx-2 h-7 w-px bg-white/10" />
        <WeatherValue label="GUST" value={formatAtmospheric(weather.gust, ' kt', 1)} />
      </div>

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
