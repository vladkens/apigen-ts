import {
  Oas3_1Schema,
  Oas3Operation,
  Oas3Parameter,
  Oas3RequestBody,
  Oas3Schema,
  Referenced,
} from "@redocly/openapi-core/lib/typings/openapi"
import { get } from "lodash-es"
import { Context } from "./config"

export type OAS3 = Oas3Schema | Oas3_1Schema

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
      ctx.doc,
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

export const getRepSchema = (ctx: Context, config: Oas3Operation): Oas3Schema | undefined => {
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
