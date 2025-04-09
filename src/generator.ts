import redocly, { BaseResolver, Oas3Definition } from "@redocly/openapi-core"
import { filterEmpty, filterNullable } from "array-utils-ts"
import { isObject, lowerFirst, sortBy, uniqBy, upperFirst } from "lodash-es"
import { convertObj } from "swagger2openapi"
import ts from "typescript"
import { Context, OpConfig, OpName } from "./config"
import { getRepSchema, getReqSchema, unref } from "./schema"
import { makeType, makeTypeAlias, normalizeIdentifier } from "./type-gen"

const f = ts.factory
const HttpMethods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const

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

const prepareOp = (ctx: Context, cfg: OpConfig, opName: string) => {
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

const prepareNs = (ctx: Context, name: string, handlers: ts.PropertyAssignment[]) => {
  return f.createPropertyDeclaration(
    undefined,
    normalizeIdentifier(name),
    undefined,
    undefined,
    f.createObjectLiteralExpression(handlers),
  )
}

const prepareRoutes = async (ctx: Context) => {
  const routes: Record<string, ts.PropertyAssignment[]> = {}

  for (const [path, pathConfig] of Object.entries(ctx.doc.paths ?? {})) {
    ctx.logTag = `${"[ALL]".toUpperCase().padEnd(6, " ")} ${path}`
    if (!isObject(pathConfig)) continue

    if ("$ref" in pathConfig) {
      console.warn(`${ctx.logTag} $ref should be resolved before (skipping)`)
      continue
    }

    for (const method of HttpMethods) {
      ctx.logTag = `${method.toUpperCase().padEnd(6, " ")} ${path}`

      const config = pathConfig[method]
      if (!config) continue

      if (pathConfig.parameters) {
        config.parameters = [...(config.parameters ?? []), ...pathConfig.parameters]
      }

      const [ns, op] = getOpName(ctx, { ...config, method, path })
      if (!routes[ns]) routes[ns] = []

      const joined = [ns, op].join(".")
      if (ctx.usedNames.has(joined)) {
        // console.warn(`${ctx.tag} duplicate operation ${joined} (skipping)`)
        continue
      } else {
        ctx.usedNames.add(joined)
      }

      try {
        routes[ns].push(prepareOp(ctx, { ...config, method, path }, op))
      } catch (e) {
        console.error(`${ctx.logTag} - ${e}`, config)
        throw e
      }
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

  const { bundle } = await redocly.bundle({
    ref: url,
    config: await redocly.createConfig({}),
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

  if (bundle.parsed.swagger && upgrade) {
    const { openapi } = await convertObj(bundle.parsed, { patch: true })
    return openapi as Oas3Definition
  }

  return bundle.parsed
}
