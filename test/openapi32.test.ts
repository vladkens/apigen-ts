import fs from "fs/promises"
import { strictEqual as equal, match } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { apigen } from "../src/main"

const generateClient = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-openapi32-"))
  const output = path.join(dir, "client.ts")
  const source = pathToFileURL(path.resolve("scripts/example-specs/openapi32.yml")).href

  await apigen({ source, output })

  return {
    code: await fs.readFile(output, "utf8"),
    Client: (await import(pathToFileURL(output).href)).ApiClient,
  }
}

const generated = generateClient()

test("OpenAPI 3.2 additionalOperations preserve the HTTP method", async () => {
  const { Client } = await generated
  const prevFetch = globalThis.fetch
  let requestMethod: string | undefined
  let requestUrl = ""

  globalThis.fetch = async (input, init) => {
    requestMethod = init?.method
    requestUrl = input.toString()
    return new Response(null, { status: 204 })
  }

  try {
    const api = new Client({ baseUrl: "http://localhost" })
    await api.documents.linkDocument("document-1", { target: "document-2" })

    equal(requestMethod, "LINK")
    equal(requestUrl, "http://localhost/documents/document-1")
  } finally {
    globalThis.fetch = prevFetch
  }
})

test("OpenAPI 3.2 reusable media types preserve the response type", async () => {
  const { code } = await generated
  match(code, /getWidget: \(id: string\).*?this\.Fetch<Widget>/s)
})
