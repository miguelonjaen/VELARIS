# VELARIS — AI Agent Instructions

## Project

Velaris is a professional marine navigation application.

The existing codebase is authoritative.

## Core principles

- Inspect existing code before proposing or making changes.
- Never invent files, components, services, APIs, architecture, or project structure.
- Prefer modifying existing implementations over creating parallel implementations.
- Keep changes focused on the requested task.
- Do not modify unrelated files.
- Preserve existing public APIs and contracts unless the task explicitly requires changing them.
- Verify assumptions against the actual source code.
- If an important requirement is ambiguous, ask before making a potentially breaking change.

## Repository exploration

- Do NOT scan the entire repository unless explicitly required.
- Start from the files directly related to the task.
- Follow imports and references only when necessary.
- Avoid reading large unrelated directories.
- Do not inspect generated files, build output, dependencies, or caches unless specifically required.

## Changes

Before editing:

1. Identify the relevant files.
2. Understand the existing implementation.
3. Check types, interfaces, and callers affected by the change.
4. Explain any significant risk.

After editing:

1. Review the changed code.
2. Check for type errors or obvious regressions.
3. Run the most relevant tests or build command when practical.

## Dependencies

- Do not add, remove, or upgrade dependencies without explicit approval.
- Do not change framework versions or build tooling as part of an unrelated task.

## Safety

- Never delete files or directories without explicit approval.
- Never perform destructive Git operations without explicit approval.
- Never modify secrets, credentials, or environment files unless explicitly requested.
- Never overwrite working code simply because another implementation looks cleaner.

## Accuracy

When analyzing code:

- Distinguish verified facts from assumptions.
- If a previous conclusion is contradicted by the source code, explicitly correct it.
- Prefer a smaller verified change over a larger speculative refactor.

## Evidence

- Do not claim that a file, directory, component, service, hook, event, API, or architecture element exists unless it has been verified in the current task or is explicitly documented by the project instructions.
- Never rely on assumptions from previous tasks when making claims about the current codebase.
