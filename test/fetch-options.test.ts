import fs from "fs/promises"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { apigen } from "../src/main"

const schema = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/products": {
      get: {
        tags: ["products"],
        operationId: "getProducts",
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
}

test("fetchOptions pass RequestInit to generated methods", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-"))
  const source = path.join(dir, "openapi.json")
  const output = path.join(dir, "client.ts")
  const prevFetch = globalThis.fetch
  let init: RequestInit | undefined

  await fs.writeFile(source, JSON.stringify(schema))
  await apigen({ source: pathToFileURL(source).href, output, fetchOptions: true })

  globalThis.fetch = async (_url, options) => {
    init = options
    return new Response("{}")
  }

  try {
    const { ApiClient } = await import(pathToFileURL(output).href)
    const api = new ApiClient({ baseUrl: "http://localhost" })

    await api.products.getProducts({ redirect: "manual" })

    equal(init?.redirect, "manual")
  } finally {
    globalThis.fetch = prevFetch
  }
})
