import { Oas3Definition } from "@redocly/openapi-core"
import { Oas3Operation } from "@redocly/openapi-core/lib/typings/openapi"
import { cli } from "cleye"
import { name, version } from "../package.json"

export type OpConfig = Oas3Operation & { method: string; path: string }
export type OpName = [string, string]

export type Config = {
  source: string
  output: string | null
  name: string
  parseDates: boolean
  inlineEnums: boolean
  fetchOptions: boolean
  filterPaths?: RegExp | ((path: string) => boolean)
  includeTags?: string[]
  excludeTags?: string[]
  resolveName?: (ctx: Context, op: OpConfig, proposal: OpName) => OpName | undefined
  headers: Record<string, string>
}

export type Context = Config & { doc: Oas3Definition; logTag: string; usedNames: Set<string> }

export const initCtx = (config?: Partial<Context>): Context => {
  return {
    source: "",
    output: "",
    name: "ApiClient",
    doc: { openapi: "3.1.0" },
    parseDates: false,
    inlineEnums: false,
    fetchOptions: false,
    headers: {},
    ...config,
    logTag: "",
    usedNames: new Set(),
  }
}

const parseHeaders = (items: string[]): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const item of items) {
    const [key, val] = item.split(":")
    if (key && val) headers[key.trim()] = val.trim()
  }

  return headers
}

export const getCliConfig = () => {
  const argv = cli({
    name,
    version,
    parameters: ["<source>", "[output]"],
    flags: {
      name: {
        type: String,
        description: "API class name to export",
        default: "ApiClient",
      },
      parseDates: {
        type: Boolean,
        description: "Parse dates as Date objects",
        default: false,
      },
      inlineEnums: {
        type: Boolean,
        description: "Use inline enums instead of enum types",
        default: false,
      },
      fetchOptions: {
        type: Boolean,
        description: "Add fetch options (e.g. AbortSignal) as last argument to each method",
        default: false,
      },
      header: {
        type: [String],
        alias: "H",
        description:
          'HTTP header as key=value (e.g., -H "x-api-key: your-key"). Used only when generating code.',
        default: [],
      },
      filterPaths: {
        type: String,
        description: "Filter endpoints by path regex (e.g., --filter-paths '^/accounts')",
      },
      includeTags: {
        type: [String],
        description: "Only include operations with these tags (comma-separated or repeated flag)",
        default: [],
      },
      excludeTags: {
        type: [String],
        description: "Exclude operations with these tags (comma-separated or repeated flag)",
        default: [],
      },
    },
  })

  const parseTags = (items: string[]): string[] | undefined => {
    const tags = items
      .flatMap((x) => x.split(","))
      .map((x) => x.trim())
      .filter(Boolean)
    return tags.length ? tags : undefined
  }

  const filterPaths = argv.flags.filterPaths ? new RegExp(argv.flags.filterPaths) : undefined
  const includeTags = parseTags(argv.flags.includeTags)
  const excludeTags = parseTags(argv.flags.excludeTags)

  const config: Config = {
    source: argv._.source,
    output: argv._.output ?? null,
    name: argv.flags.name,
    parseDates: argv.flags.parseDates,
    inlineEnums: argv.flags.inlineEnums,
    fetchOptions: argv.flags.fetchOptions,
    headers: parseHeaders(argv.flags.header),
    ...(filterPaths ? { filterPaths } : {}),
    ...(includeTags ? { includeTags } : {}),
    ...(excludeTags ? { excludeTags } : {}),
  }

  return config
}
