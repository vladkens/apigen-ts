import { Oas3Definition } from "@redocly/openapi-core"
import { Oas3Operation } from "@redocly/openapi-core/lib/typings/openapi"
import { cli } from "cleye"

export type OpConfig = Oas3Operation & { method: string; path: string }
export type OpName = [string, string]

export type Config = {
  source: string
  output: string
  name: string
  parseDates: boolean
  resolveName?: (ctx: Context, op: OpConfig, proposal: OpName) => OpName | undefined
}

export type Context = Config & { doc: Oas3Definition; logTag: string; usedNames: Set<string> }

export const initCtx = (config?: Partial<Context>): Context => {
  return {
    source: "",
    output: "",
    name: "ApiClient",
    parseDates: false,
    doc: { openapi: "3.1.0" },
    ...config,
    logTag: "",
    usedNames: new Set(),
  }
}

export const getCliConfig = () => {
  const argv = cli({
    name: "apigen",
    // version: "0.0.1",
    parameters: ["<source>", "<output>"],
    flags: {
      name: {
        type: String,
        description: "api class name to export",
        default: "ApiClient",
      },
      parseDates: {
        type: Boolean,
        description: "parse dates as Date objects",
        default: false,
      },
    },
  })

  const config: Config = {
    source: argv._.source,
    output: argv._.output,
    name: argv.flags.name,
    parseDates: argv.flags.parseDates,
  }

  return config
}
