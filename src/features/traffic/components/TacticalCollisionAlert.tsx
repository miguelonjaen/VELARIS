/**
 * PHASE 4: Tactical Collision Alert
 * 
 * Displays the highest-priority AIS collision contact requiring tactical attention.
 * 
 * Only shows CAUTION, WARNING, or CRITICAL contacts.
 * SAFE contacts are omitted.
 * 
 * Prioritization:
 * - CRITICAL > WARNING > CAUTION
 * - Within same level: lowest TCPA > lowest CPA
 * 
 * Non-intrusive: positioned in UI corner, not blocking navigation
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, MapPin } from 'lucide-react';
import { CollisionRiskLevel } from '@/core/navigation/CollisionRiskEngine';

/**
 * AIS target with collision risk data (from PHASE 3)
 */
export interface AisTargetWithRisk {
  mmsi?: string | number;
  nombre?: string;
  lat: number;
  lng?: number;
  lon?: number;
  cog: number;
  sog: number;
  riskLevel: CollisionRiskLevel;
  cpaNm: number | null;
  tcpaMinutes: number | null;
  closingSpeed: number;
  isApproaching: boolean;
  relativeBearing: number;
}

interface TacticalCollisionAlertProps {
  targets: AisTargetWithRisk[];
  onTargetClick?: (target: AisTargetWithRisk) => void;
}

/**
 * Format TCPA (minutes) to human-readable time string
 * 
 * @param minutes TCPA in minutes (or null)
 * @returns Formatted string (MM:SS or HH:MM:SS or "—")
 */
export function formatTcpa(minutes: number | null): string {
  if (minutes === null || minutes === undefined) {
    return '—';
  }

  if (minutes < 0) {
    return 'PASSED';
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.round((minutes * 60) % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  const mins = Math.floor(minutes);
  const secs = Math.round((minutes * 60) % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Get visual configuration for risk level
 */
function getRiskConfig(level: CollisionRiskLevel) {
  const configs: Record<CollisionRiskLevel, {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ReactNode;
    label: string;
  }> = {
    'SAFE': {
      color: '#22c55e',
      bgColor: '#f0fdf4',
      borderColor: '#86efac',
      icon: <Info className="w-5 h-5" />,
      label: 'SAFE'
    },
    'CAUTION': {
      color: '#facc15',
      bgColor: '#fffbeb',
      borderColor: '#fde047',
      icon: <AlertCircle className="w-5 h-5" />,
      label: 'CAUTION'
    },
    'WARNING': {
      color: '#f97316',
      bgColor: '#fff7ed',
      borderColor: '#fed7aa',
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'WARNING'
    },
    'CRITICAL': {
      color: '#ef4444',
      bgColor: '#fef2f2',
      borderColor: '#fca5a5',
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'CRITICAL'
    }
  };
  return configs[level];
}

/**
 * Determine the highest-priority target requiring attention
 */
export function getHighestRiskTarget(targets: AisTargetWithRisk[]): AisTargetWithRisk | null {
  if (!targets || targets.length === 0) return null;

  // Filter out SAFE targets
  const alertTargets = targets.filter(t => t.riskLevel !== 'SAFE');
  if (alertTargets.length === 0) return null;

  // Prioritize risk levels
  const riskOrder: Record<CollisionRiskLevel, number> = {
    'CRITICAL': 3,
    'WARNING': 2,
    'CAUTION': 1,
    'SAFE': 0
  };

  // Sort by risk level (descending) then by TCPA (ascending) or CPA (ascending)
  return alertTargets.sort((a, b) => {
    const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
    if (riskDiff !== 0) return riskDiff;

    // Same risk level: prioritize by TCPA or CPA
    if (a.tcpaMinutes !== null && b.tcpaMinutes !== null) {
      const tcpaDiff = a.tcpaMinutes - b.tcpaMinutes;
      if (tcpaDiff !== 0) return tcpaDiff;  // Lower TCPA = more urgent

      if (a.cpaNm !== null && b.cpaNm !== null) {
        return a.cpaNm - b.cpaNm;  // Lower CPA = more urgent
      }

      return 0;
    }

    if (a.tcpaMinutes === null && b.tcpaMinutes !== null) {
      return 1;  // Null TCPA (no convergence) is less urgent
    }

    if (a.tcpaMinutes !== null && b.tcpaMinutes === null) {
      return -1;
    }

    // Both TCPA null, compare CPA
    if (a.cpaNm !== null && b.cpaNm !== null) {
      return a.cpaNm - b.cpaNm;  // Lower CPA = more urgent
    }

    return 0;
  })[0] || null;
}

/**
 * Tactical Collision Alert Component
 * 
 * Displays highest-priority collision contact with:
 * - Risk level (CAUTION/WARNING/CRITICAL)
 * - Contact name/MMSI
 * - CPA (Closest Point of Approach)
 * - TCPA (Time to CPA)
 * - Closing speed
 * - Bearing
 */
export const TacticalCollisionAlert: React.FC<TacticalCollisionAlertProps> = ({
  targets,
  onTargetClick
}) => {
  const highestRiskTarget = useMemo(() => getHighestRiskTarget(targets), [targets]);

  if (!highestRiskTarget) {
    return null;  // No alerts to display
  }

  const config = getRiskConfig(highestRiskTarget.riskLevel);
  const isCritical = highestRiskTarget.riskLevel === 'CRITICAL';
  const isWarning = highestRiskTarget.riskLevel === 'WARNING';

  const handleClick = () => {
    if (onTargetClick) {
      onTargetClick(highestRiskTarget);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key={`alert-${highestRiskTarget.mmsi}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-6 right-6 z-40 max-w-sm"
      >
        <div
          onClick={handleClick}
          className={`
            rounded-lg border-2 shadow-lg cursor-pointer
            transition-all duration-300 hover:shadow-xl
            ${isCritical ? 'p-4' : isWarning ? 'p-3' : 'p-2'}
          `}
          style={{
            backgroundColor: config.bgColor,
            borderColor: config.borderColor,
            borderLeft: `6px solid ${config.color}`
          }}
        >
          {/* Header with risk level and icon */}
          <div className="flex items-center gap-2 mb-3">
            <div style={{ color: config.color }}>
              {config.icon}
            </div>
            <span
              className={`font-bold ${isCritical ? 'text-lg' : 'text-base'}`}
              style={{ color: config.color }}
            >
              {config.label}
            </span>
            {isCritical && (
              <div className="ml-auto">
                <motion.div
                  animate={{ opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
              </div>
            )}
          </div>

          {/* Target name/MMSI */}
          {(highestRiskTarget.nombre || highestRiskTarget.mmsi) && (
            <div className="text-sm font-semibold mb-2 truncate">
              {highestRiskTarget.nombre || `MMSI ${highestRiskTarget.mmsi}`}
            </div>
          )}

          {/* Main metrics */}
          <div className={isCritical ? 'space-y-2' : isWarning ? 'space-y-1' : 'text-xs space-y-0.5'}>
            {/* CPA */}
            <div className="flex justify-between items-center">
              <span className={`${isCritical ? 'text-sm' : 'text-xs'} opacity-75`}>
                CPA:
              </span>
              <span className={`font-mono font-bold ${isCritical ? 'text-lg' : isWarning ? 'text-base' : 'text-sm'}`}>
                {highestRiskTarget.cpaNm !== null
                  ? `${highestRiskTarget.cpaNm.toFixed(2)} NM`
                  : '—'}
              </span>
            </div>

            {/* TCPA */}
            <div className="flex justify-between items-center">
              <span className={`${isCritical ? 'text-sm' : 'text-xs'} opacity-75`}>
                TCPA:
              </span>
              <span className={`font-mono font-bold ${isCritical ? 'text-lg' : isWarning ? 'text-base' : 'text-sm'}`}>
                {formatTcpa(highestRiskTarget.tcpaMinutes)}
              </span>
            </div>

            {/* Closing Speed */}
            {isCritical && (
              <div className="flex justify-between items-center">
                <span className="text-sm opacity-75">Closing:</span>
                <span className="font-mono font-bold text-base">
                  {highestRiskTarget.closingSpeed.toFixed(1)} kn
                </span>
              </div>
            )}

            {/* Bearing */}
            {isCritical && (
              <div className="flex justify-between items-center">
                <span className="text-sm opacity-75">Bearing:</span>
                <span className="font-mono font-bold text-base">
                  {Math.round(highestRiskTarget.relativeBearing)}°
                </span>
              </div>
            )}
          </div>

          {/* Click hint for interactive alert */}
          {isCritical && (
            <div className="mt-3 pt-2 border-t border-current border-opacity-20 flex items-center gap-1 text-xs opacity-60">
              <MapPin className="w-3 h-3" />
              <span>Click to center on contact</span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
