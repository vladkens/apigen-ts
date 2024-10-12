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
  <div>Simple typed OpenAPI client generator</div>
</div>

## Features

- Generates ready to use `ApiClient` with types (using `fetch`)
- Single output file, minimal third-party code
- Loads schemas from JSON / YAML, locally and remote
- Ability to customize `fetch` with your custom function
- Automatic formating with Prettier
- Can parse dates from date-time format (`--parse-dates` flag)
- Support OpenAPI v2, v3, v3.1
- Can be used with npx as well

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

Run `yarn apigen-ts --help` for more options. Examples of generated clients [here](./examples/).

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

### Errors handling

An exception will be thrown for all unsuccessful return codes.

```ts
try {
  const pet = await api.pet.getPetById(404)
} catch (e) {
  console.log(e) // parse error depend of your domain model, e is awaited response.json()
}
```

Also you can define custom function to parse error:

```ts
class MyClient extends ApiClient {
  async ParseError(rep: Response) {
    // do what you want
    return { code: "API_ERROR" }
  }
}

try {
  const api = new MyClient()
  const pet = await api.pet.getPetById(404)
} catch (e) {
  console.log(e) // e is { code: "API_ERROR" }
}
```

### Base url resolving

You can modify how the endpoint url is created. By default [URL constructor](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL) used to resolve endpoint url like: `new URL(path, baseUrl)` which has specific resolving [rules](https://developer.mozilla.org/en-US/docs/Web/API/URL_API/Resolving_relative_references). E.g.:

- `new URL("/v2/cats", "https://example.com/v1/") // -> https://example.com/v2/cats`
- `new URL("v2/cats", "https://example.com/v1/") // -> https://example.com/v1/v2/cats`

If you want to have custom endpoint url resolving rules, you can override `PrepareFetchUrl` method. For more details see [issue](https://github.com/vladkens/apigen-ts/issues/2).

```ts
class MyClient extends ApiClient {
  PrepareFetchUrl(path: string) {
    return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
  }
}

const api = new MyClient({ baseUrl: "https://example.com/v1" })
// will call: https://example.com/v1/pet/ instead of https://example.com/pet/
const pet = await api.pet.getPetById(404)
```

### Node.js API

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

## Usage with different backend frameworks

### FastAPI

By default `apigen-ts` generates noisy method names when used with FastAPI. This can be fixed by [custom resolving](https://fastapi.tiangolo.com/advanced/path-operation-advanced-configuration/#using-the-path-operation-function-name-as-the-operationid) for operations ids.

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


# this function should be after all routes added
update_operation_ids(app)
```

_Note: If you want FastAPI to be added as preset, open PR please._

## Compare

- [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen) ([npm](https://www.npmjs.com/package/openapi-typescript-codegen)): no single file mode [#1263](https://github.com/ferdikoomen/openapi-typescript-codegen/issues/1263#issuecomment-1502890838)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript) ([npm](https://www.npmjs.com/package/openapi-typescript)): low level api; no named types export to use in client code
- [openapi-generator-cli](https://github.com/OpenAPITools/openapi-generator-cli) ([npm](https://www.npmjs.com/package/@openapitools/openapi-generator-cli)): wrapper around java lib
- [swagger-typescript-api](https://github.com/acacode/swagger-typescript-api) ([npm](https://www.npmjs.com/package/swagger-typescript-api)): complicated configuration; user-api breaking changes between versions

## Development

- https://ts-ast-viewer.com
- https://jsonschemalint.com
- https://redocly.github.io/redoc/
- https://swagger.io/docs/specification/basic-structure/
