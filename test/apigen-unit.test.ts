import { Oas3Schema } from "@redocly/openapi-core"
import { trim } from "lodash-es"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { getOpName, initCtx, makeTypeAlias, prepareUrl, printCode } from "../src/main"

const ctx = initCtx({ openapi: "3.0.0" })

test("make operation name", async () => {
  const t = (method: string, path: string, tags?: string[], operationId?: string) => {
    const cfg = { method, path, tags, operationId, responses: {} }
    return getOpName(ctx, cfg).join(".")
  }

  equal(t("get", "/users", ["users"], "getUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "getUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "users_getUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "Users_getUsers"), "users.getUsers")

  // skip when op start with Tag, TagController, TagService
  equal(t("get", "/users", ["users"], "UsersController_getUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "usersController_getUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "usersService_getUsers"), "users.getUsers")

  // different case
  equal(t("get", "/users", ["users"], "usersService_GetUsers"), "users.getUsers")
  equal(t("get", "/users", ["USERS"], "usersService_GetUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "USERSService_GetUsers"), "users.getUsers")

  // plural vs single form
  equal(t("get", "/users", ["users"], "userService_GetUsers"), "users.getUsers")
  equal(t("get", "/users", ["users"], "USERService_GetUsers"), "users.getUsers")
  equal(t("get", "/users", ["USERS"], "userService_GetUsers"), "users.getUsers")

  // when tag blank
  equal(t("get", "/users", [], "getUsers"), "general.getUsers")
  equal(t("get", "/users", [], "Users_getUsers"), "general.usersGetUsers")
  equal(t("get", "/users", [], "UsersService_getUsers"), "general.usersServiceGetUsers")

  // when op blank
  equal(t("get", "/users", ["users"], ""), "users.getUsers")
  equal(t("get", "/users/{id}", ["users"], ""), "users.getUsersId")
  equal(t("put", "/users/{id}/update", ["users"], ""), "users.putUsersIdUpdate")
  equal(t("get", "/api/users", ["users"], ""), "users.getUsers")
  equal(t("get", "/api/v1/users", ["users"], ""), "users.getUsers")
  equal(t("get", "/api/v1.0/users", ["users"], ""), "users.getUsers")
  equal(t("get", "/api/1.0/users", ["users"], ""), "users.getUsers")
  equal(t("get", "/api/1/users", ["users"], ""), "users.getUsers")

  // reserved name
  // equal(t("get", "/fetch", ["fetch"], "fetch"), "users.getUsers")
})

test("make type alias", async () => {
  const t = async (s: Oas3Schema, name = "t") => {
    const node = makeTypeAlias(ctx, name, s)
    const code = await printCode([node])
    return code
      .replace("export ", "")
      .replaceAll("\n", " ")
      .replaceAll("\t", " ")
      .replace(/ +/g, " ")
      .trim()
  }

  equal(await t({ type: "string" }), `type t = string`)
  equal(await t({ type: "number" }), `type t = number`)
  equal(await t({ type: "boolean" }), `type t = boolean`)

  equal(await t({ type: "array", items: { type: "string" } }), `type t = string[]`)
  equal(await t({ type: "array", items: { type: "number" } }), `type t = number[]`)
  equal(await t({ type: "array", items: { type: "boolean" } }), `type t = boolean[]`)

  equal(await t({ type: "string", enum: ["a", "b"] }), `enum t { A = "a", B = "b", }`)
  // equal(await t({ type: "number", enum: ["a", "b"] }), `enum t { A = "a", B = "b", }`)
  // equal(await t({ type: "number", enum: [1, 2] }), `enum t { A = "a", B = "b", }`)

  // custom types
  equal(await t({ type: "string", format: "date-time" }), `type t = Date`)
  equal(await t({ type: "string", format: "binary" }), `type t = File`)

  // check for reserved words
  equal(await t({ type: "string" }, "for"), `type $for = string`)
  equal(await t({ type: "string" }, "type"), `type type = string`) // todo: should be escaped?

  // check for bad names
  equal(await t({ type: "string" }, "a1"), `type a1 = string`)
  equal(await t({ type: "string" }, "1"), `type $1 = string`)
  equal(await t({ type: "string" }, "1a"), `type $1a = string`)
  equal(await t({ type: "string" }, "1.1"), `type $1_1 = string`)

  // object
  equal(await t({ type: "object" }), `type t = object`) // todo: should be unknown?
  equal(
    await t({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    }),
    `type t = { a: string b?: number }`, // no ";" between
  )
})

test("make url template", async () => {
  const t = async (url: string, replacements: Record<string, string>) => {
    // @ts-expect-error
    const code = await printCode([prepareUrl(url, replacements)])
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
