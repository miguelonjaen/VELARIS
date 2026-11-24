export interface InstrumentGeometry {
  // ============================================================
  // Tamaño general
  // ============================================================

  size: number;
  center: number;
  radius: number;

  // ============================================================
// Aguja de viento
// ============================================================

windNeedleLength: number;
windNeedleWidth: number;
windNeedleStroke: number;
windNeedleHubRadius: number;
windNeedleEndRadius: number;

// ============================================================
// Bearing Bug
// ============================================================

bearingBugRadius: number;
bearingBugLineLength: number;
bearingBugLineOffset: number;

bearingBugWidth: number;
bearingBugHeight: number;

bearingBugStroke: number;

// ============================================================
// Tactical Core
// ============================================================

tacticalCoreRadius: number;
tacticalCoreStroke: number;

// ============================================================
// Waypoint Beam
// ============================================================

waypointBeamStartRadius: number;
waypointBeamEndRadius: number;

waypointBeamStroke: number;

waypointArrowOffset: number;
waypointArrowLength: number;
waypointArrowWidth: number;

// ============================================================
// Performance Zone
// ============================================================

performanceZoneInnerRadius: number;
performanceZoneOuterRadius: number;

performanceZoneStroke: number;
performanceZoneWidth: number;

// ============================================================
// Performance Arc
// ============================================================

performanceArcOuterRadius: number;
performanceArcInnerRadius: number;

performanceArcStroke: number;
performanceArcWidth: number;

// ============================================================
// No Go Zone
// ============================================================

noGoOuterRadius: number;
noGoInnerRadius: number;

noGoStroke: number;

// ============================================================
// Laylines
// ============================================================

laylineStartRadius: number;
laylineEndRadius: number;
laylineMarkerRadius: number;

laylineStroke: number;
laylineMarkerSize: number;

laylineDash: string;

  // ============================================================
  // Anillos principales
  // ============================================================

  outerRadius: number;
  performanceRadius: number;
  windSectorRadius: number;
  laylineRadius: number;
  boatRadius: number;

  // ============================================================
  // Rosa de los vientos
  // ============================================================

  compassOuterRadius: number;
  compassInnerRadius: number;

  majorTickLength: number;
  mediumTickLength: number;
  minorTickLength: number;

  majorTickWidth: number;
  mediumTickWidth: number;
  minorTickWidth: number;

  labelRadius: number;
  cardinalRadius: number;

  outerRingStroke: number;
  innerRingStroke: number;

  hubOuterRadius: number;
  hubInnerRadius: number;

  // ============================================================
  // Espesores
  // ============================================================

  outerStroke: number;
  performanceStroke: number;
  sectorStroke: number;

  // ============================================================
  // Geometría auxiliar
  // ============================================================

  tickInset: number;

  boatScale: number;

  arrowLength: number;

  padding: number;
}

export function createInstrumentGeometry(
  size: number
): InstrumentGeometry {

  const center = size / 2;
  const radius = size / 2;

  return {

    // ==========================================================
    // Base
    // ==========================================================

    size,
    center,
    radius,

    // ==========================================================
// Aguja de viento
// ==========================================================

windNeedleLength: radius * 0.038,
windNeedleWidth: radius * 0.01875,

windNeedleStroke: radius * 0.0125,

windNeedleHubRadius: radius * 0.018,
windNeedleEndRadius: radius * 0.68,

// ==========================================================
// Bearing Bug
// ==========================================================

bearingBugRadius: radius * 0.96,

bearingBugLineLength: radius * 0.055,
bearingBugLineOffset: radius * 0.018,

bearingBugWidth: radius * 0.037,

bearingBugHeight: radius * 0.025,

bearingBugStroke: radius * 0.018,

// ==========================================================
// Tactical Core
// ==========================================================

tacticalCoreRadius: radius * 0.26,

tacticalCoreStroke: radius * 0.010,

// ==========================================================
// Performance Zone
// ==========================================================

performanceZoneInnerRadius: radius * 0.34,
performanceZoneOuterRadius: radius * 0.68,

performanceZoneStroke: radius * 0.008,
performanceZoneWidth: 8,

// ==========================================================
// Performance Arc
// ==========================================================

performanceArcOuterRadius: radius * 0.685,
performanceArcInnerRadius: radius * 0.66,

performanceArcStroke: radius * 0.008,
performanceArcWidth: 18,


// ==========================================================
// No Go Zone
// ==========================================================

noGoOuterRadius: radius * 0.68,
noGoInnerRadius: radius * 0.26,

noGoStroke: radius * 0.012,


// ==========================================================
// Laylines
// ==========================================================

laylineStartRadius: radius * 0.26,
laylineEndRadius: radius * 0.68,

laylineMarkerRadius: radius * 0.66,

laylineStroke: radius * 0.014,
laylineMarkerSize: radius * 0.016,

laylineDash: "10 5",


// ==========================================================
// Waypoint Beam
// ==========================================================

waypointBeamStartRadius: radius * 0.26,

waypointBeamEndRadius: radius * 0.68,

waypointBeamStroke: radius * 0.012,

waypointArrowOffset: radius * 0.040,

waypointArrowLength: radius * 0.055,
waypointArrowWidth: radius * 0.022,


    // ==========================================================
    // Anillos principales
    // ==========================================================

    outerRadius: radius * 0.96,

performanceRadius: radius * 0.86,

windSectorRadius: radius * 0.76,

laylineRadius: radius * 0.67,

boatRadius: radius * 0.26,

    // ==========================================================
    // Rosa
    // ==========================================================

    compassOuterRadius: radius - 10,

    compassInnerRadius: radius - 14,

    majorTickLength: radius * 0.16,
mediumTickLength: radius * 0.11,
minorTickLength: radius * 0.06,

   majorTickWidth: radius * 0.018,
mediumTickWidth: radius * 0.012,
minorTickWidth: radius * 0.006,


    labelRadius: radius - 48,

    cardinalRadius: radius - 40,

    outerRingStroke: 2,

    innerRingStroke: 1,
hubOuterRadius: radius * 0.038,
hubInnerRadius: radius * 0.013,

    // ==========================================================
    // Espesores
    // ==========================================================

    outerStroke: radius * 0.015,

    performanceStroke: radius * 0.035,

    sectorStroke: radius * 0.020,

    // ==========================================================
    // Auxiliares
    // ==========================================================

    tickInset: radius * 0.015,

    boatScale: radius * 0.23,

    arrowLength: radius * 0.18,

    padding: radius * 0.04,
  };
}