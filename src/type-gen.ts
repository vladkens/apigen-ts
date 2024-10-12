import { Oas3Schema, Referenced } from "@redocly/openapi-core/lib/typings/openapi"
import { filterEmpty } from "array-utils-ts"
import { isArray, isBoolean, uniq, upperFirst } from "lodash-es"
import ts from "typescript"
import { Context } from "./config"
import { OAS3, unref } from "./schema"

const f = ts.factory

// prettier-ignore
// https://github.com/microsoft/TypeScript/blob/v3.0.0/doc/spec.md#221-reserved-words
const Keywords = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", 
  "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", 
  "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true", "try", 
  "typeof", "var", "void", "while", "with",
  "implements", "interface", "let", "package", "private", "protected", "public", "static", "yield",
  "any", "boolean", "number", "string", "symbol",
  // "abstract", "as", "async", "await", "constructor", "declare", "from", "get", "is", "module", 
  // "namespace", "of", "require", "set", "type",
  "Record", "Partial", "Pick", "Omit", "Exclude", "Extract", // ts keywords
  "Date", "object", "Response" // ts type names
])

export const normalizeIdentifier = (val: string, asVar = false) => {
  let name = val
    .replace("#/components/schemas/", "")
    .replaceAll("'", "")
    .replace(/[^a-zA-Z0-9]/g, "_")

  // todo: handle duplicate names?
  if (name.match(/^\d/)) name = `$${name}`
  if (asVar && Keywords.has(name)) name = `$${name}`

  return name
}

const makeInlineEnum = (s: OAS3) => {
  if (!s.enum) return undefined

  const values = filterEmpty(s.enum)
  if (!values.length) return undefined

  if (!s.type) {
    if (values.every((x) => typeof x === "string")) s.type = "string"
    if (values.every((x) => typeof x === "number")) s.type = "number"
    if (values.every((x) => typeof x === "boolean")) s.type = "boolean"
  }

  if (s.type === "string") {
    const tokens = uniq(values).map((x) => f.createStringLiteral(x.toString()))
    return f.createUnionTypeNode(tokens.map((x) => f.createLiteralTypeNode(x)))
  }

  if (s.type === "number") {
    const tokens = uniq(values).map((x) => f.createNumericLiteral(x))
    return f.createUnionTypeNode(tokens.map((x) => f.createLiteralTypeNode(x)))
  }

  if (s.type === "boolean") {
    const tokens: (ts.TrueLiteral | ts.FalseLiteral)[] = []
    if (values.includes(true)) tokens.push(f.createToken(ts.SyntaxKind.TrueKeyword))
    if (values.includes(false)) tokens.push(f.createToken(ts.SyntaxKind.FalseKeyword))
    return f.createUnionTypeNode(tokens.map((x) => f.createLiteralTypeNode(x)))
  }

  console.warn(`enum with unknown type "${s.type}" in`, s)
  return undefined
}

const makeObject = (ctx: Context, s: OAS3): ts.TypeNode => {
  if (s.type !== "object") throw new Error(`makeObject: not an object ${JSON.stringify(s)}`)

  if (s.additionalProperties && !isBoolean(s.additionalProperties)) {
    return f.createTypeReferenceNode("Record", [
      f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      makeType(ctx, s.additionalProperties),
    ])
  }

  return f.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword)
}

export const makeType = (ctx: Context, s?: Referenced<OAS3>): ts.TypeNode => {
  const mk = makeType.bind(null, ctx)

  if (s === undefined) return f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
  if (s === null) return f.createLiteralTypeNode(f.createNull())

  if ("$ref" in s && s.$ref) {
    const parts = s.$ref.replace("#/", "").split("/")
    if (parts.length === 3 && parts[0] === "components" && parts[1] === "schemas") {
      // return direct type name if possible
      return f.createTypeReferenceNode(normalizeIdentifier(parts[2], true))
    }

    // expand full type from ref (may duplicate definitions)
    const t = unref(ctx, s)
    if (!t) throw new Error(`makeTypeRef: ref not found ${JSON.stringify(s)}`)
    return makeType(ctx, t)
  }

  if ("oneOf" in s && s.oneOf) return f.createUnionTypeNode(s.oneOf.map(mk))
  if ("anyOf" in s && s.anyOf) return f.createUnionTypeNode(s.anyOf.map(mk))
  if ("allOf" in s && s.allOf) return f.createIntersectionTypeNode(s.allOf.map(mk))

  if ("type" in s && s.type === "integer") s.type = "number"

  if ("enum" in s && s.enum && !Array.isArray(s.type)) {
    const isArray = s.type === "array"
    const t = makeInlineEnum(isArray ? { ...s, type: s.items?.type } : s)
    if (t) return isArray ? f.createArrayTypeNode(t) : t
  }

  if ("properties" in s && s.properties) {
    return f.createTypeLiteralNode(
      Object.entries(s.properties).map(([k, v]) => {
        const r = s.required ?? []
        const q = r.includes(k) ? undefined : f.createToken(ts.SyntaxKind.QuestionToken)
        return f.createPropertySignature(undefined, f.createStringLiteral(k), q, mk(v))
      }),
    )
  }

  if ("type" in s) {
    // openapi v3.1 can have type as array
    if (Array.isArray(s.type)) {
      const types: OAS3[] = []
      for (const type of s.type) {
        if (type === "null") types.push({ type: "null" })
        else types.push({ ...s, type })
      }

      return mk({ oneOf: types })
    }

    let t: ts.TypeNode
    // if (s.type === "object") t = f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
    if (s.type === "object") t = makeObject(ctx, s)
    else if (s.type === "boolean") t = f.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
    else if (s.type === "number") t = f.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
    else if (s.type === "string") t = f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
    else if (s.type === "array") t = f.createArrayTypeNode(mk(s.items))
    else if (s.type === "null") t = f.createLiteralTypeNode(f.createNull())
    else if (isArray(s.type)) t = f.createUnionTypeNode(s.type.map((x) => mk({ type: x })))
    else {
      console.warn(`makeType: unknown type "${s.type}"`)
      return f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
    }

    if (s.type === "string") {
      if (s.format === "binary") t = f.createTypeReferenceNode("File")
      if (s.format === "date-time" && ctx.parseDates) t = f.createTypeReferenceNode("Date")
    }

    return s.nullable ? f.createUnionTypeNode([t, f.createLiteralTypeNode(f.createNull())]) : t
  }

  // throw new Error(`makeType: unknown schema ${JSON.stringify(s)}`)
  return f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
}

const isStringEnum = (s: Referenced<Oas3Schema>): s is Oas3Schema & { enum: string[] } => {
  if ("enum" in s && s.enum) {
    return s.enum.every((x) => typeof x === "string")
  }
  return false
}

export const makeTypeAlias = (ctx: Context, name: string, s: Referenced<Oas3Schema>) => {
  if (isStringEnum(s)) {
    const tokens1 = uniq(s.enum)
    const tokens2 = filterEmpty(tokens1)

    if (tokens1.length !== tokens2.length) {
      console.warn(`enum ${name} has empty values`, s)
    }

    return f.createEnumDeclaration(
      [f.createToken(ts.SyntaxKind.ExportKeyword)],
      normalizeIdentifier(name, true),
      tokens2.map((x) =>
        f.createEnumMember(upperFirst(normalizeIdentifier(x)), f.createStringLiteral(x)),
      ),
    )
  }

  return f.createTypeAliasDeclaration(
    [f.createToken(ts.SyntaxKind.ExportKeyword)],
    f.createIdentifier(normalizeIdentifier(name, true)),
    undefined,
    makeType(ctx, s),
  )
}
