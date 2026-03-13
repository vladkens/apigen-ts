import { exec } from "child_process"
import util from "node:util"
import { apigen } from "../src/main"

type SourceDoc = {
  name: string
  url: string
  filterPaths?: RegExp
  includeTags?: string[]
  excludeTags?: string[]
}

const sources: SourceDoc[] = [
  { name: "petstore2", url: "https://petstore.swagger.io/v2/swagger.json" },
  { name: "petstore3", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
  { name: "petstore31", url: "https://petstore31.swagger.io/api/v31/openapi.json" },
  { name: "features", url: "file://examples/features.yaml" },
  {
    name: "petstore3-pet",
    url: "https://petstore3.swagger.io/api/v3/openapi.json",
    filterPaths: /^\/pet/,
  },
  {
    name: "petstore3-store",
    url: "https://petstore3.swagger.io/api/v3/openapi.json",
    includeTags: ["store"],
  },
  {
    name: "petstore3-no-user",
    url: "https://petstore3.swagger.io/api/v3/openapi.json",
    excludeTags: ["user"],
  },
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
      ...(source.filterPaths ? { filterPaths: source.filterPaths } : {}),
      ...(source.includeTags ? { includeTags: source.includeTags } : {}),
      ...(source.excludeTags ? { excludeTags: source.excludeTags } : {}),
    })
  }

  const cmd = `npx tsc --noEmit examples/*.ts`
  const { stdout, stderr } = await util.promisify(exec)(cmd)
  console.log(stdout, stderr)
}

main()
