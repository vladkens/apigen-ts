# OpenAPI TypeScript client generator

<div align="center">
  <a href="https://npmjs.org/package/apigen-ts">
    <img src="https://badgen.net/npm/v/apigen-ts" alt="version" />
  </a>
  <a href="https://github.com/vladkens/apigen-ts/actions">
    <img src="https://github.com/vladkens/apigen-ts/workflows/test/badge.svg" alt="test status" />
  </a>
  <a href="https://packagephobia.now.sh/result?p=apigen-ts">
    <img src="https://badgen.net/packagephobia/publish/apigen-ts" alt="size" />
  </a>
  <a href="https://npmjs.org/package/apigen-ts">
    <img src="https://badgen.net/npm/dm/apigen-ts" alt="downloads" />
  </a>
  <a href="https://github.com/vladkens/apigen-ts/blob/main/LICENSE">
    <img src="https://badgen.net/github/license/vladkens/apigen-ts" alt="license" />
  </a>
</div>

## Features

- Generates ready to use ApiClient with types (using `fetch`)
- Single output file, minimal third-party code
- Load schema from JSON / YAML, locally and remote
- Ability to customize `fetch` with your custom function
- Uses `type` instead of `interface`, so no problem with declaration merging
- Automatic formating with Prettier
- Parses dates automatically

## Install

```sh
yarn install -D apigen-ts
```

## Usage

### Generate

```sh
# From url
yarn apigen-ts https://petstore3.swagger.io/api/v3/openapi.json ./api-generated.ts

# From file
yarn apigen-ts ./openapi.json ./api-generated.ts
```

### Import

```typescript
import { ApiClient } from "./api-generated"

const api = new ApiClient({
  baseUrl: "https://example.com/api",
  headers: { Authorization: "secret-token" },
})
```

### Use

```typescript
// GET /pet/{petId}
await api.pet.getPetById(1) // -> Pet

// GET /pet/findByStatus?status=sold
await api.pet.findPetsByStatus({ status: "sold" }) // -> Pets[]

// PUT /user/{username}
await api.user.updateUser("username", { firstName: "John" }) // second arg is body with type User
```

## Advanced

### Login flow

```typescript
const { token } = await api.auth.login({ usename, password })
api.Config.headers = { Authorization: token }

await api.protectedRoute.get() // here authenticated
```

## Useful for development

- https://ts-ast-viewer.com
- https://jsonschemalint.com
- https://redocly.github.io/redoc/
- https://swagger.io/docs/specification/basic-structure/
