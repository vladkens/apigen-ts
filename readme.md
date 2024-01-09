# apigen-ts

<div align="center">

[<img src="https://badgen.net/npm/v/apigen-ts" alt="version" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badgen.net/packagephobia/publish/apigen-ts" alt="size" />](https://packagephobia.now.sh/result?p=apigen-ts)
[<img src="https://badgen.net/npm/dm/apigen-ts" alt="downloads" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badgen.net/github/license/vladkens/apigen-ts" alt="license" />](https://github.com/vladkens/apigen-ts/blob/main/LICENSE)
[<img src="https://badgen.net/static/-/buy%20me%20a%20coffee/ff813f?icon=buymeacoffee&label" alt="donate" />](https://buymeacoffee.com/vladkens)

</div>

<div align="center">
  <img src="./logo.svg" alt="apigen-ts logo" height="80" />
</div>

<div align="center">
  TypeScript HTTP Client Generator from OpenAPI Specification
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

### 1. Generate

```sh
# From url
yarn apigen-ts https://petstore3.swagger.io/api/v3/openapi.json ./api-client.ts

# From file
yarn apigen-ts ./openapi.json ./api-client.ts
```

Run `yarn apigen-ts --help` for more options. See examples of generated clients [here](./examples/).

### 2. Import

```ts
import { ApiClient } from "./api-client"

const api = new ApiClient({
  baseUrl: "https://example.com/api",
  headers: { Authorization: "secret-token" },
})
```

### 3. Use

```ts
// GET /pet/{petId}
await api.pet.getPetById(1) // -> Pet

// GET /pet/findByStatus?status=sold
await api.pet.findPetsByStatus({ status: "sold" }) // -> Pets[]

// PUT /user/{username}; second arg body with type User
await api.user.updateUser("username", { firstName: "John" })
```

## Advanced

### Login flow

```ts
const { token } = await api.auth.login({ usename, password })
api.Config.headers = { Authorization: token }

await api.protectedRoute.get() // here authenticated
```

### Automatic date parsing

```sh
yarn apigen-ts ./openapi.json ./api-client.ts --parse-dates
```

```ts
const pet = await api.pet.getPetById(1)
const createdAt: Date = pet.createdAt // date parsed from string with format=date-time
```

### NodeJS API

Create file like `apigen.mjs` with content:

```js
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
