import redocly, { Oas3Definition } from "@redocly/openapi-core"
import {
  Oas3Operation,
  Oas3Parameter,
  Oas3RequestBody,
  Oas3Schema,
  Referenced,
} from "@redocly/openapi-core/lib/typings/openapi"
import { filterEmpty, filterNullable } from "array-utils-ts"
import fs from "fs/promises"
import { get, isArray, isObject, lowerFirst, sortBy, uniq, uniqBy, upperFirst } from "lodash-es"
import { dirname, join } from "path"
import * as prettier from "prettier"
import { convertObj } from "swagger2openapi"
import ts from "typescript"
import { fileURLToPath } from "url"

const f = ts.factory
const HttpMethods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const

// https://github.com/microsoft/TypeScript/blob/v3.0.0/doc/spec.md#221-reserved-words
// prettier-ignore
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
  "Date", "object" // ts type names
])

type GenConfig = { name: string }
type Ctx = GenConfig & { doc: Oas3Definition; tag: string; opNames: Set<string> }
type OpConfig = Oas3Operation & { method: string; path: string }

export const initCtx = (doc: Oas3Definition, cfg?: GenConfig): Ctx => {
  return { name: "ApiClient", ...cfg, doc, tag: "", opNames: new Set() }
}

const normalizeIdentifier = (val: string, asVar = false) => {
  let name = val
    .replace("#/components/schemas/", "")
    .replaceAll("'", "")
    .replace(/[^a-zA-Z0-9]/g, "_")

  // todo: handle duplicate names?
  if (name.match(/^\d/)) name = `$${name}`
  if (asVar && Keywords.has(name)) name = `$${name}`

  return name
}

const normalizeOpName = (val: string) => {
  const articles = new Set(["a", "an", "the"])
  const tmp = val
    .replace(/'/, "") // case when plain text: User's -> Users
    .replace(/[^a-zA-Z0-9]/g, "_")
    .split("_")
    .filter((x) => x !== "" && !articles.has(x))
    .map((x) => upperFirst(x))

  // eg: SSHKey -> sshKey
  tmp[0] = tmp[0].toUpperCase() === tmp[0] ? tmp[0].toLowerCase() : lowerFirst(tmp[0])
  return tmp.join("")
}

export const getOpName = (ctx: Ctx, cfg: OpConfig) => {
  let ns = normalizeOpName(filterEmpty(cfg.tags ?? [])[0] ?? "general")
  let op = cfg.operationId ?? null

  // if not opId, try to make it from path
  if (!op) {
    op = cfg.path.replace(/^(\/api)?(\/v?\d\.?\d?)?\/(.+)$/, "$3") // /api/v1.0/users -> /users
    op = `${cfg.method}/${op}`.replace(/\/+/, "/")
  }

  op = normalizeOpName(op)

  // prettier-ignore
  // https://stackoverflow.com/a/58818125/3664464
  let nsr = ns.split("").map((x) => `[${x.toUpperCase()}${x.toLowerCase()}]`).join("")
  if (nsr.endsWith("[Ss]")) nsr += "?"

  // remove prefix if same with ns and / or starts with Controller / Service
  op = op.replace(new RegExp(`^${nsr}([Cc]ontroller|[Ss]ervice)?([A-Z].*)$`), "$2")
  op = lowerFirst(op)

  return [ns, op]
}

const makeInlineEnum = (s: Oas3Schema) => {
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

  console.warn(`enum with unknown type ${s.type}`, s)
  return undefined
}

const makeType = (ctx: Ctx, s?: Referenced<Oas3Schema>): ts.TypeNode => {
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
      const types: Oas3Schema[] = []
      for (const type of s.type) {
        if (type === "null") types.push({ type: "null" })
        else types.push({ ...s, type })
      }

      return mk({ oneOf: types })
    }

    let t: ts.TypeNode
    // if (s.type === "object") t = f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
    if (s.type === "object") t = f.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword)
    else if (s.type === "boolean") t = f.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
    else if (s.type === "number") t = f.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
    else if (s.type === "string") t = f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
    else if (s.type === "array") t = f.createArrayTypeNode(mk(s.items))
    else if (s.type === "null") t = f.createLiteralTypeNode(f.createNull())
    else if (isArray(s.type)) t = f.createUnionTypeNode(s.type.map((x) => mk({ type: x })))
    else throw new Error(`makeType: unknown type ${s.type}`)

    if (s.type === "string") {
      if (s.format === "binary") t = f.createTypeReferenceNode("File")
      if (s.format === "date-time") t = f.createTypeReferenceNode("Date")
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

export const makeTypeAlias = (ctx: Ctx, name: string, s: Referenced<Oas3Schema>) => {
  if (isStringEnum(s)) {
    const tokens1 = s.enum
    const tokens2 = filterEmpty(s.enum)

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

// todo: wrong <T> typing
const unref = <T extends Oas3RequestBody | Oas3Parameter | Oas3Schema>(
  ctx: Ctx,
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

    // console.log(parts, obj)
    if (obj) return obj as unknown as T

    console.warn(`${ctx.tag} ref ${s.$ref} not found`)
    return undefined
  }

  return s as T
}

const getReqSchema = (ctx: Ctx, config: Oas3Operation) => {
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

const getRepSchema = (ctx: Ctx, config: Oas3Operation): Oas3Schema | undefined => {
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

export const prepareUrl = (url: string, rename: Record<string, string>) => {
  // replace "{k}" to -> "${v}"
  for (const [k, v] of Object.entries(rename)) url = url.replaceAll(`{${k}}`, "${" + v + "}")

  const parts = url.split("${")
  if (parts.length === 1) return f.createStringLiteral(url)

  return f.createTemplateExpression(
    f.createTemplateHead(parts[0]),
    parts.slice(1).map((x, i) => {
      const [name, ...rest] = x.split("}")
      const right = rest.join("}")
      return f.createTemplateSpan(
        f.createIdentifier(name), // no normalization required
        i === parts.length - 2 ? f.createTemplateTail(right) : f.createTemplateMiddle(right),
      )
    }),
  )
}

const prepareOp = (ctx: Ctx, cfg: OpConfig, opName: string) => {
  cfg.parameters = cfg.parameters ?? []

  const reqSchema = getReqSchema(ctx, cfg)
  const repSchema = getRepSchema(ctx, cfg)
  const allParams = filterNullable(cfg.parameters.map((x) => unref(ctx, x)))

  // prettier-ignore
  const params = uniqBy(allParams.filter((x) => x.in === "path"), "name")
  if (reqSchema) params.push({ name: "body", schema: reqSchema[1] })

  const search = allParams.filter((x) => x.in === "query")
  const header = allParams.filter((x) => x.in === "header")

  // todo: add headers
  for (const [name, v] of Object.entries({ search })) {
    if (!v.length) continue

    // todo: ?some-param=1 but call should be fn({ someParam: 1 })
    const properties = v.reduce((acc, x) => ({ ...acc, [x.name]: x.schema }), {})
    params.push({ name, schema: { type: "object", properties } })
  }

  const urlReplacements: Record<string, string> = {}

  const fnArgs = params.map((x) => {
    const name = normalizeIdentifier(x.name, true)
    const type = makeType(ctx, x.schema)
    urlReplacements[x.name] = name
    return f.createParameterDeclaration(undefined, undefined, name, undefined, type)
  })

  const cbArgs = filterNullable([
    search.length ? f.createShorthandPropertyAssignment("search") : undefined,
    reqSchema && f.createShorthandPropertyAssignment("body"),
    reqSchema && reqSchema[0] !== "application/json"
      ? f.createPropertyAssignment(
          "headers",
          f.createObjectLiteralExpression([
            f.createPropertyAssignment(
              f.createStringLiteral("content-type"),
              f.createStringLiteral(reqSchema[0]),
            ),
          ]),
        )
      : undefined,
  ])

  return f.createPropertyAssignment(
    f.createIdentifier(normalizeIdentifier(opName)),
    f.createArrowFunction(
      undefined,
      undefined,
      fnArgs,
      undefined,
      undefined,
      f.createBlock([
        f.createReturnStatement(
          f.createCallExpression(
            f.createIdentifier("this.Fetch"),
            [makeType(ctx, repSchema)],
            [
              f.createStringLiteral(cfg.method), // method
              prepareUrl(cfg.path, urlReplacements), // path
              f.createObjectLiteralExpression(cbArgs), // { query, body, headers }
            ],
          ),
        ),
      ]),
    ),
  )
}

const prepareNs = (ctx: Ctx, name: string, handlers: ts.PropertyAssignment[]) => {
  return f.createPropertyDeclaration(
    undefined,
    normalizeIdentifier(name),
    undefined,
    undefined,
    f.createObjectLiteralExpression(handlers),
  )
}

const prepareRoutes = async (ctx: Ctx) => {
  const routes: Record<string, ts.PropertyAssignment[]> = {}

  for (const [path, pathConfig] of Object.entries(ctx.doc.paths ?? {})) {
    ctx.tag = `${"[ALL]".toUpperCase().padEnd(6, " ")} ${path}`
    if (!isObject(pathConfig)) continue

    if ("$ref" in pathConfig) {
      console.warn(`${ctx.tag} $ref should be resolved before (skipping)`)
      continue
    }

    for (const method of HttpMethods) {
      ctx.tag = `${method.toUpperCase().padEnd(6, " ")} ${path}`

      const config = pathConfig[method]
      if (!config) continue

      if (pathConfig.parameters) {
        config.parameters = [...(config.parameters ?? []), ...pathConfig.parameters]
      }

      const [ns, op] = getOpName(ctx, { ...config, method, path })
      if (!routes[ns]) routes[ns] = []

      const joined = [ns, op].join(".")
      if (ctx.opNames.has(joined)) {
        // console.warn(`${ctx.tag} duplicate operation ${joined} (skipping)`)
        continue
      } else {
        ctx.opNames.add(joined)
      }

      try {
        routes[ns].push(prepareOp(ctx, { ...config, method, path }, op))
      } catch (e) {
        console.error(`${ctx.tag} - ${e}`, config)
        throw e
      }
    }
  }

  return routes
}

const prepareTypes = async (ctx: Ctx) => {
  const types: ts.DeclarationStatement[] = []
  const typesConfig = sortBy(Object.entries(ctx.doc.components?.schemas ?? {}), ([k]) => k)
  for (const [name, config] of typesConfig) {
    try {
      types.push(makeTypeAlias(ctx, name, config))
    } catch (e) {
      console.error(`${ctx.tag} - ${e}`, name, config)
      throw e
    }
  }
  return types
}

const patchTemplate = async (ctx: Ctx, modules: ts.PropertyDeclaration[]) => {
  const filepath = join(dirname(fileURLToPath(import.meta.url)), "_template.ts")
  const file = await fs.readFile(filepath, "utf-8")
  const root = ts.createSourceFile("tmpl.ts", file, ts.ScriptTarget.Latest)

  return Array.from(root.statements).map((x) => {
    if (x.kind === ts.SyntaxKind.ClassDeclaration) {
      const name = get(x, "name.text")
      if (name === "ApiClient") {
        const t = x as ts.ClassDeclaration
        return f.updateClassDeclaration(
          t,
          t.modifiers,
          f.createIdentifier(ctx.name),
          t.typeParameters,
          t.heritageClauses,
          addNewLines([...t.members, ...modules]),
        )
      }
    }

    return x
  })
}

const prepareAst = async (ctx: Ctx) => {
  const types = await prepareTypes(ctx)
  const routes = await prepareRoutes(ctx)
  const modules: ts.PropertyDeclaration[] = []
  for (const [k, v] of Object.entries(routes)) {
    modules.push(prepareNs(ctx, k, v))
  }

  return filterNullable([...(await patchTemplate(ctx, modules)), ...types])
}

const addNewLines = <T extends ts.Node>(nodes: T[]) => {
  const result: T[] = []
  for (const node of nodes) {
    result.push(node)
    result.push(f.createIdentifier("\n") as unknown as T)
  }
  return result
}

export const loadSchema = async (url: string): Promise<Oas3Definition> => {
  const { bundle } = await redocly.bundle({
    ref: url,
    config: await redocly.createConfig({}),
    removeUnusedComponents: false,
  })

  if (bundle.parsed.swagger) {
    const { openapi } = await convertObj(bundle.parsed, { patch: true })
    return openapi as Oas3Definition
  }

  return bundle.parsed
}

export const printCode = async (nodes: ts.Statement[]) => {
  const code = ts
    .createPrinter()
    .printFile(
      f.createSourceFile(
        addNewLines(nodes),
        f.createToken(ts.SyntaxKind.EndOfFileToken),
        ts.NodeFlags.None,
      ),
    )
    .replaceAll("}, ", "},\n\n")

  const options = await prettier.resolveConfig(process.cwd())
  return prettier.format(code, { ...options, parser: "typescript" })
}

export const apigen = async (source: string, output: string, cfg?: GenConfig) => {
  const doc = await loadSchema(source)
  const ast = await prepareAst(initCtx(doc, cfg))

  // for (const x of ast) {
  //   try {
  //     await printCode([x])
  //   } catch (e) {
  //     console.error(`>> printCode - ${e}`, x)
  //     process.exit(1)
  //   }
  // }

  const txt = [
    `// Auto-generated by https://github.com/vladkens/apigen-ts`,
    `// Source: ${source}\n`,
    await printCode(ast),
  ].join("\n")

  await fs.mkdir(dirname(output), { recursive: true })
  await fs.writeFile(output, txt)
}
