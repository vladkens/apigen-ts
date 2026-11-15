import { trim } from "lodash-es"
import { strictEqual as equal } from "node:assert"
import { test } from "node:test"
import ts from "typescript"
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

  // should fill (url-encoded) replacement if match
  const e = (x: string) => "${this.EncodePathParam(" + x + ")}"
  equal(await t("/{ver}", { ver: "ver" }), `/${e("ver")}`)
  equal(await t("/{ver}/before", { ver: "ver" }), `/${e("ver")}/before`)
  equal(await t("/users/{id}", { id: "id" }), `/users/${e("id")}`)
  equal(await t("/users/{id}/update", { id: "id" }), `/users/${e("id")}/update`)
  equal(
    await t("/users/{id}/update/{k}", { id: "id", k: "k" }),
    `/users/${e("id")}/update/${e("k")}`,
  )
  equal(await t("/users/{id}/{id}", { id: "id" }), `/users/${e("id")}/${e("id")}`)
  equal(await t("/users/{id}/{id}/{ver}", { id: "id" }), `/users/${e("id")}/${e("id")}/{ver}`)

  // should keep trailing slash
  equal(await t("/users/", {}), "/users/")
  equal(await t("/users/{id}/", { id: "id" }), `/users/${e("id")}/`)
  equal(await t("/users/{id}/update/", { id: "id" }), `/users/${e("id")}/update/`)
  equal(await t("/users/{id}/update/", {}), "/users/{id}/update/")
  equal(await t("/users/{id}/{id}/{ver}/", { id: "id" }), `/users/${e("id")}/${e("id")}/{ver}/`)

  // should rename
  equal(await t("/{ver}", { ver: "version" }), `/${e("version")}`)
  equal(await t("/users/{id}/update", { id: "idx" }), `/users/${e("idx")}/update`)
  equal(await t("/users/{id}/update/{id}", { id: "idx" }), `/users/${e("idx")}/update/${e("idx")}`)
  equal(
    await t("/users/{id}/u/{id}/{ver}", { id: "idx" }),
    `/users/${e("idx")}/u/${e("idx")}/{ver}`,
  )
})
