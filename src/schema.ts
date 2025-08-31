import {
  Oas3_1Schema,
  Oas3Definition,
  Oas3Operation,
  Oas3Parameter,
  Oas3RequestBody,
  Oas3Schema,
  Referenced,
} from "@redocly/openapi-core/lib/typings/openapi"
import { get, isObject } from "lodash-es"
import { Config, Context } from "./config"

export type OAS3 = Oas3Schema | Oas3_1Schema

const HttpMethods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const

// Oas3PathItem defines each method operation as a property.
// We want to be able to iterate over methods so we introduce this type.
export interface PathItem {
  ops: Record<string, Oas3Operation>
  summary?: string
  description?: string
  parameters?: Array<Referenced<Oas3Parameter>>
}

export function filterSchema(doc: Oas3Definition, config: Partial<Config>) {
  const paths: Record<string, PathItem> = {}
  let usedSchemaRefs = new Set<string>()
  for (const [path, pathConfig] of Object.entries(doc.paths ?? {})) {
    const logTag = `${"[ALL]".toUpperCase().padEnd(6, " ")} ${path}`
    if (!isObject(pathConfig)) continue

    if ("$ref" in pathConfig) {
      console.warn(`${logTag} $ref should be resolved before (skipping)`)
      continue
    }

    paths[path] = {
      ops: {},
      summary: pathConfig.summary,
      description: pathConfig.description,
      parameters: pathConfig.parameters,
    }

    for (const method of HttpMethods) {
      const op = pathConfig[method]
      if (!op) continue

      if (config.includeTags && !op.tags?.some((tag) => config.includeTags!.includes(tag))) {
        continue
      }

      paths[path].ops[method] = op
      extractSchemaReferences(op, usedSchemaRefs)
    }
  }
  const schemas = doc.components?.schemas ?? {}

  // When we filter out operations we also want to filter out schemas that are no longer used.
  let schemaRefsToCheck = usedSchemaRefs
  while (schemaRefsToCheck.size > 0) {
    const newSchemaRefs = new Set<string>()
    for (const ref of schemaRefsToCheck) {
      extractSchemaReferences(schemas[ref], newSchemaRefs)
    }
    schemaRefsToCheck = newSchemaRefs.difference(usedSchemaRefs)
    usedSchemaRefs = usedSchemaRefs.union(newSchemaRefs)
  }
  for (const unusedSchema of new Set(Object.keys(schemas)).difference(usedSchemaRefs)) {
    delete schemas[unusedSchema]
  }
  return { paths, schemas }
}

// todo: wrong <T> typing
export const unref = <T extends Oas3RequestBody | Oas3Parameter | OAS3>(
  ctx: Context,
  s?: Referenced<T>,
) => {
  if (!s) return undefined

  if ("$ref" in s && s.$ref) {
    const parts = s.$ref.replace("#/", "").split("/")
    const obj = parts.reduce(
      // openapi encodes "/" in key as "~1"
      (acc, x) => get(acc, x, get(acc, decodeURIComponent(x).replaceAll("~1", "/"))),
      { components: { schemas: ctx.schemas } },
    )

    if (obj) return obj as unknown as T

    console.warn(`${ctx.logTag} ref ${s.$ref} not found`)
    return undefined
  }

  return s as T
}

export const getReqSchema = (ctx: Context, config: Oas3Operation) => {
  const req = unref(ctx, config.requestBody)
  if (!req) return undefined

  const cts = Object.entries(req.content ?? {}) //
    .map((x) => [x[0].split(";")[0], x[1].schema] as const)
    .filter((x) => x[1]) as [string, Referenced<Oas3Schema>][]

  if (cts.length === 0) return undefined

  const pretenders = [
    "application/json",
    "text/",
    "multipart/form-data",
    "application/x-www-form-urlencoded",
  ]

  for (const p of pretenders) {
    const ct = cts.find((x) => x[0].startsWith(p))
    if (ct) return ct
  }

  const types = cts.map((x) => x[0])
  // console.warn(`${ctx.tag} no known request type: ${types.join(", ")}`)

  return undefined
}

export const getRepSchema = (ctx: Context, config: Oas3Operation): OAS3 | undefined => {
  const successCodes = Object.keys(config.responses ?? {})
    .filter((x) => x.startsWith("2"))
    .filter((x) => get(config, ["responses", x, "content"]))

  // if (successCodes.length > 1) console.warn(`${ctx.tag} multiple success codes ${successCodes}`)

  const cts = Object.entries(get(config, ["responses", successCodes[0], "content"], {})) //
    .filter((x) => x[1].schema)

  if (cts.length === 0) return undefined

  const ctJson = cts.find((x) => x[0].startsWith("application/json"))
  if (ctJson) return ctJson[1].schema

  const ctText = cts.find((x) => x[0].startsWith("text/"))
  if (ctText) return { type: "string" }

  const types = cts.map((x) => x[0]).join(", ")
  // console.warn(`${ctx.tag} no known response for code ${successCodes[0]}: ${types}`)

  return undefined
}

function extractSchemaReferences(obj: any, schemaRefs: Set<string>): void {
  if (obj === null || obj === undefined) {
    return
  }

  if (typeof obj === "object" && !Array.isArray(obj) && obj.$ref) {
    const ref = obj.$ref
    if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
      const schemaName = ref.replace("#/components/schemas/", "")
      schemaRefs.add(schemaName)
    }
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => extractSchemaReferences(item, schemaRefs))
  } else if (typeof obj === "object") {
    Object.values(obj).forEach((prop) => extractSchemaReferences(prop, schemaRefs))
  }
}
