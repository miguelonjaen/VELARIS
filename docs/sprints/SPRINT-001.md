# Sprint 001 - Foundation

## Goal

Build the foundations of VELARIS-PRO without changing the application's behaviour.

The objective of this sprint is not to add visible functionality.

The objective is to establish the project's core architecture.

---

# User Stories

## US-001

Create the Contact domain model.

Status:

✅ Completed

---

## US-002

Implement ContactRepository.

Status:

🟡 In Progress

---

## US-003

Implement generic repository abstraction.

Status:

🟡 In Progress

---

## US-004

Connect Tactical Engine with the repository.

Status:

⬜ Pending

---

## US-005

Connect Rendering Engine with Tactical Engine.

Status:

⬜ Pending

---

# Decisions

* Architecture before implementation.
* Domain Driven Design.
* Every object displayed on the chart is a Contact.
* Rendering and business logic remain separated.
* Repositories abstract the storage implementation.
* VELARIS is composed of independent engines.

---

# Deliverables

* Contact model
* Repository abstraction
* Memory repository
* Contact repository
* Tactical Engine skeleton

---

# Definition of Done

Sprint 001 is complete when:

* The application compiles.
* Existing behaviour is preserved.
* Contacts can be stored and retrieved.
* Tactical Engine can access the repository.
* Rendering Engine receives Contacts instead of raw AIS data.

---

# Notes

This sprint establishes the technical foundation of the platform.

No user-facing functionality is expected.

Success is measured by architectural quality rather than visible features.
