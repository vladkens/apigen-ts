import fs from "fs/promises"
import { match } from "node:assert"
import { test } from "node:test"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { apigen } from "../src/main"

const generateClient = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apigen-ts-openapi31-"))
  const output = path.join(dir, "client.ts")
  const source = pathToFileURL(path.resolve("scripts/example-specs/openapi31.yml")).href

  await apigen({ source, output })
  return fs.readFile(output, "utf8")
}

const generated = generateClient()

test("OpenAPI 3.1 reusable path items generate operations", async () => {
  match(await generated, /getStatus: \(\).*?this\.Fetch<Status>/s)
})

test("OpenAPI 3.1 boolean schemas preserve their types", async () => {
  match(await generated, /export type AnyValue = unknown/)
  match(await generated, /export type NoValue = never/)
})

test("OpenAPI 3.1 primitive constants preserve their values", async () => {
  match(await generated, /ready: true/)
  match(await generated, /version: 1/)
})
