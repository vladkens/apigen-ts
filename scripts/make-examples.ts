import { exec } from "child_process"
import util from "node:util"
import { apigen } from "../src/main"

const sources: { name: string; url: string }[] = [
  { name: "petstore2", url: "https://petstore.swagger.io/v2/swagger.json" },
  { name: "petstore3", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
  { name: "petstore31", url: "https://petstore31.swagger.io/api/v31/openapi.json" },
  { name: "features", url: "file://examples/features.yaml" },
]

const main = async () => {
  // await fs.rm("./examples", { recursive: true, force: true })

  for (const source of sources) {
    const outfile = `./examples/${source.name}.ts`
    console.log(`>> generating ${outfile} from ${source.url}`)
    await apigen({ source: source.url, output: outfile, parseDates: true })
  }

  const cmd = `yarn tsc --noEmit examples/*.ts`
  const { stdout, stderr } = await util.promisify(exec)(cmd)
  console.log(stdout, stderr)
}

main()
