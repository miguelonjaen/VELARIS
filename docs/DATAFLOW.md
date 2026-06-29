# SmartShip-PRO Data Flow

> **Data should always move in one direction.**
>
> Every engine transforms information and passes it to the next one.
> No engine should depend on a higher layer.

---

# 1. Philosophy

SmartShip-PRO follows a unidirectional data flow.

Information always moves from raw sensor data to user presentation.

No rendering engine performs calculations.

No UI component contains business logic.

No sensor knows how data will be displayed.

---

# 2. Global Flow

```text
External Sources

AIS
GPS
Radar
Weather
Manual Input
Plugins

        │
        ▼

Data Engine

        │
        ▼

Domain Objects

Contact
OwnShip
Route
Waypoint
WeatherCell

        │
        ▼

Tactical Engine

        │
        ▼

Situation Assessment

Priority
Threat
CPA
TCPA
Visibility
Recommendations

        │
        ▼

Rendering Engine

        │
        ▼

Map Objects

Icons
Labels
Vectors
Animations
Effects

        │
        ▼

User Interface
```

---

# 3. Example: AIS Contact

```text
AIS Message

↓

AIS Engine

↓

AIS Contact

↓

Data Engine

↓

Contact Repository

↓

Tactical Engine

↓

Threat Evaluation

↓

Rendering Engine

↓

Leaflet Marker

↓

Displayed on Screen
```

At no point does the AIS Engine know how the contact is drawn.

---

# 4. Example: Waypoint

```text
User creates Waypoint

↓

Navigation Engine

↓

Waypoint Object

↓

Data Engine

↓

Rendering Engine

↓

Waypoint Symbol
```

The Navigation Engine never creates icons.

---

# 5. Example: Radar Contact

```text
Radar Echo

↓

Sensor Engine

↓

Radar Contact

↓

Tactical Engine

↓

Classification

↓

Rendering Engine

↓

Radar Symbol
```

---

# 6. Rendering Flow

The Rendering Engine receives only domain objects.

Example:

```text
Contact

↓

Renderer Selection

↓

VesselRenderer

↓

SVG Generation

↓

Leaflet Marker

↓

Map
```

The Rendering Engine never modifies navigation data.

---

# 7. Tactical Flow

The Tactical Engine receives contacts.

Its responsibilities include:

* Contact prioritization
* CPA calculation
* TCPA calculation
* Threat level
* Contact classification
* Tactical recommendations

The Tactical Engine never creates visual objects.

---

# 8. User Interaction Flow

```text
User clicks Contact

↓

UI Event

↓

Tactical Engine

↓

Selection State

↓

Rendering Engine

↓

Updated Visualization
```

The UI never changes business data directly.

---

# 9. Artificial Intelligence Flow

```text
Contacts

Weather

Routes

Navigation Data

↓

Maritime Intelligence Engine

↓

Situation Analysis

↓

Recommendations

↓

Tactical Engine

↓

Rendering Engine
```

Artificial Intelligence never controls the vessel.

Its responsibility is recommendation.

---

# 10. Dependency Direction

Allowed:

```text
Sensors

↓

Data

↓

Domain

↓

Tactical

↓

Rendering

↓

UI
```

Forbidden:

```text
UI

↓

Navigation
```

```text
Rendering

↓

AIS
```

```text
Tactical

↓

Leaflet
```

```text
AIS

↓

SVG
```

---

# 11. Design Rule

Every new feature must answer four questions before implementation:

1. Where does the data originate?
2. Which engine owns the data?
3. Which engine transforms the data?
4. Which engine presents the data?

If one module tries to answer more than one of these questions, the design should be reconsidered.

---

# 12. Golden Principle

**Data flows downward.**

**Knowledge flows upward.**

Raw information enters through sensors.

Meaning is added by the Tactical Engine.

Visualization is handled by the Rendering Engine.

Understanding is delivered to the navigator.
