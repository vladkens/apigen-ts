import { exec } from "child_process"
import fs from "fs/promises"
import util from "node:util"
import { apigen } from "./main"

const sources: { name: string; url: string }[] = [
  { name: "petstore-v2", url: "https://petstore.swagger.io/v2/swagger.json" },
  { name: "petstore-v3", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
]

const main = async () => {
  await fs.rm("./examples", { recursive: true, force: true })

  for (const source of sources) {
    const outfile = `./examples/${source.name}.ts`
    console.log(`>> generating ${outfile} from ${source.url}`)
    await apigen(source.url, outfile)
  }

  const cmd = `yarn tsc --noEmit examples/*.ts`
  const { stdout, stderr } = await util.promisify(exec)(cmd)
  console.log(stdout, stderr)
}

main()
