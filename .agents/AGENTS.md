# Customization Rules for Antigravity

## Golden Rules for Windows / PowerShell Environment
1. **No Unix Statement Chaining**: Never use `&&` to chain commands in PowerShell. Separated commands must be run on separate lines or separated by a semicolon `;`.
2. **Workspace Boundaries**: All Angular application code resides strictly under `emulador/src/app/`. Editing or creating code files under the root `src/app/` is strictly prohibited.
3. **Execution Scripts (SDD)**: For Subagent-Driven Development (SDD) tasks, use scripts inside `.agents/skills/superpowers/skills/subagent-driven-development/scripts/` via `bash`:
   - `task-brief`: Extracts the task text into a `.md` brief.
   - `review-package`: Compiles commit list, file stats, and net diff with context into a `.diff` file.
   - `sdd-workspace`: Resolves the absolute path to `.superpowers/sdd/`.

## SDD Workflow Steps
- **Planification**: Declare task objective, files affected (with absolute `file:///` paths), and technical DoD criteria.
- **Implementer Assignment**: Use `task-brief` to extract the brief, and dispatch the implementer subagent (`self`) referencing the generated brief path and expected report path.
- **Review Package Generation**: Once done, run `review-package [BASE_SHA] HEAD` to package the diff.
- **Auditor Assignment**: Dispatch the auditor subagent (`self`) to review the package and output verdict (Spec Compliance: ✅/❌/⚠️).
- **Hardening Gates**: Run `npx tsc -p tsconfig.app.json --noEmit` and `npm run build` inside `emulador/` for every approved task.
- **Ledger Update**: Record completion in `.superpowers/sdd/progress.md`.
