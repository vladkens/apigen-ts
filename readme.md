# apigen-ts

<div align="center">

[<img src="https://badges.ws/npm/v/apigen-ts" alt="version" />](https://npmjs.org/package/apigen-ts)
[<img src="https://packagephobia.com/badge?p=array-utils-ts" alt="size" />](https://packagephobia.now.sh/result?p=apigen-ts)
[<img src="https://badges.ws/npm/dm/apigen-ts" alt="downloads" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badges.ws/github/license/vladkens/apigen-ts" alt="license" />](https://github.com/vladkens/apigen-ts/blob/main/LICENSE)
[<img src="https://badges.ws/badge/-/buy%20me%20a%20coffee/ff813f?icon=buymeacoffee&label" alt="donate" />](https://buymeacoffee.com/vladkens)

</div>

<div align="center">
  <img src="./logo.svg" alt="apigen-ts logo" height="80" />
</div>

Turn your OpenAPI spec into a typed TypeScript client with one command.

- **One file.** Outputs a single `api-client.ts` — no scattered modules, no runtime deps in generated code.
- **Fully typed.** Every method returns the exact response type from your schema. No casting, no `any`.
- **Pure Node.js.** No Java, no Docker. Works with `npx` in any project.
- **Fetch-based.** Uses native `fetch`. Override it with your own function for auth, retries, or logging.
- **All OpenAPI versions.** Supports v2 (Swagger), v3, and v3.1 — auto-upgrades v2 on the fly.
- **Extras built in.** Automatic date parsing, string literal unions instead of enums, Prettier formatting.
- **Filterable.** Include or exclude endpoints by path regex or tag — essential for large schemas.

Unlike `openapi-typescript`, it generates a ready-to-call client — not just types. Unlike `openapi-generator-cli`, it's pure Node.js with zero Java dependency. Unlike `openapi-typescript-codegen`, it outputs a single file.

## Install

```sh
npm i apigen-ts --save-dev
```

## Usage

### 1. Generate

```sh
# From a local file
npx apigen-ts ./openapi.json ./api-client.ts

# From a URL
npx apigen-ts https://petstore3.swagger.io/api/v3/openapi.json ./api-client.ts

# From a protected URL
npx apigen-ts https://secret-api.example.com ./api-client.ts -H "x-api-key: secret-key"
```

Run `npx apigen-ts --help` for all options. See [generated examples](./examples/).

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
await api.pet.getPetById(1) // → Pet

// GET /pet/findByStatus?status=sold
await api.pet.findPetsByStatus({ status: "sold" }) // → Pet[]

// PUT /user/{username} — second arg is typed request body
await api.user.updateUser("username", { firstName: "John" })
```

## Advanced

### Login flow

```ts
const { token } = await api.auth.login({ username, password })
api.Config.headers = { Authorization: token }

await api.protectedRoute.get() // authenticated
```

### Automatic date parsing

```sh
npx apigen-ts ./openapi.json ./api-client.ts --parse-dates
```

```ts
const pet = await api.pet.getPetById(1)
const createdAt: Date = pet.createdAt // parsed from format=date-time string
```

### String unions instead of enums

Pass `--inline-enums` to generate string literal unions — useful for Node.js [type stripping](https://nodejs.org/api/typescript.html#type-stripping):

```sh
npx apigen-ts ./openapi.json ./api-client.ts --inline-enums
```

```ts
// Generated:
type MyEnum = "OptionA" | "OptionB"

// Instead of:
enum MyEnum {
  OptionA = "OptionA",
  OptionB = "OptionB",
}
```

### Filter by path

Include only the endpoints you need — useful with large schemas (e.g. Cloudflare's 8 MB monolith):

```sh
npx apigen-ts ./openapi.json ./api-client.ts --filter-paths '^/accounts'
```

### Filter by tag

```sh
# include only endpoints tagged "pets" or "store"
npx apigen-ts ./openapi.json ./api-client.ts --include-tags pets,store

# exclude endpoints tagged "internal"
npx apigen-ts ./openapi.json ./api-client.ts --exclude-tags internal
```

When both flags are set, `--exclude-tags` wins.

### AbortController / cancellation

Pass `--fetch-options` to add an optional last argument to every generated method, accepting any [`RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) field (including `signal`):

```sh
npx apigen-ts ./openapi.json ./api-client.ts --fetch-options
```

```ts
const controller = new AbortController()
await api.pet.getPetById(1, { signal: controller.signal })

// cancel the request
controller.abort()
```

### Error handling

Non-2xx responses throw — the caught value is the parsed response body:

```ts
try {
  await api.pet.getPetById(404)
} catch (e) {
  console.log(e) // awaited response.json()
}
```

Override `ParseError` to control the shape:

```ts
class MyClient extends ApiClient {
  async ParseError(rep: Response) {
    return { code: "API_ERROR" }
  }
}
```

### Base URL resolving

By default uses the [URL constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL): `new URL(path, baseUrl)`. Notable behavior:

- `new URL("/v2/cats", "https://example.com/v1/")` → `https://example.com/v2/cats`
- `new URL("v2/cats", "https://example.com/v1/")` → `https://example.com/v1/v2/cats`

Override `PrepareFetchUrl` to change this (see [#2](https://github.com/vladkens/apigen-ts/issues/2)):

```ts
class MyClient extends ApiClient {
  PrepareFetchUrl(path: string) {
    return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
  }
}

const api = new MyClient({ baseUrl: "https://example.com/v1" })
await api.pet.getPetById(1) // → https://example.com/v1/pet/1
```

### Node.js API

```js
import { apigen } from "apigen-ts"

await apigen({
  source: "https://petstore3.swagger.io/api/v3/openapi.json",
  output: "./api-client.ts",
  // optional:
  name: "MyApiClient", // default: "ApiClient"
  parseDates: true, // default: false
  inlineEnums: false, // default: false
  fetchOptions: true, // default: false
  filterPaths: /^\/pets/, // only include paths matching regex
  includeTags: ["pets", "store"], // only include these tags
  excludeTags: ["internal"], // exclude these tags (wins over includeTags)
  headers: { "x-api-key": "secret-key" },
  resolveName(ctx, op, proposal) {
    // proposal is [namespace, methodName]
    if (proposal[0] === "users") return // use default

    const [a, b] = op.name.split("/").slice(3, 5) // /api/v1/store/items/search
    return [a, `${op.method}_${b}`] // → api.store.get_items()
  },
})
```

## Usage with FastAPI

By default, FastAPI generates verbose `operationId`s. Fix with a custom resolver:

```py
from fastapi import FastAPI
from fastapi.routing import APIRoute

app = FastAPI()

# add your routes here

def update_operation_ids(app: FastAPI) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute):
            ns = route.tags[0] if route.tags else "general"
            route.operation_id = f"{ns}_{route.name}".lower()

# call after all routes are added
update_operation_ids(app)
```

## Alternatives

| Package                                                                                 | Issue                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen) | No single-file output ([#1263](https://github.com/ferdikoomen/openapi-typescript-codegen/issues/1263#issuecomment-1502890838)) |
| [openapi-typescript](https://github.com/drwpow/openapi-typescript)                      | Low-level types only — no callable client, no named type exports                                                               |
| [openapi-generator-cli](https://github.com/OpenAPITools/openapi-generator-cli)          | Wraps a Java library                                                                                                           |
| [swagger-typescript-api](https://github.com/acacode/swagger-typescript-api)             | Complex config, breaking API changes between versions                                                                          |

## Development

- https://ts-ast-viewer.com
- https://jsonschemalint.com
- https://redocly.github.io/redoc/
- https://swagger.io/docs/specification/basic-structure/
