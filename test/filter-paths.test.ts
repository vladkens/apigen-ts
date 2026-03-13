import { Oas3Definition } from "@redocly/openapi-core"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import { initCtx } from "../src/config"
import { generateAst } from "../src/generator"

const makeDoc = (paths: string[]): Oas3Definition => ({
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0.0" },
  paths: Object.fromEntries(
    paths.map((path) => {
      const tag = path.replace(/^\//, "").replace(/\/.*/, "").replace(/[{}]/g, "")
      return [
        path,
        {
          get: {
            operationId: `${tag}-get`,
            tags: [tag],
            responses: { "200": { description: "ok" } },
          },
        },
      ]
    }),
  ),
})

const getRouteKeys = async (
  doc: Oas3Definition,
  filterPaths?: RegExp | ((p: string) => boolean),
) => {
  const ctx = initCtx({ doc, ...(filterPaths ? { filterPaths } : {}) })
  const { modules } = await generateAst(ctx)
  return modules.map((m) => (m.name as { escapedText: string }).escapedText as string)
}

test("filterPaths - no filter includes all paths", async () => {
  const doc = makeDoc(["/users", "/posts", "/comments"])
  const keys = await getRouteKeys(doc)
  equal(keys.length, 3)
})

test("filterPaths - regex filters by prefix", async () => {
  const doc = makeDoc(["/accounts/zones", "/accounts/workers", "/users"])
  const keys = await getRouteKeys(doc, /^\/accounts/)
  equal(keys.includes("users"), false)
  equal(
    keys.some((k) => ["accounts"].includes(k) || k !== "users"),
    true,
  )
})

test("filterPaths - regex filters to exact match", async () => {
  const doc = makeDoc(["/users", "/posts", "/comments"])
  const ctx = initCtx({ doc, filterPaths: /^\/users$/ })
  const { modules } = await generateAst(ctx)
  equal(modules.length, 1)
})

test("filterPaths - regex with no matches returns empty", async () => {
  const doc = makeDoc(["/users", "/posts"])
  const ctx = initCtx({ doc, filterPaths: /^\/nonexistent/ })
  const { modules } = await generateAst(ctx)
  equal(modules.length, 0)
})

test("filterPaths - function predicate", async () => {
  const doc = makeDoc(["/accounts/zones", "/accounts/workers", "/users"])
  const ctx = initCtx({ doc, filterPaths: (p) => p.startsWith("/accounts") })
  const { modules } = await generateAst(ctx)
  const keys = modules.map((m) => (m.name as { escapedText: string }).escapedText as string)
  equal(keys.includes("users"), false)
  equal(modules.length > 0, true)
})

test("filterPaths - function predicate keeps all when returns true", async () => {
  const doc = makeDoc(["/users", "/posts", "/comments"])
  const ctx = initCtx({ doc, filterPaths: () => true })
  const { modules } = await generateAst(ctx)
  equal(modules.length, 3)
})

test("filterPaths - function predicate excludes all when returns false", async () => {
  const doc = makeDoc(["/users", "/posts", "/comments"])
  const ctx = initCtx({ doc, filterPaths: () => false })
  const { modules } = await generateAst(ctx)
  equal(modules.length, 0)
})
