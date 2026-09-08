# Active context

**Current focus**: FASE 3 - Integración AIS real + motores de riesgo — COMPLETADO ✅

**Task**: Conectar sistemas de predicción (Phase 1/2) con datos AIS reales, colorear contactos según riesgo.

**Solution implemented**:
- **Files created**:
  - `src/core/navigation/AisCollisionRisk.ts` — Adaptador de transformación AIS + cálculo de riesgo
  - `src/core/navigation/AisCollisionRisk.test.ts` — 12 tests deterministas para validar integración

- **Architecture**:
  - `AISStream` (WebSocket) → `aisTargets[]` → `enrichAisTargetsWithRisk()` → `tacticalAisTargets[]` → `FleetMarkers.tsx`
  - Phase 1: `calculateCollisionPrediction()` (CPA/TCPA/closingSpeed)
  - Phase 2: `calculateCollisionRisk()` (SAFE/CAUTION/WARNING/CRITICAL)
  - Adaptador: `calculateAisTargetRisk()` genera `riskLevel` para cada target

- **Color mapping**:
  ```
  SAFE     → #22c55e  (Green)
  CAUTION  → #facc15  (Yellow)
  WARNING  → #f97316  (Orange)
  CRITICAL → #ef4444  (Red)
  ```

- **Integration points**:
  1. **App.tsx**: `tacticalAisTargets` useMemo updated to use `enrichAisTargetsWithRisk()`
  2. **FleetMarkers.tsx**: 
     - Changed `target.risk` → `target.riskLevel`
     - Updated color mapping logic
     - Popup displays new risk levels

- **Data flow**:
  - OwnShip: `shipPosition.lat/lng + app.state.sog/cog` → Vessel object
  - Target: `target.lat/lng + target.sog/target.cog` → Vessel object
  - Both → `calculateCollisionPrediction()` (PHASE 1)
  - Prediction → `calculateCollisionRisk()` (PHASE 2)
  - Result: `{ riskLevel, cpaNm, tcpaMinutes, closingSpeed, isApproaching, relativeBearing }`

- **Error handling**:
  - Missing OwnShip → defaults to SAFE
  - Missing target position/motion → defaults to SAFE, no crash
  - Invalid coordinates (NaN/Infinity) → defaults to SAFE
  - Original target properties preserved via spread operator

**Test Results**: ✅ 12/12 PASSED
  1-4. Basic scenarios (head-on, moderate distance, receding, parallel)
  5-7. Robustness (missing data, invalid data, no own ship)
  8-9. OwnShip changes, time-based TCPA
  10. Alternative property name ("lon" vs "lng")
  11. Batch enrichment
  12. Color mapping verification

**Build/TypeScript**: ✅ CLEAN
  - TypeScript: 0 errors
  - Build: SUCCESS (2,303 modules transformed)
  - No breaking changes to existing code

**PHASE 4 BLOCKED UNTIL**: User approval
- Tactical HUD integration
- Real-time alerts
- COLREG recommendations
- Maneuver automation

_Tarea completada: 2026-08-23 18:03_
