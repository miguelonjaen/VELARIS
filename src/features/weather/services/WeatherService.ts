import { ProcessedWeather } from '@shared/types';

const API_KEY = 'YOUR_OPENWEATHER_API_KEY_HERE';

export async function getWeather(lat: number, lng: number): Promise<ProcessedWeather> {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch weather data');
    }

    const data = await response.json();

    return {
      temp: data.main.temp,
      wind: data.wind.speed, // m/s
      windDir: data.wind.deg,
      condition: data.weather[0].main,
      seaState: 'Calma', // Placeholder
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      visibility: data.visibility || 10000,
      waveHeight: 0.5, // Placeholder
      tideLevel: 0.5 // Placeholder
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    // Return placeholder data on error to avoid breaking the app
    return {
      temp: 22,
      wind: 12,
      windDir: 0,
      condition: 'Despejado',
      seaState: 'Calma',
      humidity: 60,
      pressure: 1013,
      visibility: 10000,
      waveHeight: 0.5,
      tideLevel: 0.5
    };
  }
}