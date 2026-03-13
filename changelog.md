# Changelog

## v1.3.0 — 2026-03-14

### Features

- Filter endpoints by path and tags when generating the client
- AbortController support for canceling in-flight requests
- Support for constant string types in schemas

### Bug Fixes

- Fixed compatibility with `exactOptionalPropertyTypes` TypeScript compiler option
- Fixed negative numbers not being recognized in inline enums
- Fixed early `$ref` in response schemas not being resolved correctly
- Fixed `nullable` being ignored when combined with object properties

[v1.2.1...v1.3.0](https://github.com/vladkens/apigen-ts/compare/v1.2.1...v1.3.0)

---

## v1.2.1 — 2025-05-15

- Added support for tuple types in generated TypeScript definitions

[v1.2.0...v1.2.1](https://github.com/vladkens/apigen-ts/compare/v1.2.0...v1.2.1)

---

## v1.2.0 — 2025-04-09

- Added support for custom HTTP headers to access protected APIs

[v1.1.0...v1.2.0](https://github.com/vladkens/apigen-ts/compare/v1.1.0...v1.2.0)

---

## v1.1.0 — 2025-01-19

- Inline enums are now generated as TypeScript union types

[v1.0.1...v1.1.0](https://github.com/vladkens/apigen-ts/compare/v1.0.1...v1.1.0)

---

## v1.0.1 — 2024-11-09

- npm packages are now published with provenance attestations for supply chain transparency

[v1.0.0...v1.0.1](https://github.com/vladkens/apigen-ts/compare/v1.0.0...v1.0.1)

---

## v1.0.0 — 2024-10-12

### Features

- Support for `additionalProperties` in object schemas
- Optional headers factory in client configuration for dynamic request headers

[v0.2.0...v1.0.0](https://github.com/vladkens/apigen-ts/compare/v0.2.0...v1.0.0)

---

## v0.2.0 — 2024-09-04

- Added ability to build custom endpoint URLs

[v0.1.2...v0.2.0](https://github.com/vladkens/apigen-ts/compare/v0.1.2...v0.2.0)

---

## v0.1.2 — 2024-01-16

- Made generated interfaces public so they can be extended or overridden

[v0.1.1...v0.1.2](https://github.com/vladkens/apigen-ts/compare/v0.1.1...v0.1.2)

---

## v0.1.1 — 2024-01-10

### Bug Fixes

- Fixed TypeScript errors in Node.js environments
- Fixed Prettier config file resolution

[v0.1.0...v0.1.1](https://github.com/vladkens/apigen-ts/compare/v0.1.0...v0.1.1)

---

## v0.1.0 — 2023-12-20

Initial release of apigen-ts.

### Features

- TypeScript client generation from OpenAPI schemas
- Support for `application/x-www-form-urlencoded` and request credentials
- Programmatic API for integration into build pipelines

[v0.1.0 history](https://github.com/vladkens/apigen-ts/commits/v0.1.0)

---
