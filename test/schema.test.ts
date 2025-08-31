import type { Oas3Definition } from "@redocly/openapi-core/lib/typings/openapi"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { filterSchema } from "../src/schema"

test("filterSchema - preserves chained references", () => {
  const doc: Oas3Definition = {
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/users": {
        get: {
          tags: ["users"],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserList" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        UserList: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: { $ref: "#/components/schemas/User" },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            profile: { $ref: "#/components/schemas/Profile" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            bio: { type: "string" },
          },
        },
        UnusedSchema: {
          type: "object",
        },
      },
    },
  }

  const result = filterSchema(doc, {})

  equal(Object.keys(result.schemas).sort(), ["Profile", "User", "UserList"])
})

test.run()
