# Progress

**What works**

- ✅ **Centrado inicial del chart (2026-08-23)**
  - Mapa se centra en posición real del barco activo al iniciar
  - Centrado al cambiar `selectedShipId` (una sola vez por barco)
  - NO hay centrado continuo cuando shipPosition cambia
  - Usuario puede desplazar libremente el mapa
  - Funcionalidad MBTILES (cambios de sector) preservada
  - Validación: shipPosition debe tener lat/lng finitos, `selectedShipId` debe existir
  - File: `src/App.tsx` línea 1573 (useEffect con dependencias `[selectedShipId]`)
  - Build: ✅ npm run build OK | TypeScript: ✅ tsc --noEmit OK

- ✅ **FASE 1: Collision Prediction Engine (2026-08-23)**
  - Pure math motor en `src/core/navigation/CollisionPrediction.ts` (240 líneas, sin dependencias)
  - Calcula: CPA, TCPA (hours), TCA (Date), closingSpeed, relativeBearing, isApproaching
  - ENU (East-North-Up) local coordinate projection
  - 6/6 tests determinísticos PASSED
  - Build: ✅ | TypeScript: ✅

- ✅ **FASE 2: Collision Risk Engine (2026-08-23)**
  - Motor de clasificación en `src/core/navigation/CollisionRiskEngine.ts` (193 líneas)
  - Thresholds: CAUTION (2.0 NM, 30 min) | WARNING (1.0 NM, 20 min) | CRITICAL (0.5 NM, 10 min)
  - Lógica de gates: NOT approaching → TCPA null → closingSpeed → threshold checks
  - 10/10 tests determinísticos PASSED
  - Build: ✅ | TypeScript: ✅

- ✅ **FASE 3: AIS Integration + Visual Risk (2026-08-23)**
  - Adaptador en `src/core/navigation/AisCollisionRisk.ts` (185 líneas)
  - Integración: AISStream → aisTargets[] → enrichAisTargetsWithRisk() → FleetMarkers
  - Color mapping: SAFE (#22c55e) | CAUTION (#facc15) | WARNING (#f97316) | CRITICAL (#ef4444)
  - Updated `src/App.tsx`: tacticalAisTargets usa nuevo adaptador
  - Updated `src/features/traffic/renderers/FleetMarkers.tsx`: riskLevel-based colors
  - 12/12 tests determinísticos PASSED
  - Build: ✅ (2,303 modules transformed) | TypeScript: ✅ (0 errors)
  - Validación: Missing data/OwnShip → defaults to SAFE (no crash)

**Not started / backlog**

- ⏳ **FASE 4: Tactical Alerts & HUD** (user approval required)
  - Alarmas sonoras
  - TacticalHUD integration
  - Panel CPA/TCPA
  - COLREG recognition
  - Maneuver automation
  - Real-time messaging

**Known issues**

- ⚠️ Refs a Motril (36.7215, -3.5235) existen legítimamente en PORT_LIST, rutas, datos históricos — no son centros funcionales del mapa
- ⚠️ FleetMarkers aún tiene otras referencias a `target.risk` (línea ~1151 en App.tsx enriquecimiento individual) — compatible por compatibilidad hacia atrás

_Keep bullets factual and small; link issues or PRs when useful._
