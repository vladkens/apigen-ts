import { enumerate, filterNullable } from "array-utils-ts"
import fs from "fs/promises"
import { loadSchema } from "../src/generator"
import { apigen } from "../src/main"

const BaseDir = "./scripts"

type GuruRec = { preferred: string; versions: Record<string, { swaggerUrl: string }> }
type GuruRep = Record<string, GuruRec>

const loadSpecs = async () => {
  const rep = await fetch("https://api.apis.guru/v2/list.json")
  const res = (await rep.json()) as GuruRep

  const items = Object.entries(res).map(([name, data]) => {
    return Object.entries(data.versions).map(([version, { swaggerUrl }]) => {
      const fileName = `guru_${name}_${version}.json`.replaceAll(":", "_")
      return { name: fileName, url: swaggerUrl }
    })
  })

  const specs = items.flat()
  await fs.mkdir(`${BaseDir}/specs`, { recursive: true })

  for (const [i, spec] of enumerate(specs, 1)) {
    const out = `${BaseDir}/specs/${spec.name}`
    if (await fs.stat(out).catch(() => false)) continue

    try {
      const doc = await loadSchema(spec.url, false)
      await fs.writeFile(out, JSON.stringify(doc, null, 2))
      console.log(`>> loaded ${spec.name} (${i} of ${specs.length})`)
    } catch (err) {
      console.log(`>> failed to load ${spec.name} (${i} of ${specs.length})`)
    }
  }
}

const generateClients = async () => {
  await fs.rm(`${BaseDir}/clients`, { recursive: true, force: true })
  await fs.mkdir(`${BaseDir}/clients`, { recursive: true })

  const allFiles = await fs.readdir(`${BaseDir}/specs`)
  const files = allFiles.filter((x) => x.endsWith(".json"))

  const versions: Record<string, number> = {}
  const startTime = Date.now()
  const failed: number[] = []

  let debugId: number | undefined
  for (const [i, file] of enumerate(files, 1)) {
    if (debugId && i !== debugId) continue

    const src = await fs.realpath(`${BaseDir}/specs/${file}`)
    const out = `${BaseDir}/clients/${file.replace(".json", ".ts")}`

    const doc = JSON.parse(await fs.readFile(src, "utf-8"))
    const ver = (filterNullable([doc.openapi, doc.swagger, "0.0"])[0] as string).substring(0, 3)
    versions[ver] = (versions[ver] ?? 0) + 1

    const len = files.length.toString().length
    const tag = `[${i.toString().padStart(len, " ")}/${files.length}] (${ver}) ${src}`

    try {
      await apigen({ source: `file://${src}`, output: out, parseDates: true })
      console.log(`${tag} generated`)
    } catch (err) {
      console.log(tag, "failed", err)
      failed.push(i)
      // process.exit(1)
    }
  }

  console.log("\n\n")
  const dt = Date.now() - startTime
  const fp = Object.values(versions).reduce((a, b) => a + b, 0)
  console.log(`done in ${dt / 1000}s, ${(dt / fp).toFixed(0)}ms per file`)
  console.log(`files: ${fp} failed: ${failed.length}`)
  // prettier-ignore
  console.log(`versions: ${Object.entries(versions).map((x) => x.join(" - ")).join(", ")}`)
  if (failed.length) console.log(`failed ids: ${failed.join(", ")}`)

  // NODE_OPTIONS="--max-old-space-size=8192" yarn tsc --noEmit ./scripts/clients/*.ts
  // const cmd = `yarn tsc --noEmit ${BaseDir}/clients/*.ts`
  // const { stdout, stderr } = await util.promisify(exec)(cmd, {
  //   env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  // })
  // console.log(stdout, stderr)
}

const main = async () => {
  await loadSpecs()
  await generateClients()
}

main()
