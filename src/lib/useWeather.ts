import { useState, useEffect, useCallback } from 'react';

export interface WeatherData {
  temp: number;
  condition: string;
  description: string;
  wind: number; // Velocidad en nudos
  windDir: number; // Dirección en grados
  pressure: number;
  humidity: number;
  icon: string;
  city: string;
  timestamp: number;
}

interface UseWeatherResult {
  weather: WeatherData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutos

export const useWeather = (lat: number | null, lng: number | null): UseWeatherResult => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    if (lat === null || lng === null) return;

    const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
    if (!apiKey) {
      setError('API Key de OpenWeather no configurada');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=es`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error meteorológico: ${response.statusText}`);
      }

      const data = await response.json();

      const processedData: WeatherData = {
        temp: data.main.temp,
        condition: data.weather[0].main,
        description: data.weather[0].description,
        wind: Number((data.wind.speed * 1.94384).toFixed(1)), // Convertir m/s a nudos
        windDir: data.wind.deg,
        pressure: data.main.pressure,
        humidity: data.main.humidity,
        icon: data.weather[0].icon,
        city: data.name,
        timestamp: Date.now(),
      };

      setWeather(processedData);
    } catch (err: any) {
      console.error('Error fetching weather:', err);
      setError(err.message || 'Error al obtener datos meteorológicos');
    } finally {
      setIsLoading(false);
    }
  }, [lat, lng]);

  // Efecto para carga inicial y cuando cambian las coordenadas significativamente
  useEffect(() => {
    if (lat !== null && lng !== null) {
      fetchWeather();
    }
  }, [lat, lng, fetchWeather]);

  // Efecto para actualización periódica
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeather();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchWeather]);

  return { weather, isLoading, error, refetch: fetchWeather };
};