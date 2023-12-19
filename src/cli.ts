import { getCliConfig } from "./config"
import { apigen } from "./main"

const main = async () => {
  await apigen(getCliConfig())
}

main()
