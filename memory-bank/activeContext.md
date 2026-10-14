# Active context

**Current focus:** VELARIS CORE — Phase 3A/3B completed and validated.

## Current architecture

The canonical domain flow is:

SimulationService / NMEA / other telemetry source
    ↓
TelemetryService
    ↓
VelarisCore
    ↓
NavigationAdapter
    ↓
NavigationEngine
    ↓
navigation metrics
    ↓
VelarisCore / UI

### Core ownership

- `VelarisCore` is the central canonical domain state.
- `NavigationEngine` is pure/stateless and calculates navigation metrics.
- `NavigationAdapter` connects `VelarisCore` state with `NavigationEngine`.
- `TelemetryService` is the telemetry bridge into `VelarisCore`.
- `SimulationService` is a telemetry/source simulator, NOT a second navigation engine.
- `CoreState` remains as temporary compatibility infrastructure.

### Simulation

`SimulationService.tick()` generates GPS telemetry containing:

- position
- SOG
- COG
- timestamp

It does NOT generate:

- BTW
- DTW
- XTE
- ETA
- `nav`

Internal distance/DTW calculations used only to move the simulated vessel are allowed and are not emitted as navigation metrics.

### Navigation

Navigation metrics are calculated by `NavigationEngine` and exposed through:

`core.getState().navigation`

The navigation pipeline is responsible for:

- distance / DTW
- bearing / BTW
- signed XTE
- ETA
- waypoint-related navigation calculations

Simulation waypoint progression must not mutate `VelarisCore.activeWaypointIndex`.

### HDG / COG

COG comes from GPS telemetry.

Heading is an independent telemetry value.

The system must NOT derive heading from COG automatically.

## Phase 3 validation

Phase 3A — SimulationService / telemetry architecture:
- Completed.
- Legacy `NavigationSimulationData` removed.
- `simulateNavigationData()` removed.
- Legacy navigation simulation block removed from `App.tsx`.
- `SimulationService` no longer emits `gpsMessage.nav`.

Phase 3B — Simulation End-to-End:
- Completed.
- `SimulationService → TelemetryService → VelarisCore → NavigationAdapter → NavigationEngine` validated.
- Integration test: 23/23 passed.
- `npm run lint`: passed.
- Full Vitest run: 283 tests passed.
- 4 empty legacy test files still report `No test suite found`; these are pre-existing and are not part of the Phase 3 failure analysis.
- `npm run build`: passed.

## Important architectural rule

Do not reintroduce navigation calculations into `SimulationService`, `TelemetryService`, `App.tsx`, React hooks, or UI components.

Navigation calculations belong to `NavigationEngine`.

Do not create additional `VelarisCore` instances from React/components/hooks/pages.

Application owns the production Core instance.

## Next work

Before starting a new functional phase, audit remaining ownership boundaries in `App.tsx` and identify the next safe incremental migration.

Do not perform a mass rewrite.
Do not modify unrelated functionality.
Prefer small, testable migrations with explicit ownership.
