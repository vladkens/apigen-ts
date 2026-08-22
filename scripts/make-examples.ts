import { exec } from "child_process"
import util from "node:util"
import { apigen } from "../src/main"

type SourceDoc = {
  name: string
  url: string
}

const sources: SourceDoc[] = [
  { name: "petstore2", url: "https://petstore.swagger.io/v2/swagger.json" },
  { name: "petstore3", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
  { name: "local.openapi31", url: "file://scripts/example-specs/openapi31.yml" },
  { name: "local.openapi32", url: "file://scripts/example-specs/openapi32.yml" },
]

const main = async () => {
  // await fs.rm("./examples", { recursive: true, force: true })

  for (const source of sources) {
    const outfile = `./examples/${source.name}.ts`
    console.log(`>> generating ${outfile} from ${source.url}`)
    await apigen({
      source: source.url,
      output: outfile,
      parseDates: true,
      fetchOptions: false,
    })
  }

  const cmd = `pnpm exec tsc --ignoreConfig --noEmit examples/*.ts`
  const { stdout, stderr } = await util.promisify(exec)(cmd)
  console.log(stdout, stderr)
}

main()
