# Progress

## Completed

### VELARIS CORE base
- `VelarisCore` centralizes vessel, navigation, environment, route and alert state.
- Partial updates are supported.
- Typed synchronous Core events are implemented.
- Core contracts reuse existing domain types where appropriate.
- Production integration is now established through `Application`.

### Navigation architecture
- `NavigationEngine` implemented as a pure/stateless calculation engine.
- `NavigationAdapter` connects Core state to NavigationEngine.
- Navigation metrics are written back to `VelarisCore.navigation`.
- NavigationEngine calculates DTW, BTW, XTE and ETA.
- HDG and COG remain independent.

### Telemetry architecture
- `TelemetryService` bridges telemetry into `VelarisCore`.
- Simulation telemetry follows the same pipeline.
- `SimulationService` is a source/simulator of telemetry, not a navigation engine.
- Legacy navigation simulation data generation was removed.

### Phase 3A
- SimulationService cleanup completed.
- Removed `NavigationSimulationData`.
- Removed `simulateNavigationData()`.
- Removed obsolete navigation simulation code from `App.tsx`.
- Verified `SimulationService.tick()` emits GPS telemetry without `nav`.

### Phase 3B — Simulation End-to-End
Validated end-to-end flow:

`SimulationService → TelemetryService → VelarisCore → NavigationAdapter → NavigationEngine`

Validation:
- Simulation E2E: **23/23 passed**
- `npm run lint`: **PASS**
- Full Vitest: **283 tests passed**
- Full Vitest: 4 pre-existing empty test files report `No test suite found`
- `npm run build`: **PASS**

Validated behaviours:
- GPS telemetry reaches Core.
- COG reaches Core from simulation.
- Heading is not derived from COG.
- Independent HEADING telemetry updates heading without changing COG.
- Navigation metrics are calculated by NavigationEngine.
- ETA scales correctly with SOG.
- Simulation advances through waypoints.
- Simulation waypoint progression does not mutate Core active waypoint index.
- No `gpsMessage.nav`.
- No duplicated NAV calculation in SimulationService.
- No SimulationService/NavigationEngine loop.
- HUD/UI can obtain navigation metrics from `core.getState().navigation`.

## Known non-blocking issues

- Four empty legacy test files are still detected by Vitest:
  - `CollisionPrediction.test.ts`
  - `CollisionRiskEngine.test.ts`
  - `ColregRulesEngine.test.ts`
  - `GeoMath.test.ts`
- These files currently have no test suite. Do not modify them as part of Phase 3 unless explicitly planned.
- Vite reports configuration/deprecation warnings.
- Production build reports a large JS chunk.
- Browserslist database is stale.

These are separate technical-debt items and do not block Phase 3.

## Next

Audit remaining domain-state ownership in `App.tsx` and determine the next incremental migration.

Priority:
1. Identify remaining duplicated canonical state.
2. Identify remaining direct telemetry/navigation ownership in App/UI.
3. Select one bounded migration.
4. Add/update tests.
5. Validate lint, relevant tests and build.

Avoid mass refactoring.
