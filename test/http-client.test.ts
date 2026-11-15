import fetchMock from "fetch-mock"
import fs from "fs/promises"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { ApiClient, ApigenDates } from "../src/_template"
import { apigen } from "../src/main"

test("apiClient dates parsing", async () => {
  const t = async <T>(body: T, dates: ApigenDates) => {
    try {
      const baseUrl = "http://localhost"
      const client = new ApiClient({ baseUrl })
      client.DateShapes = { More: { date: true, dates: { "*": true } } }
      fetchMock.mockGlobal()
      fetchMock.route(`${baseUrl}`, { body: JSON.stringify(body) })
      return client.Fetch<T>("get", "/", { dates })
    } finally {
      fetchMock.unmockGlobal()
      fetchMock.removeRoutes()
    }
  }

  const date = new Date("2021-01-01T00:00:00Z")
  const dateStr = date.toISOString()

  const body = { date, dates: [date], more: { date, dates: [date] }, text: date }
  const rs = await t(body, { date: true, dates: { "*": true }, more: "More" })
  equal(rs.date.toISOString(), dateStr)
  equal(rs.dates[0].toISOString(), dateStr)
  equal(rs.more.date.toISOString(), dateStr)
  equal(rs.more.dates[0].toISOString(), dateStr)
  equal(rs.text as unknown, dateStr) // not a date in the schema

  equal(((await t(date, true)) as Date).toISOString(), dateStr)
  equal(await t(date, [{ at: true }, "More"]), dateStr) // a shape for objects keeps strings
})

test("apiClient base url", async () => {
  const t = (c: ApiClient, path: string, expect: string) => {
    equal(c.PrepareFetchUrl(path).toString(), expect)
  }

  const c1 = new ApiClient({ baseUrl: "http://localhost" })
  t(c1, "/", "http://localhost/")
  t(c1, "/api/v1/cats", "http://localhost/api/v1/cats")

  const c2 = new ApiClient({ baseUrl: "https://example.com" })
  t(c2, "/", "https://example.com/")
  t(c2, "/api/v1/cats", "https://example.com/api/v1/cats")

  class MyClient extends ApiClient {
    PrepareFetchUrl(path: string) {
      return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
    }
  }

  const c3 = new MyClient({ baseUrl: "https://example.com/api/v1" })
  t(c3, "/", "https://example.com/api/v1/")
  t(c3, "/cats", "https://example.com/api/v1/cats")

  const c4 = new ApiClient({ baseUrl: "https://a.com/b/" })
  t(c4, "c/d", "https://a.com/b/c/d")
  t(c4, "/c/d", "https://a.com/c/d")
  t(c4, "../c/d", "https://a.com/c/d")
  t(c4, "../../c/d", "https://a.com/c/d")
})

test("apiClient emits uppercase HTTP methods", async () => {
  const schema = {
    openapi: "3.2.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/things": {
        get: {
          tags: ["things"],
          operationId: "listThings",
          responses: { "200": { description: "ok" } },
        },
        patch: {
          tags: ["things"],
          operationId: "patchThings",
          responses: { "200": { description: "ok" } },
        },
        query: {
          tags: ["things"],
          operationId: "queryThings",
          responses: { "200": { description: "ok" } },
        },
      },
      "/files/{String}": {
        get: {
          tags: ["files"],
          operationId: "getFile",
          parameters: [{ name: "String", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-"))
  const source = path.join(dir, "openapi.json")
  const output = path.join(dir, "client.ts")
  const prevFetch = globalThis.fetch
  const seen: string[] = []

  await fs.writeFile(source, JSON.stringify(schema))
  await apigen({ source: pathToFileURL(source).href, output })

  globalThis.fetch = async (_url, options) => {
    seen.push(options?.method ?? "")
    return new Response("{}")
  }

  try {
    const { ApiClient: Client } = await import(pathToFileURL(output).href)
    const api = new Client({ baseUrl: "http://localhost" })
    await api.things.listThings()
    await api.things.patchThings()
    await api.things.queryThings()

    equal(seen[0], "GET")
    equal(seen[1], "PATCH")
    equal(seen[2], "QUERY")
  } finally {
    globalThis.fetch = prevFetch
  }
})

test("apiClient serializes query, path and form params", async () => {
  const array = { type: "array", items: { type: "string" } }
  const schema = {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/items": {
        // operation-level params override path-level ones
        parameters: [{ name: "ids", in: "query", schema: array, style: "pipeDelimited" }],
        get: {
          tags: ["items"],
          operationId: "listItems",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "tags", in: "query", schema: array },
            { name: "ids", in: "query", schema: array, explode: false },
            { name: "page-ids", in: "query", schema: array, explode: false },
            { name: "pipes", in: "query", schema: array, style: "pipeDelimited" },
            {
              name: "mixed",
              in: "query",
              schema: { ...array, type: ["array", "string"] },
              explode: false,
            },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
      "/forms": {
        post: {
          tags: ["items"],
          operationId: "createItem",
          requestBody: {
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: { name: { type: "string" }, note: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/users/{username}": {
        get: {
          tags: ["users"],
          operationId: "getUser",
          parameters: [
            { name: "username", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
      "/files/{String}": {
        get: {
          tags: ["files"],
          operationId: "getFile",
          parameters: [{ name: "String", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-"))
  const source = path.join(dir, "openapi.json")
  const output = path.join(dir, "client.ts")
  const prevFetch = globalThis.fetch
  const seen: string[] = []

  await fs.writeFile(source, JSON.stringify(schema))
  await apigen({ source: pathToFileURL(source).href, output })

  globalThis.fetch = async (url, options) => {
    seen.push(options?.body ? `${url} ${options.body}` : `${url}`)
    return new Response("{}")
  }

  try {
    const { ApiClient: Client } = await import(pathToFileURL(output).href)
    const api = new Client({ baseUrl: "http://localhost" })
    await api.items.listItems({ status: undefined })
    await api.items.listItems({ status: null })
    await api.items.listItems({ tags: ["a", "b,c"] })
    await api.items.listItems({ ids: ["a", "b"], "page-ids": ["c", "d"], pipes: ["e", "f"] })
    await api.items.createItem({ name: "a", note: undefined })
    await api.users.getUser("a/b?c#d")
    await api.items.listItems({ mixed: "a" })
    await api.items.listItems({ mixed: ["a", "b"] })
    await api.files.getFile("a b")

    equal(seen[0], "http://localhost/items")
    equal(seen[1], "http://localhost/items")
    equal(seen[2], "http://localhost/items?tags=a&tags=b%2Cc")
    equal(seen[3], "http://localhost/items?ids=a%2Cb&page-ids=c%2Cd&pipes=e%7Cf")
    equal(seen[4], "http://localhost/forms name=a")
    equal(seen[5], "http://localhost/users/a%2Fb%3Fc%23d")
    equal(seen[6], "http://localhost/items?mixed=a")
    equal(seen[7], "http://localhost/items?mixed=a%2Cb")
    equal(seen[8], "http://localhost/files/a%20b")
  } finally {
    globalThis.fetch = prevFetch
  }
})

test("apiClient parses dates where the schema has them", async () => {
  const date = { type: "string", format: "date-time" }
  const ok = (schema: object) => ({
    description: "ok",
    content: { "application/json": { schema } },
  })
  const schema = {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/events": {
        get: {
          tags: ["events"],
          operationId: "list",
          parameters: [
            { name: "since", in: "query", schema: date },
            { name: "days", in: "query", schema: { type: "array", items: date }, explode: false },
          ],
          responses: {
            "200": ok({ type: "array", items: { $ref: "#/components/schemas/Event" } }),
          },
        },
        post: {
          tags: ["events"],
          operationId: "create",
          requestBody: {
            content: {
              "application/x-www-form-urlencoded": {
                schema: { type: "object", properties: { at: date } },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/events/{at}": {
        get: {
          tags: ["events"],
          operationId: "get",
          parameters: [{ name: "at", in: "path", required: true, schema: date }],
          responses: { "200": ok({ $ref: "#/components/schemas/Event" }) },
        },
      },
      "/now": { get: { tags: ["time"], operationId: "now", responses: { "200": ok(date) } } },
      "/users": {
        get: {
          tags: ["users"],
          operationId: "list",
          responses: { "200": ok({ $ref: "#/components/schemas/User" }) },
        },
      },
    },
    components: {
      schemas: {
        Event: {
          type: "object",
          properties: {
            note: { type: "string" },
            at: date,
            endsAt: { type: ["string", "null"], format: "date-time" },
            log: { type: "array", items: date },
            seen: { type: "object", additionalProperties: date },
            pair: { type: "array", prefixItems: [{ type: "string" }, date] },
            owner: { $ref: "#/components/schemas/User" },
            pet: {
              oneOf: [{ $ref: "#/components/schemas/Cat" }, { $ref: "#/components/schemas/Dog" }],
            },
          },
        },
        // no dates, also through the ref to itself
        User: {
          type: "object",
          properties: {
            name: { type: "string" },
            friends: { type: "array", items: { $ref: "#/components/schemas/User" } },
          },
        },
        Cat: { type: "object", properties: { born: { $ref: "#/components/schemas/Timestamp" } } },
        // dates only through refs that loop: Dog -> A -> B -> A, B -> C
        Dog: { type: "object", properties: { vet: { $ref: "#/components/schemas/A" } } },
        A: { type: "object", properties: { b: { $ref: "#/components/schemas/B" } } },
        B: {
          type: "object",
          properties: {
            a: { $ref: "#/components/schemas/A" },
            c: { $ref: "#/components/schemas/C" },
          },
        },
        C: { type: "object", properties: { at: date } },
        Timestamp: date,
      },
    },
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-"))
  const source = path.join(dir, "openapi.json")
  const output = path.join(dir, "client.ts")
  const plain = path.join(dir, "plain.ts")
  const prevFetch = globalThis.fetch
  const seen: string[] = []

  await fs.writeFile(source, JSON.stringify(schema))
  await apigen({ source: pathToFileURL(source).href, output, parseDates: true })
  await apigen({ source: pathToFileURL(source).href, output: plain })

  const code = await fs.readFile(output, "utf-8")
  equal(code.includes("apigen:"), false)
  equal(code.includes("  User:"), false) // no shape for schemas without dates
  equal((await fs.readFile(plain, "utf-8")).includes("PopulateDates"), false)

  const s = "2021-01-01T00:00:00.000Z"
  const event = {
    note: s,
    at: s,
    endsAt: s,
    log: [s],
    seen: { a: s },
    pair: [s, s],
    owner: { name: s, friends: [{ name: s }] },
    pet: { born: s, vet: { b: { a: { b: { c: { at: s } } } } } },
  }

  const q = encodeURIComponent(s)
  const reps: Record<string, unknown> = {
    "/events": [event],
    [`/events/${q}`]: event,
    "/now": s,
    "/users": event.owner,
  }

  globalThis.fetch = async (url, options) => {
    seen.push(options?.body ? `${url} ${options.body}` : `${url}`)
    return new Response(JSON.stringify(reps[new URL(`${url}`).pathname]))
  }

  try {
    const { ApiClient: Client } = await import(pathToFileURL(output).href)
    const api = new Client({ baseUrl: "http://localhost" })
    const kind = (v: unknown) => (v instanceof Date ? "Date" : typeof v)
    const d = new Date(s)

    const [e] = await api.events.list({ since: d, days: [d, d] })
    equal(kind(e.note), "string")
    equal(kind(e.at), "Date")
    equal(kind(e.endsAt), "Date")
    equal(kind(e.log[0]), "Date")
    equal(kind(e.seen.a), "Date")
    equal(kind(e.pair[0]), "string")
    equal(kind(e.pair[1]), "Date")
    equal(kind(e.owner.name), "string")
    equal(kind(e.owner.friends[0].name), "string")
    equal(kind(e.pet.born), "Date")
    equal(kind(e.pet.vet.b.a.b.c.at), "Date")

    equal(kind((await api.events.get(d)).at), "Date")
    equal(kind(await api.time.now()), "Date")
    equal(kind((await api.users.list()).name), "string")
    await api.events.create({ at: d })

    equal(seen[0], `http://localhost/events?since=${q}&days=${q}%2C${q}`)
    equal(seen[1], `http://localhost/events/${q}`)
    equal(seen[4], `http://localhost/events at=${q}`)
  } finally {
    globalThis.fetch = prevFetch
  }
})
