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
  namespacing: boolean
  parseDates: boolean
  inlineEnums: boolean
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
    namespacing: true,
    parseDates: false,
    inlineEnums: false,
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
      noNamespacing: {
        type: Boolean,
        description: "disable namespacing of generated methods based on the first tag",
        default: false,
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
      header: {
        type: [String],
        alias: "H",
        description:
          'HTTP header as key=value (e.g., -H "x-api-key: your-key"). Used only when generating code.',
        default: [],
      },
    },
  })

  const config: Config = {
    source: argv._.source,
    output: argv._.output ?? null,
    name: argv.flags.name,
    namespacing: !argv.flags.noNamespacing,
    parseDates: argv.flags.parseDates,
    inlineEnums: argv.flags.inlineEnums,
    headers: parseHeaders(argv.flags.header),
  }

  return config
}
