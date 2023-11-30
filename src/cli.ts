import { cli } from "cleye"
import { apigen } from "./main"

const main = async () => {
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
    },
  })

  await apigen(argv._.source, argv._.output, { name: argv.flags.name })
}

main()
