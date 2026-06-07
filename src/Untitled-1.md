# GitHub Copilot Toolbox — Intelligence readiness

Run commands from the Command Palette (`GitHub Copilot Toolbox: …`) or the **MCP & skills** hub.

## ✓ copilot-instructions
`.github/copilot-instructions.md` looks populated.
- Suggested: `GitHubCopilotToolBox.openInstructionsPicker`

## ✓ path-instructions
No `.github/instructions/*.instructions.md` files (optional path-scoped rules).
- Suggested: `GitHubCopilotToolBox.syncCursorRules`

## ✓ agents-md
`AGENTS.md` looks populated.
- Suggested: `GitHubCopilotToolBox.openInstructionsPicker`

## ✓ memory-bank
`memory-bank/` directory present.
- Suggested: `GitHubCopilotToolBox.initMemoryBank`

## ○ mcp-json
Workspace `.vscode/mcp.json` missing.
- Suggested: `GitHubCopilotToolBox.portCursorMcp`

## ✓ cursorrules
Cursor rules (`.cursorrules` and/or `.cursor/rules`) present.
- Suggested: `GitHubCopilotToolBox.createCursorrulesTemplate`

## ✓ cursorrules-mtime
`.github/copilot-instructions.md` is at least as new as `.cursorrules` (by modified time).
- Suggested: `GitHubCopilotToolBox.appendCursorrules`
