import fetchMock from "fetch-mock"
import fs from "fs/promises"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { ApiClient } from "../src/_template"
import { apigen } from "../src/main"

test("apiClient dates parsing", async () => {
  const t = async <T>(body: T) => {
    try {
      const baseUrl = "http://localhost"
      const client = new ApiClient({ baseUrl })
      fetchMock.mockGlobal()
      fetchMock.route(`${baseUrl}`, { body: JSON.stringify(body) })
      return client.Fetch<T>("get", "/")
    } finally {
      fetchMock.unmockGlobal()
    }
  }

  const date = new Date("2021-01-01T00:00:00Z")
  const dateStr = date.toISOString()

  const rs = await t({ date, dates: [date], more: { date, dates: [date] } })
  equal(rs.date.toISOString(), dateStr)
  equal(rs.dates[0].toISOString(), dateStr)
  equal(rs.more.date.toISOString(), dateStr)
  equal(rs.more.dates[0].toISOString(), dateStr)
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
        get: {
          tags: ["items"],
          operationId: "listItems",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "tags", in: "query", schema: array },
            { name: "ids", in: "query", schema: array, explode: false },
            { name: "page-ids", in: "query", schema: array, explode: false },
            { name: "pipes", in: "query", schema: array, style: "pipeDelimited" },
          ],
          responses: { "200": { description: "ok" } },
        },
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

    equal(seen[0], "http://localhost/items")
    equal(seen[1], "http://localhost/items")
    equal(seen[2], "http://localhost/items?tags=a&tags=b%2Cc")
    equal(seen[3], "http://localhost/items?ids=a%2Cb&page-ids=c%2Cd&pipes=e%7Cf")
    equal(seen[4], "http://localhost/items name=a")
    equal(seen[5], "http://localhost/users/a%2Fb%3Fc%23d")
  } finally {
    globalThis.fetch = prevFetch
  }
})
