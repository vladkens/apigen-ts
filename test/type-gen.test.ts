import { Oas3Schema, Oas3_1Schema } from "@redocly/openapi-core"
import ts from "typescript"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { initCtx } from "../src/config"
import { printCode } from "../src/printer"
import { makeType, makeTypeAlias } from "../src/type-gen"

test("type inline", async () => {
  const t = (l: Oas3_1Schema, r: string, parseDates = false) => {
    const ctx = initCtx({ parseDates })
    const res = makeType(ctx, l)
    const txt = printCode([res as unknown as ts.Statement])
      .replace(/"(\w+)"(\??):/g, "$1$2:")
      .replaceAll("\n", " ")
      .replace(/ +/g, " ")
      .replace("; }", " }")
      .trim()
    return equal(txt, r)
  }

  // basic types
  t({ type: "string" }, "string")
  t({ type: "number" }, "number")
  t({ type: "integer" }, "number")
  t({ type: "boolean" }, "boolean")
  t({ type: "null" }, "null")
  t({ type: "file" }, "unknown")
  t({ type: "date" }, "unknown")
  t({ type: "object" }, "object") // should be unknown?
  t({ type: "array" }, "void[]") // should be unknown?

  // nullable
  t({ type: "string", nullable: true }, "string | null")
  t({ type: "string", nullable: false }, "string")
  t({ type: "number", nullable: true }, "number | null")
  t({ type: "date", nullable: true }, "unknown") // just unknown

  // combinations
  t({ oneOf: [{ type: "string" }, { type: "number" }] }, "string | number")
  t({ anyOf: [{ type: "string" }, { type: "number" }] }, "string | number")
  t({ allOf: [{ type: "string" }, { type: "number" }] }, "string & number")
  t({ type: ["string", "number"] }, "string | number")

  // arrays of basic types
  t({ type: "array", items: { type: "string" } }, "string[]")
  t({ type: "array", items: { type: "number" } }, "number[]")
  t({ type: "array", items: { type: "integer" } }, "number[]")
  t({ type: "array", items: { type: "boolean" } }, "boolean[]")
  t({ type: "array", items: { type: "null" } }, "null[]")
  t({ type: "array", items: { type: "object" } }, "object[]") // should be unknown?
  t({ type: "array", items: { type: "file" } }, "unknown[]")
  t({ type: "array", items: { type: ["string", "number"] } }, "(string | number)[]")

  // arrays of arrays
  t({ type: "array", items: { type: "array", items: { type: "string" } } }, "string[][]")
  t({ type: "array", items: { type: "array", items: { type: "number" } } }, "number[][]")

  // inline enums
  t({ type: "string", enum: ["a", "b"] }, `"a" | "b"`)
  t({ type: "string", enum: ["a", "b", "b"] }, `"a" | "b"`)
  // t({ type: "string", enum: ["a", "b", ""] }, `"a" | "b" | ""`) // todo:
  t({ type: "number", enum: [1, 2] }, `1 | 2`)
  t({ type: "number", enum: [1, 2, 2] }, `1 | 2`)
  t({ type: "boolean", enum: [true, false] }, `true | false`)
  t({ type: "boolean", enum: [true, true] }, `true`)
  t({ type: "boolean", enum: [false, false] }, `false`)
  // t({ type: "string", enum: [1, 2] }, `1 | 2`)
  // t({ type: "number", enum: ["a", "b"] }, `"a" | "b"`)
  // t({ type: "boolean", enum: [1, 2] }, `1 | 2`)
  t({ type: "date", enum: ["a"] }, `unknown`)

  // enum without type
  t({ enum: ["a", "b"] }, `"a" | "b"`)
  t({ enum: ["a", "b", "b"] }, `"a" | "b"`)
  t({ enum: [1, 2] }, `1 | 2`)

  // custom types
  t({ type: "string", format: "binary" }, "File")
  t({ type: "string", format: "date-time" }, "string")
  t({ type: "string", format: "date-time" }, "Date", true)

  // object
  t({ type: "object", properties: { a: { type: "string" } } }, "{ a?: string }")
  t({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, "{ a: string }")

  t(
    {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    },
    "{ a: string; b?: number }",
  )

  t(
    {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number", enum: [1, 2] } },
      required: ["a", "b"],
    },
    "{ a: string; b: 1 | 2 }",
  )

  // todo: should "b" be here as unknown?
  t(
    { type: "object", properties: { a: { type: "string" } }, required: ["a", "b"] },
    "{ a: string }",
  )

  t(
    { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
    "{ a?: string }",
  )

  t(
    { type: "object", properties: { a: { type: "string" } }, additionalProperties: true },
    "{ a?: string }",
  )

  t({ type: "object", additionalProperties: { type: "number" } }, "Record<string, number>")

  t(
    {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
    },
    "Record<string, (string | number)[]>",
  )
})

test("type alias", async () => {
  const t = (l: Oas3Schema & { name?: string }, r: string, parseDates = false) => {
    const ctx = initCtx({ parseDates })
    const res = makeTypeAlias(ctx, l.name ?? "t", l)
    const txt = printCode([res as unknown as ts.Statement])
      .replace(";", "")
      .replace("export ", "")
      .replaceAll("\n", " ")
      .replace(/ +/g, " ")
      .trim()
    return equal(txt, r)
  }

  t({ type: "string" }, `type t = string`)
  t({ type: "number" }, `type t = number`)
  t({ type: "boolean" }, `type t = boolean`)

  // check for reserved words
  t({ name: "for", type: "string" }, `type $for = string`)
  t({ name: "type", type: "string" }, `type type = string`) // no rename
  t({ name: "string", type: "string" }, `type $string = string`)

  // check for bad names
  t({ name: "1", type: "string" }, `type $1 = string`)
  t({ name: "1a", type: "string" }, `type $1a = string`)
  t({ name: "1.1", type: "string" }, `type $1_1 = string`)

  // enums
  t({ type: "string", enum: ["a", "b"] }, `enum t { A = "a", B = "b" }`)
  t({ type: "string", enum: ["a", "b", "b"] }, `enum t { A = "a", B = "b" }`)
  // t({ type: "number", enum: [1, 2] }, `enum t { A = 1, B = 2 }`) // no number enum support
  t({ type: "number", enum: [1, 2] }, `type t = 1 | 2`)
  t({ type: "boolean", enum: [true] }, `type t = true`)
  t({ type: "boolean", enum: [true, false] }, `type t = true | false`)

  // enum with empty value
  t({ type: "string", enum: ["a", "b", ""] }, `enum t { A = "a", B = "b" }`)

  // equal(await t({ type: "string", enum: ["a", "b"] }), `enum t { A = "a", B = "b", }`)
  // equal(await t({ type: "number", enum: ["a", "b"] }), `enum t { A = "a", B = "b", }`)
  // equal(await t({ type: "number", enum: [1, 2] }), `enum t { A = "a", B = "b", }`)
})

test.run()
