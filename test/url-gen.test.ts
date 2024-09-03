import { trim } from "lodash-es"
import ts from "typescript"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { prepareUrl } from "../src/generator"
import { printCode } from "../src/printer"

test("url template", async () => {
  const t = async (url: string, replacements: Record<string, string>) => {
    const code = printCode([prepareUrl(url, replacements) as unknown as ts.Statement])
    return trim(trim(code.trim(), ";"), '`"')
  }

  // should no fill template if no replacements
  equal(await t("/{ver}", {}), "/{ver}")
  equal(await t("/{ver}/before", {}), "/{ver}/before")
  equal(await t("/users", {}), "/users")
  equal(await t("/users/{id}", {}), "/users/{id}")
  equal(await t("/users/{id}/update", {}), "/users/{id}/update")

  // should no fill replacement if no match
  const abc = "abc"
  equal(await t("/{ver}", { abc }), "/{ver}")
  equal(await t("/{ver}/before", { abc }), "/{ver}/before")
  equal(await t("/users", { abc }), "/users")
  equal(await t("/users/{id}", { abc }), "/users/{id}")
  equal(await t("/users/{id}/update", { abc }), "/users/{id}/update")

  // should fill replacement if match
  equal(await t("/{ver}", { ver: "ver" }), "/${ver}")
  equal(await t("/{ver}/before", { ver: "ver" }), "/${ver}/before")
  equal(await t("/users/{id}", { id: "id" }), "/users/${id}")
  equal(await t("/users/{id}/update", { id: "id" }), "/users/${id}/update")
  equal(await t("/users/{id}/update/{k}", { id: "id", k: "k" }), "/users/${id}/update/${k}")
  equal(await t("/users/{id}/{id}", { id: "id" }), "/users/${id}/${id}")
  equal(await t("/users/{id}/{id}/{ver}", { id: "id" }), "/users/${id}/${id}/{ver}")

  // should keep trailing slash
  equal(await t("/users/", {}), "/users/")
  equal(await t("/users/{id}/", { id: "id" }), "/users/${id}/")
  equal(await t("/users/{id}/update/", { id: "id" }), "/users/${id}/update/")
  equal(await t("/users/{id}/update/", {}), "/users/{id}/update/")
  equal(await t("/users/{id}/{id}/{ver}/", { id: "id" }), "/users/${id}/${id}/{ver}/")

  // should rename
  equal(await t("/{ver}", { ver: "version" }), "/${version}")
  equal(await t("/users/{id}/update", { id: "idx" }), "/users/${idx}/update")
  equal(await t("/users/{id}/update/{id}", { id: "idx" }), "/users/${idx}/update/${idx}")
  equal(await t("/users/{id}/u/{id}/{ver}", { id: "idx" }), "/users/${idx}/u/${idx}/{ver}")
})

test.run()
