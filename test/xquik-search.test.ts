import fs from "fs/promises"
import { deepStrictEqual, strictEqual as equal } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { apigen } from "../src/main"

const xquikSchema = {
  openapi: "3.1.0",
  info: { title: "Xquik API", version: "1.0.0" },
  servers: [{ url: "https://xquik.com" }],
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      },
    },
  },
  paths: {
    "/api/v1/x/tweets/search": {
      get: {
        tags: ["x"],
        operationId: "searchTweets",
        security: [{ apiKey: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "text"],
                        properties: {
                          id: { type: "string" },
                          text: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

test("generated Xquik search client sends query and configured API key header", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-xquik-"))
  const source = path.join(dir, "openapi.json")
  const output = path.join(dir, "client.ts")
  const previousFetch = globalThis.fetch
  let receivedUrl = ""
  let receivedApiKey: string | null = null

  await fs.writeFile(source, JSON.stringify(xquikSchema))
  await apigen({ source: pathToFileURL(source).href, output })

  globalThis.fetch = async (url, options) => {
    receivedUrl = String(url)
    receivedApiKey = new Headers(options?.headers).get("x-api-key")
    return new Response(JSON.stringify({ data: [{ id: "1", text: "hello" }] }))
  }

  try {
    const { ApiClient } = await import(pathToFileURL(output).href)
    const api = new ApiClient({
      baseUrl: "https://xquik.com",
      headers: { "x-api-key": "test-key" },
    })

    const result = await api.x.searchTweets({ q: "from:xquik", limit: 10 })

    equal(receivedUrl, "https://xquik.com/api/v1/x/tweets/search?q=from%3Axquik&limit=10")
    equal(receivedApiKey, "test-key")
    deepStrictEqual(result, { data: [{ id: "1", text: "hello" }] })
  } finally {
    globalThis.fetch = previousFetch
  }
})
