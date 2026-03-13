import { Oas3Definition } from "@redocly/openapi-core"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import { initCtx } from "../src/config"
import { generateAst } from "../src/generator"

const makeDoc = (ops: { path: string; tags: string[] }[]): Oas3Definition => ({
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0.0" },
  paths: Object.fromEntries(
    ops.map(({ path, tags }) => [
      path,
      {
        get: {
          operationId: path.replace(/\//g, "-").replace(/^-/, ""),
          tags,
          responses: { "200": { description: "ok" } },
        },
      },
    ]),
  ),
})

const getModuleNames = async (
  doc: Oas3Definition,
  opts?: { includeTags?: string[]; excludeTags?: string[] },
) => {
  const ctx = initCtx({ doc, ...opts })
  const { modules } = await generateAst(ctx)
  return modules.map((m) => (m.name as { escapedText: string }).escapedText as string)
}

const doc = makeDoc([
  { path: "/pets", tags: ["pets"] },
  { path: "/pets/{id}", tags: ["pets"] },
  { path: "/store/orders", tags: ["store"] },
  { path: "/users", tags: ["users"] },
  { path: "/users/{id}", tags: ["users"] },
])

test("filterTags - no filter includes all", async () => {
  const names = await getModuleNames(doc)
  equal(names.length, 3)
})

test("filterTags - includeTags keeps only matching", async () => {
  const names = await getModuleNames(doc, { includeTags: ["pets"] })
  equal(names.length, 1)
  equal(names[0], "pets")
})

test("filterTags - includeTags multiple tags", async () => {
  const names = await getModuleNames(doc, { includeTags: ["pets", "store"] })
  equal(names.length, 2)
  equal(names.includes("users"), false)
})

test("filterTags - excludeTags removes matching", async () => {
  const names = await getModuleNames(doc, { excludeTags: ["pets"] })
  equal(names.includes("pets"), false)
  equal(names.includes("store"), true)
  equal(names.includes("users"), true)
})

test("filterTags - excludeTags multiple tags", async () => {
  const names = await getModuleNames(doc, { excludeTags: ["pets", "store"] })
  equal(names.length, 1)
  equal(names[0], "users")
})

test("filterTags - includeTags with no match returns empty", async () => {
  const names = await getModuleNames(doc, { includeTags: ["nonexistent"] })
  equal(names.length, 0)
})

test("filterTags - excludeTags with no match keeps all", async () => {
  const names = await getModuleNames(doc, { excludeTags: ["nonexistent"] })
  equal(names.length, 3)
})

test("filterTags - includeTags and excludeTags combined (exclude wins)", async () => {
  // include pets+store, then exclude store -> only pets
  const names = await getModuleNames(doc, {
    includeTags: ["pets", "store"],
    excludeTags: ["store"],
  })
  equal(names.length, 1)
  equal(names[0], "pets")
})
