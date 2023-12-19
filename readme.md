# apigen-ts

<div align="center">

[<img src="https://badgen.net/npm/v/apigen-ts" alt="version" />](https://npmjs.org/package/apigen-ts)
[<img src="https://github.com/vladkens/apigen-ts/workflows/test/badge.svg" alt="test status" />](https://github.com/vladkens/apigen-ts/actions)
[<img src="https://badgen.net/packagephobia/publish/apigen-ts" alt="size" />](https://packagephobia.now.sh/result?p=apigen-ts)
[<img src="https://badgen.net/npm/dm/apigen-ts" alt="downloads" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badgen.net/github/license/vladkens/apigen-ts" alt="license" />](https://github.com/vladkens/apigen-ts/blob/main/LICENSE)

</div>

<div align="center">
  <img src="./logo.svg" alt="apigen-ts logo" height="80" />
</div>

<div align="center">
  TypeScript api client generator from OpenAPI specification
</div>

## Features

- Generates ready to use `ApiClient` with types (using `fetch`)
- Single output file, minimal third-party code
- Load schema from JSON / YAML, locally and remote
- Ability to customize `fetch` with your custom function
- Uses `type` instead of `interface`, no problem with declaration merging
- Automatic formating with Prettier
- Can parse dates from date-time format (`--parse-dates` flag)
- Support OpenAPI v2, v3, v3.1

## Install

```sh
yarn install -D apigen-ts
```

## Usage

### Generate

```sh
# From url
yarn apigen-ts https://petstore3.swagger.io/api/v3/openapi.json ./api-client.ts

# From file
yarn apigen-ts ./openapi.json ./api-client.ts
```

Run `yarn apigen-ts --help` for more options. See examples of generated clients [here](./examples/).

### Import

```typescript
import { ApiClient } from "./api-client"

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

// PUT /user/{username}; second arg body with type User
await api.user.updateUser("username", { firstName: "John" })
```

## Advanced

### Login flow

```typescript
const { token } = await api.auth.login({ usename, password })
api.Config.headers = { Authorization: token }

await api.protectedRoute.get() // here authenticated
```

### NodeJS API

Create file like `apigen.mjs` with content:

```javascript
import { apigen } from "apigen-ts"

await apigen({
  source: "https://petstore3.swagger.io/api/v3/openapi.json",
  output: "./api-client.ts",
  // everything below is optional
  name: "MyApiClient", // default "ApiClient"
  parseDates: true, // default false
  resolveName(ctx, op, proposal) {
    // proposal is [string, string] which represents module.funcName
    if (proposal[0] === "users") return // will use default proposal

    const [a, b] = op.name.split("/").slice(3, 5) // eg. /api/v1/store/items/search
    return [a, `${op.method}_${b}`] // [store, 'get_items'] -> apiClient.store.get_items()
  },
})
```

Then run with: `node apigen.mjs`

## Useful for development

- https://ts-ast-viewer.com
- https://jsonschemalint.com
- https://redocly.github.io/redoc/
- https://swagger.io/docs/specification/basic-structure/
