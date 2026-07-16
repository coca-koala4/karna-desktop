# Karna Desktop

Karna Desktop is the Electron application in this repository. Product documentation and Windows downloads live in the [root README](../../README.md).

## Run locally

```powershell
npm ci
npm --prefix apps/desktop run dev
```

## Build Windows NSIS

The release guard requires a clean Git working tree.

```powershell
npm --prefix apps/desktop run dist:win:nsis
```

Artifacts are written to `apps/desktop/release/`.

## Verification

```powershell
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run test:contracts
npm --prefix apps/desktop run test:desktop:platforms
npm --prefix apps/desktop run test:writer-os
npm --prefix apps/desktop run test:desktop:nsis
```

Packaged releases include only the Electron application, required runtime dependencies, versioned built-in Skills/plugins/workflows, and release manifests. User conversations, models, projects, Souls, workflows, and `karna-data` are never release inputs.
