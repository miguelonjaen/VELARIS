/**
 * Tactical Alert System
 * Real-time monitoring and alerts for navigation precision and sail optimization
 * 
 * Monitors:
 * - Layline deviation using dynamic thresholds
 * - Sail configuration optimization based on wind conditions
 * - VMG improvement opportunities
 * - Critical weather/safety thresholds
 */

import { calculateLaylineDeviation, calculateDynamicDeviationThreshold } from './laylineCalculator';
import {
  SAIL_POLARS,
  getWindConditionCategory,
  getRecommendedSailConfig,
  calculateSailConfigVMGGain,
  getOptimalTWA,
  getMaxVMG
} from './sailPolars';

export interface TacticalAlert {
  type: 'layline' | 'sail' | 'vmg' | 'safety';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestedAction?: string;
  gain?: number;  // VMG gain in knots or time saved
  timeWindow?: string;  // e.g., "Próximos 3 minutos"
  logbookEntry?: {
    titulo: string;
    descripcion: string;
    categoria: string;
  };
}

export interface NavigationTelemetry {
  lat: number;
  lng: number;
  cog: number;           // Course Over Ground
  sog: number;           // Speed Over Ground (knots)
  windDir: number;       // Wind direction (0-359°)
  windSpeed: number;     // Wind speed (knots)
  waypointLat: number;
  waypointLng: number;
  currentSailConfig?: string;
}

/**
 * Analyze navigation data and generate tactical alerts
 * @param telemetry - Current vessel telemetry
 * @returns Array of tactical alerts
 */
export function generateTacticalAlerts(telemetry: NavigationTelemetry): TacticalAlert[] {
  const alerts: TacticalAlert[] = [];

  // 1. LAYLINE DEVIATION ALERT
  const laylineData = calculateLaylineDeviation(
    telemetry.lat,
    telemetry.lng,
    telemetry.waypointLat,
    telemetry.waypointLng,
    telemetry.cog,
    telemetry.windDir,
    telemetry.sog
  );

  if (laylineData.isOffLayline) {
    const deviationDegrees = Math.abs(laylineData.deviation);
    alerts.push({
      type: 'layline',
      severity: 'critical',
      message: `⚠️ MUY desviado de layline: ${deviationDegrees.toFixed(1)}° del rumbo óptimo.`,
      suggestedAction: `Corregir rumbo a ${laylineData.optimalBearing.toFixed(0)}° inmediatamente.`,
      timeWindow: 'INMEDIATO',
      logbookEntry: {
        titulo: 'Alerta Táctica Crítica: Desviación Severa de Layline',
        descripcion: `Desviación extrema detectada: ${deviationDegrees.toFixed(1)}° de layline óptima. Rumbo actual: ${telemetry.cog}° → Rumbo recomendado: ${laylineData.optimalBearing.toFixed(0)}°. Acción inmediata requerida.`,
        categoria: 'NAVEGACIÓN TÁCTICA'
      }
    });
  } else if (laylineData.isDeviated) {
    const deviationDegrees = Math.abs(laylineData.deviation);
    const deviationDir = laylineData.deviation > 0 ? 'estribor' : 'babor';
    alerts.push({
      type: 'layline',
      severity: 'warning',
      message: `Desviado ${deviationDegrees.toFixed(1)}° a ${deviationDir} de layline óptima.`,
      suggestedAction: `Sugerencia: Corregir a ${laylineData.optimalBearing.toFixed(0)}°`,
      gain: Math.abs(laylineData.deviation),
      logbookEntry: {
        titulo: 'Alerta Táctica: Desviación de Layline',
        descripcion: `Desviación detectada: ${deviationDegrees.toFixed(1)}° a ${deviationDir}. Rumbo actual: ${telemetry.cog}° → Rumbo óptimo: ${laylineData.optimalBearing.toFixed(0)}°. Corrección recomendada.`,
        categoria: 'NAVEGACIÓN TÁCTICA'
      }
    });
  }

  // 2. SAIL CONFIGURATION OPTIMIZATION
  const recommendedConfig = getRecommendedSailConfig(telemetry.windSpeed);
  const currentConfig = telemetry.currentSailConfig || 'full';

  if (recommendedConfig !== currentConfig) {
    const vmgGain = calculateSailConfigVMGGain(
      telemetry.windSpeed,
      currentConfig,
      recommendedConfig
    );

    if (vmgGain > 0.3) {
      alerts.push({
        type: 'sail',
        severity: vmgGain > 1.0 ? 'warning' : 'info',
        message: `🪁 Recomendación de velas: Cambiar a ${recommendedConfig.toUpperCase()}.`,
        suggestedAction: `Ganancia táctica: +${vmgGain.toFixed(1)} nudos VMG`,
        gain: vmgGain,
        timeWindow: 'Próximos 5 minutos',
        logbookEntry: {
          titulo: 'Recomendación de Trimado de Velas',
          descripcion: `Sistema táctico recomienda cambio de configuración. Actual: ${currentConfig} → Recomendado: ${recommendedConfig}. Viento: ${telemetry.windSpeed.toFixed(1)} kts. Ganancia esperada: +${vmgGain.toFixed(1)} nudos VMG. Ventana: Próximos 5 minutos.`,
          categoria: 'NAVEGACIÓN TÁCTICA'
        }
      });
    }
  }

  // 3. VMG OPTIMIZATION CHECK
  const optimalTWA = getOptimalTWA(telemetry.windSpeed, currentConfig);
  if (optimalTWA) {
    // Calculate current TWA
  const normalizedTWA = Math.abs(((telemetry.windDir - telemetry.cog + 540) % 360) - 180);

    const twaDifference = Math.abs(normalizedTWA - optimalTWA);
    
    if (twaDifference > 8) {
      alerts.push({
        type: 'vmg',
        severity: 'info',
        message: `💨 Ángulo de viento no óptimo: ${normalizedTWA.toFixed(0)}° vs ${optimalTWA}° ideal.`,
        suggestedAction: `Ajustar rumbo para maximizar VMG`,
        gain: twaDifference,
        logbookEntry: {
          titulo: 'Ajuste de Rumbo para Optimización VMG',
          descripcion: `Optimización de VMG sugerida. TWA actual: ${normalizedTWA.toFixed(0)}° → TWA óptimo: ${optimalTWA}°. Diferencia: ${twaDifference.toFixed(1)}°. Ajustar rumbo para maximizar velocidad real respecto destino.`,
          categoria: 'NAVEGACIÓN TÁCTICA'
        }
      });
    }
  }

  // 4. CRITICAL SAFETY THRESHOLDS
  // Check wind conditions
  if (telemetry.windSpeed > 25) {
    alerts.push({
      type: 'safety',
      severity: 'critical',
      message: `🌪️ CONDICIONES SEVERAS: Viento ${telemetry.windSpeed.toFixed(1)} nudos.`,
      suggestedAction: 'Considere refugio o reducción drástica de trapo.',
      timeWindow: 'INMEDIATO',
      logbookEntry: {
        titulo: 'ALERTA CRÍTICA: Condiciones Severas',
        descripcion: `Viento severamente elevado detectado: ${telemetry.windSpeed.toFixed(1)} nudos. Posición: [${telemetry.lat.toFixed(4)}, ${telemetry.lng.toFixed(4)}]. ACCIÓN INMEDIATA: Buscar refugio o reducir trapo drásticamente.`,
        categoria: 'SEGURIDAD CRÍTICA'
      }
    });
  } else if (telemetry.windSpeed > 18) {
    alerts.push({
      type: 'safety',
      severity: 'warning',
      message: `Temporal detectado: Viento ${telemetry.windSpeed.toFixed(1)} nudos.`,
      suggestedAction: 'Prepare maniobra de emergencia si es necesario.',
      logbookEntry: {
        titulo: 'Alerta Temporal: Viento Elevado',
        descripcion: `Temporal detectado: Viento ${telemetry.windSpeed.toFixed(1)} nudos. Preparar maniobras defensivas. Monitor continuo requerido.`,
        categoria: 'SEGURIDAD'
      }
    });
  }

  return alerts;
}

/**
 * Generate a single tactical advisory message from alerts
 * Prioritizes highest severity and most actionable alert
 * @param alerts - Array of tactical alerts
 * @returns Single formatted advisory message
 */
export function formatTacticalAdvisory(alerts: TacticalAlert[]): {
  message: string;
  priority: 'info' | 'warning' | 'critical';
} {
  if (alerts.length === 0) {
    return {
      message: 'Almirante, sistemas verdes. Navegación en condiciones óptimas.',
      priority: 'info'
    };
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sorted = [...alerts].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const primary = sorted[0];
  let fullMessage = primary.message;

  if (primary.suggestedAction) {
    fullMessage += ` | ${primary.suggestedAction}`;
  }

  if (alerts.length > 1) {
    const otherCount = alerts.length - 1;
    fullMessage += ` | +${otherCount} alerta${otherCount > 1 ? 's' : ''} adicional${otherCount > 1 ? 'es' : ''}.`;
  }

  return {
    message: fullMessage,
    priority: primary.severity
  };
}

/**
 * Get performance improvement recommendations
 * Analyzes multiple factors and provides prioritized suggestions
 * @param telemetry - Current vessel telemetry
 * @returns Formatted recommendation for UI
 */
export function getTacticalRecommendations(telemetry: NavigationTelemetry): string {
  const alerts = generateTacticalAlerts(telemetry);
  
  // Filter only actionable alerts with gains
  const improvements = alerts.filter(a => a.gain || a.type === 'sail');
  
  if (improvements.length === 0) {
    return 'Sistema navegacional óptimo. Mantenga rumbo actual.';
  }

  // Find best opportunity
  const best = improvements.reduce((prev, curr) => {
    const prevGain = prev.gain || 0;
    const currGain = curr.gain || 0;
    return currGain > prevGain ? curr : prev;
  });

  if (best.type === 'sail' && best.gain && best.gain > 0.5) {
    return `🎯 OPORTUNIDAD TÁCTICA: ${best.suggestedAction || ''} Ganancia: +${best.gain.toFixed(1)} nudos VMG.`;
  } else if (best.type === 'vmg' && best.gain && best.gain > 5) {
    return `📍 AJUSTE RECOMENDADO: Variar ${best.gain.toFixed(0)}° para optimizar VMG.`;
  }

  return 'Sistema navegacional óptimo. Mantenga rumbo actual.';
}
