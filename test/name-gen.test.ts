import { test } from "uvu"
import { equal } from "uvu/assert"
import { initCtx } from "../src/config"
import { getOpName } from "../src/generator"

test("operation name", async () => {
  const t = (method: string, path: string, tags?: string[], operationId?: string) => {
    const ctx = initCtx()
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

test.run()
