import {
  Oas3_1Schema,
  Oas3MediaType,
  Oas3Operation,
  Oas3Parameter,
  Oas3PathItem,
  Oas3Response,
  Oas3Schema,
  Referenced,
} from "@redocly/openapi-core"
import { get } from "lodash-es"
import { Context } from "./config"

export type OAS3 = Oas3Schema | Oas3_1Schema | boolean
type Oas3RequestBody =
  NonNullable<Oas3Operation["requestBody"]> extends Referenced<infer T> ? T : never
type Oas3Content = Record<string, Oas3MediaType | Referenced<Oas3MediaType>>
type Oas3Like =
  | Oas3MediaType
  | Oas3Operation
  | Oas3Parameter
  | Oas3PathItem
  | Oas3RequestBody
  | Oas3Response
  | OAS3

// todo: wrong <T> typing
export const unref = <T extends Oas3Like>(ctx: Context, s?: Referenced<T>) => {
  if (s === undefined) return undefined
  if (typeof s !== "object" || s === null) return s as T

  if ("$ref" in s && s.$ref) {
    const parts = s.$ref.replace("#/", "").split("/")
    const obj = parts.reduce(
      // openapi encodes "/" in key as "~1"
      (acc, x) => get(acc, x, get(acc, decodeURIComponent(x).replaceAll("~1", "/"))),
      ctx.doc,
    )

    if (obj !== undefined) return obj as unknown as T

    console.warn(`${ctx.logTag} ref ${s.$ref} not found`)
    return undefined
  }

  return s as T
}

const getContent = (ctx: Context, content?: Oas3Content) => {
  const result: [string, Oas3MediaType][] = []

  for (const [cType, value] of Object.entries(content ?? {})) {
    const mType = unref(ctx, value)
    if (mType) result.push([cType.split(";")[0], mType])
  }

  return result
}

export const getReqSchema = (ctx: Context, config: Oas3Operation) => {
  const req = unref(ctx, config.requestBody)
  if (!req) return undefined

  const cts = getContent(ctx, req.content)
    .map((x) => [x[0], x[1].schema] as const)
    .filter((x) => x[1] !== undefined) as [string, Referenced<OAS3>][]

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

const getRepContent = (ctx: Context, config: Oas3Operation) => {
  const successCodes = Object.keys(config.responses ?? {})
    .filter((x) => x.startsWith("2"))
    .filter((x) => get(config, ["responses", x]))

  // if (successCodes.length > 1) console.warn(`${ctx.tag} multiple success codes ${successCodes}`)

  const firstSuccess = unref(ctx, get(config, ["responses", successCodes[0]], {}))

  if (!firstSuccess || !("content" in firstSuccess)) return []
  return getContent(ctx, firstSuccess.content)
}

export const getRepSchema = (ctx: Context, config: Oas3Operation): OAS3 | undefined => {
  const cts = getRepContent(ctx, config).filter((x) => x[1].schema !== undefined)

  if (!cts.length) return undefined

  const ctJson = cts.find((x) => x[0].startsWith("application/json"))
  if (ctJson) return ctJson[1].schema

  const ctText = cts.find((x) => x[0].startsWith("text/"))
  if (ctText) return { type: "string" }

  const types = cts.map((x) => x[0]).join(", ")
  // console.warn(`${ctx.tag} no known response for code ${successCodes[0]}: ${types}`)

  return undefined
}
