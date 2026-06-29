# SmartShip-PRO Architecture

> **Architecture is a long-term decision.**
>
> Every line of code must reinforce the architecture, never weaken it.

---

# 1. Vision

SmartShip-PRO is not simply a nautical navigation application.

It is a **Maritime Situational Awareness Platform**.

The software must assist the navigator in understanding the surrounding environment quickly, accurately and with the lowest possible cognitive load.

The application is composed of independent engines.

Each engine has one responsibility.

---

# 2. Core Principles

## Single Responsibility

Every module has exactly one responsibility.

A module should only change for one reason.

---

## Separation of Concerns

Rendering.

Navigation.

AIS.

Weather.

Radar.

Artificial Intelligence.

Persistence.

All of them evolve independently.

---

## Domain Driven Design

The code should describe the maritime domain.

Classes should represent real concepts.

Examples:

* Contact
* Vessel
* Waypoint
* Route
* Harbour
* Danger Area
* Radar Echo

Never generic names.

---

## Low Coupling

Modules should know as little as possible about each other.

Dependencies always point downward.

Never upward.

---

# 3. Architecture Layers

```text
+------------------------------------------------------+
|                     User Interface                   |
+------------------------------------------------------+
|                 Tactical Rendering Engine            |
+------------------------------------------------------+
|             Maritime Intelligence Engine            |
+------------------------------------------------------+
| Tactical | Navigation | AIS | Weather | Sensors     |
+------------------------------------------------------+
|               Persistence / Services                |
+------------------------------------------------------+
|              React / Electron / Leaflet             |
+------------------------------------------------------+
```

External libraries are implementation details.

The architecture must survive if any framework changes.

---

# 4. Engines

## Tactical Engine

Responsibilities:

* Contact management
* Tactical rules
* Contact prioritization
* Threat evaluation
* Contact classification

Never draws anything.

---

## Rendering Engine

Responsibilities:

* Visual representation
* Icons
* SVG
* Themes
* Zoom scaling
* Labels
* Animations

Never calculates navigation.

---

## Navigation Engine

Responsibilities:

* Routes
* Bearings
* Distance
* CPA
* TCPA
* ETA

Pure navigation algorithms.

---

## AIS Engine

Responsibilities:

* AIS decoding
* AIS contact updates
* Ship information

No rendering.

---

## Weather Engine

Responsibilities:

* Wind
* Waves
* Pressure
* Forecast
* Weather overlays

---

## Sensor Engine

Responsibilities:

* Radar
* GPS
* Compass
* External devices

---

## Maritime Intelligence Engine

Responsibilities:

* Pattern recognition
* Situation assessment
* Recommendations
* Future prediction

Never takes control from the navigator.

Only recommends.

---

## Alert Engine

Responsibilities:

* Alarm generation
* Priority management
* Notification filtering

---

## Data Engine

Responsibilities:

* Persistence
* Synchronization
* Import / Export
* Local cache

---

# 5. Contact Model

Every object displayed on the chart is a Contact.

Examples:

* Own Ship
* AIS Vessel
* Radar Contact
* Waypoint
* Harbour
* MOB
* Buoy
* Route
* Danger Area
* Weather Cell

Everything derives from the same concept.

---

# 6. Rendering Philosophy

The Tactical Engine never draws.

The Rendering Engine never thinks.

The UI never contains business logic.

---

# 7. Dependency Rules

Allowed:

UI
↓

Rendering
↓

Tactical
↓

Navigation / AIS / Weather / Sensors
↓

Persistence

Forbidden:

Navigation → UI

AIS → Rendering

Rendering → Navigation

UI → Tactical calculations

---

# 8. Performance

Performance is a feature.

SmartShip-PRO must remain responsive with large numbers of contacts.

Every rendering decision must consider scalability.

---

# 9. Artificial Intelligence

Artificial Intelligence assists.

Artificial Intelligence never replaces the navigator.

Recommendations are always explainable.

The final decision always belongs to the human.

---

# 10. Future Expansion

The architecture must allow adding:

* New vessel types
* New sensors
* New map providers
* New rendering styles
* AI modules
* Plugins

without redesigning the system.

---

# Golden Rule

> Before writing code we must know:

* Why it exists.
* Which engine owns it.
* Which responsibility it has.
* Which dependencies it introduces.

Only then should implementation begin.
