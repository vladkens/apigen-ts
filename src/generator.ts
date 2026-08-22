import {
  BaseResolver,
  createConfig,
  Oas3Definition,
  Oas3PathItem,
  bundle as redoclyBundle,
  Referenced,
} from "@redocly/openapi-core"
import { filterEmpty, filterNullable } from "array-utils-ts"
import { isObject, lowerFirst, sortBy, uniqBy, upperFirst } from "lodash-es"
import { convertObj } from "swagger2openapi"
import ts from "typescript"
import { Context, OpConfig, OpName } from "./config"
import { getRepSchema, getReqSchema, OAS3, unref } from "./schema"
import { makeType, makeTypeAlias, normalizeIdentifier } from "./type-gen"

const f = ts.factory
type Routes = Record<string, ts.PropertyAssignment[]>
type Param = { name: string; schema?: Referenced<OAS3> }

const HttpMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
  "query",
] as const

const normalizeOpName = (val: string) => {
  const articles = new Set(["a", "an", "the"])
  const tmp = val
    .replace(/'/, "") // case when plain text: User's -> Users
    .replace(/[^a-zA-Z0-9]/g, "_")
    .split("_")
    .filter((x) => x !== "" && !articles.has(x))
    .map((x) => upperFirst(x) as string)

  // eg: SSHKey -> sshKey
  tmp[0] = tmp[0].toUpperCase() === tmp[0] ? tmp[0].toLowerCase() : lowerFirst(tmp[0])
  return tmp.join("")
}

export const getOpName = (ctx: Context, op: OpConfig) => {
  let ns = normalizeOpName(filterEmpty(op.tags ?? [])[0] ?? "general")
  let fn = op.operationId ?? null

  // if not opId, try to make it from path
  if (!fn) {
    fn = op.path.replace(/^(\/api)?(\/v?\d\.?\d?)?\/(.+)$/, "$3") // /api/v1.0/users -> /users
    fn = `${op.method}/${fn}`.replace(/\/+/, "/")
  }

  fn = normalizeOpName(fn)

  // prettier-ignore
  // https://stackoverflow.com/a/58818125/3664464
  let nsr = ns.split("").map((x) => `[${x.toUpperCase()}${x.toLowerCase()}]`).join("")
  if (nsr.endsWith("[Ss]")) nsr += "?"

  // remove prefix if same with ns and / or starts with Controller / Service
  fn = fn.replace(new RegExp(`^${nsr}([Cc]ontroller|[Ss]ervice)?([A-Z].*)$`), "$2")
  fn = lowerFirst(fn)

  const proposal: OpName = [ns, fn]

  if (ctx.resolveName) {
    const res = ctx.resolveName(ctx, op, proposal)
    if (Array.isArray(res) && res.length === 2) return res
    if (res !== undefined) {
      console.warn(`${ctx.logTag} resolveName should return [ns, fn] or undefined (skipping)`)
    }
  }

  return proposal
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

const prepareOp = (ctx: Context, cfg: OpConfig, opName: string, httpMethod: string) => {
  cfg.parameters = cfg.parameters ?? []

  const reqSchema = getReqSchema(ctx, cfg)
  const repSchema = getRepSchema(ctx, cfg)
  const allParams = filterNullable(cfg.parameters.map((x) => unref(ctx, x)))

  // prettier-ignore
  const params: Param[] = uniqBy(allParams.filter((x) => x.in === "path"), "name")
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

  if (ctx.fetchOptions) {
    fnArgs.push(
      f.createParameterDeclaration(
        undefined,
        undefined,
        "opts",
        f.createToken(ts.SyntaxKind.QuestionToken),
        f.createTypeReferenceNode(f.createIdentifier("ApigenRequest"), undefined),
      ),
    )
  }

  const cbArgs = filterNullable([
    ctx.fetchOptions ? f.createSpreadAssignment(f.createIdentifier("opts")) : undefined,
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
              f.createStringLiteral(httpMethod), // method
              prepareUrl(cfg.path, urlReplacements), // path
              f.createObjectLiteralExpression(cbArgs), // { query, body, headers }
            ],
          ),
        ),
      ]),
    ),
  )
}

const prepareNs = (ctx: Context, name: string, handlers: ts.PropertyAssignment[]) => {
  return f.createPropertyDeclaration(
    undefined,
    normalizeIdentifier(name),
    undefined,
    undefined,
    f.createObjectLiteralExpression(handlers),
  )
}

const addOp = (
  ctx: Context,
  routes: Routes,
  pathConfig: Oas3PathItem,
  cfg: OpConfig,
  httpMethod: string,
) => {
  ctx.logTag = `${httpMethod.padEnd(6, " ")} ${cfg.path}`

  if (pathConfig.parameters) {
    cfg.parameters = [...(cfg.parameters ?? []), ...pathConfig.parameters]
  }

  const opTags = (cfg.tags ?? []) as string[]
  if (ctx.includeTags?.length && !opTags.some((t) => ctx.includeTags!.includes(t))) return
  if (ctx.excludeTags?.length && opTags.some((t) => ctx.excludeTags!.includes(t))) return

  const [ns, op] = getOpName(ctx, cfg)
  if (!routes[ns]) routes[ns] = []

  const joined = [ns, op].join(".")
  if (ctx.usedNames.has(joined)) {
    // console.warn(`${ctx.tag} duplicate operation ${joined} (skipping)`)
    return
  } else {
    ctx.usedNames.add(joined)
  }

  try {
    routes[ns].push(prepareOp(ctx, cfg, op, httpMethod))
  } catch (e) {
    console.error(`${ctx.logTag} - ${e}`, cfg)
    throw e
  }
}

const prepareRoutes = async (ctx: Context) => {
  const routes: Routes = {}

  for (const [path, value] of Object.entries(ctx.doc.paths ?? {})) {
    ctx.logTag = `${"[ALL]".toUpperCase().padEnd(6, " ")} ${path}`
    if (!isObject(value)) continue

    if (ctx.filterPaths) {
      const match =
        ctx.filterPaths instanceof RegExp ? ctx.filterPaths.test(path) : ctx.filterPaths(path)
      if (!match) continue
    }

    const pathConfig = unref(ctx, value)
    if (!pathConfig) continue

    // OpenAPI 3.2 stores custom HTTP methods in additionalOperations, preserving their casing.
    for (const method of HttpMethods) {
      const config = pathConfig[method]
      if (!config) continue
      addOp(ctx, routes, pathConfig, { ...config, method, path }, method.toUpperCase())
    }

    for (const [method, value] of Object.entries(pathConfig.additionalOperations ?? {})) {
      const config = unref(ctx, value)
      if (!config) continue
      addOp(ctx, routes, pathConfig, { ...config, method, path }, method)
    }
  }

  return routes
}

const prepareTypes = async (ctx: Context) => {
  const types: ts.DeclarationStatement[] = []
  const typesConfig = sortBy(Object.entries(ctx.doc.components?.schemas ?? {}), ([k]) => k)
  for (const [name, config] of typesConfig) {
    try {
      types.push(makeTypeAlias(ctx, name, config))
    } catch (e) {
      console.error(`${ctx.logTag} - ${e}`, name, config)
      throw e
    }
  }
  return types
}

export const generateAst = async (ctx: Context) => {
  const types = await prepareTypes(ctx)
  const routes = await prepareRoutes(ctx)
  const modules: ts.PropertyDeclaration[] = []
  for (const [k, v] of Object.entries(routes)) {
    modules.push(prepareNs(ctx, k, v))
  }

  return { modules, types }
}

export const loadSchema = async ({
  url,
  upgrade = true,
  headers = {},
}: {
  url: string
  upgrade?: boolean
  headers?: Record<string, string>
}): Promise<Oas3Definition> => {
  if (url.startsWith("file://")) url = url.substring(7)

  const { bundle } = await redoclyBundle({
    ref: url,
    config: await createConfig({}),
    removeUnusedComponents: false,
    externalRefResolver: new BaseResolver({
      http: {
        headers: Object.entries(headers).map(([name, value]) => {
          // https://github.com/isaacs/minimatch?tab=readme-ov-file#noglobstar
          return { name, value, matches: "**" }
        }),
      },
    }),
  })

  const parsed = bundle.parsed as Oas3Definition | Parameters<typeof convertObj>[0]
  if ("swagger" in parsed && upgrade) {
    const { openapi } = await convertObj(parsed, { patch: true })
    return openapi as Oas3Definition
  }

  return parsed as Oas3Definition
}
