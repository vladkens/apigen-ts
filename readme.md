# apigen-ts

<div align="center">

[<img src="https://badges.ws/npm/v/apigen-ts" alt="version" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badges.ws/packagephobia/publish/apigen-ts" alt="size" />](https://packagephobia.com/result?p=apigen-ts)
[<img src="https://badges.ws/npm/dm/apigen-ts" alt="downloads" />](https://npmjs.org/package/apigen-ts)
[<img src="https://badges.ws/github/license/vladkens/apigen-ts" alt="license" />](https://github.com/vladkens/apigen-ts/blob/main/LICENSE)
[<img src="https://badges.ws/badge/-/buy%20me%20a%20coffee/ff813f?icon=buymeacoffee&label" alt="donate" />](https://buymeacoffee.com/vladkens)

</div>

<div align="center">
  <img src="./logo.svg" alt="apigen-ts logo" height="80" />
</div>

**Your OpenAPI spec as one typed file.** apigen-ts turns an OpenAPI or Swagger spec into a TypeScript client you can call right away: a method for every endpoint, a type for every schema, plain `fetch`, no runtime dependencies.

```sh
pnpm add -D apigen-ts
pnpm apigen-ts ./openapi.yaml ./api-client.ts
```

```ts
import { ApiClient } from "./api-client"

const api = new ApiClient({ baseUrl: "https://api.example.com" })

const pet = await api.pet.getPetById(1) // GET https://api.example.com/pet/1 → Pet
const sold = await api.pet.findPetsByStatus({ status: "sold" }) // → Pet[]
await api.pet.updatePet({ ...pet, status: "sold" })
```

The generated `api-client.ts` is plain code you can read:

```ts
export class ApiClient {
  // ~100 lines: fetch, headers, errors

  pet = {
    getPetById: (petId: number) => {
      return this.Fetch<Pet>("GET", `/pet/${this.EncodePathParam(petId)}`, {})
    },
    // …one method per endpoint
  }
}

export type Pet = {
  id?: number
  name: string
  status?: "available" | "pending" | "sold"
  // …
}
```

## Why apigen-ts

- **One file you own.** Commit it, review it in a PR, see what changed when the API changes. Nothing to install at runtime, nothing hidden in `node_modules`, and a coding agent can read the whole client at once.
- **Methods, not URL strings.** `api.pet.getPetById(1)` takes typed arguments and resolves to the typed response body. Non-2xx responses throw.
- **Any spec.** Swagger 2.0 and OpenAPI 3.0, 3.1 and 3.2, JSON or YAML, from a file or a URL.
- **Correct requests.** Path params are URL-encoded, query arrays follow the spec's `style` and `explode`, `undefined` values are left out.
- **Pure Node.js.** No Java, no Docker, no config file. The client type-checks with TypeScript 5, 6 and 7.
- **Big specs welcome.** Keep only the paths or tags you use (Cloudflare's spec is 8 MB).
- **Small extras.** `Date` parsing, string unions instead of enums, `AbortSignal` and other fetch options per call, formatting with your Prettier config.

## Install

```sh
pnpm add -D apigen-ts
```

## Generate

```sh
# from a file, JSON or YAML
pnpm apigen-ts ./openapi.yaml ./api-client.ts

# from a URL
pnpm apigen-ts https://petstore3.swagger.io/api/v3/openapi.json ./api-client.ts

# from a protected URL
pnpm apigen-ts https://secret-api.example.com ./api-client.ts -H "x-api-key: secret-key"

# to stdout
pnpm apigen-ts ./openapi.json > ./api-client.ts
```

See the [generated examples](./examples/).

## Options

| Flag                    | Node.js API    | Default     | Effect                                                                            |
| ----------------------- | -------------- | ----------- | --------------------------------------------------------------------------------- |
| `--name`                | `name`         | `ApiClient` | Name of the generated class                                                       |
| `--parse-dates`         | `parseDates`   | `false`     | `date-time` fields become `Date` objects, in types and in responses               |
| `--inline-enums`        | `inlineEnums`  | `false`     | String unions instead of `enum`s, for Node.js [type stripping][type-stripping]    |
| `--fetch-options`       | `fetchOptions` | `false`     | Adds an optional last argument to every method with [fetch options][request-init] |
| `--filter-paths <re>`   | `filterPaths`  | –           | Keeps only paths matching a regex; the Node.js API also takes a function          |
| `--include-tags <tags>` | `includeTags`  | –           | Keeps only operations with these tags, comma-separated or repeated                |
| `--exclude-tags <tags>` | `excludeTags`  | –           | Drops operations with these tags; wins over `--include-tags`                      |
| `-H "key: value"`       | `headers`      | –           | HTTP header for downloading the spec; the client does not get it                  |
| –                       | `resolveName`  | –           | Your own `[namespace, method]` names, see [Node.js API](#nodejs-api)              |

[type-stripping]: https://nodejs.org/api/typescript.html#type-stripping
[request-init]: https://developer.mozilla.org/en-US/docs/Web/API/RequestInit

```sh
pnpm apigen-ts ./openapi.json ./api-client.ts --parse-dates --inline-enums
pnpm apigen-ts ./openapi.json ./api-client.ts --filter-paths '^/accounts'
pnpm apigen-ts ./openapi.json ./api-client.ts --include-tags pets,store --exclude-tags internal
```

## Usage

### Auth and headers

`headers` is an object or a function, sync or async, called before every request:

```ts
const api = new ApiClient({
  baseUrl: "https://example.com/api",
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
})

// or change them later, e.g. after login
api.Config.headers = { Authorization: "Bearer token" }
```

### Cancel a request

With `--fetch-options`, every method takes any [fetch option][request-init] as its last argument:

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 1000)
await api.pet.getPetById(1, { signal: controller.signal })

await api.pet.getPetById(1, { redirect: "manual" })
```

### Errors

Non-2xx responses throw the parsed JSON body, or the `Response` itself when the body is not JSON. Override `ParseError` to change what is thrown:

```ts
try {
  await api.pet.getPetById(404)
} catch (e) {
  console.log(e) // the error body from the server
}

class MyClient extends ApiClient {
  async ParseError(rep: Response) {
    return { code: "API_ERROR", status: rep.status }
  }
}
```

### Base URL

Paths are resolved with [`new URL(path, baseUrl)`](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL), so a path starting with `/` replaces the base path:

- `new URL("/v2/cats", "https://example.com/v1/")` → `https://example.com/v2/cats`
- `new URL("v2/cats", "https://example.com/v1/")` → `https://example.com/v1/v2/cats`

Override `PrepareFetchUrl` to join them instead (see [#2](https://github.com/vladkens/apigen-ts/issues/2)):

```ts
class MyClient extends ApiClient {
  PrepareFetchUrl(path: string) {
    return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
  }
}

const api = new MyClient({ baseUrl: "https://example.com/v1" })
await api.pet.getPetById(1) // → https://example.com/v1/pet/1
```

`Fetch`, `EncodePathParam` and `JoinQueryParam` can be overridden the same way.

### Node.js API

```ts
import { apigen } from "apigen-ts"

await apigen({
  source: "https://petstore3.swagger.io/api/v3/openapi.json",
  output: "./api-client.ts",
  // optional, see Options
  name: "PetstoreClient",
  parseDates: true,
  filterPaths: (path) => path.startsWith("/pet"),
  includeTags: ["pet", "store"],
  headers: { "x-api-key": "secret-key" },
  resolveName(ctx, op, proposal) {
    // proposal is [namespace, method]
    if (proposal[0] === "pet") return // keep the default

    const [a, b] = op.path.split("/").slice(3, 5) // /api/v1/store/items/search
    return [a, `${op.method}_${b}`] // → api.store.get_items()
  },
})
```

### FastAPI

FastAPI makes long `operationId`s like `read_items_items__get`. Give them short names before exporting the spec:

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

## Compared to others

|                                                                                                                                            | Output                    | A call                                                           | Returns                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| **apigen-ts**                                                                                                                              | one file, no runtime deps | `api.pet.getPetById(1)`                                          | the body, throws on errors                      |
| [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) + [openapi-fetch](https://github.com/openapi-ts/openapi-typescript) | types + a runtime package | `client.GET("/pet/{petId}", { params: { path: { petId: 1 } } })` | `{ data, error }`                               |
| [@hey-api/openapi-ts](https://github.com/hey-api/hey-api)                                                                                  | a folder of files         | `getPetById({ path: { petId: 1 } })`                             | `{ data, error }` by default                    |
| [swagger-typescript-api](https://github.com/acacode/swagger-typescript-api)                                                                | one file                  | `api.pet.getPetById(1)`                                          | a `Response` with `data` and `error` by default |

Need React Query hooks, Zod schemas or mocks? Take [@hey-api/openapi-ts](https://github.com/hey-api/hey-api) or [orval](https://github.com/orval-labs/orval). apigen-ts makes the client and nothing else.

## License

[MIT](LICENSE)
