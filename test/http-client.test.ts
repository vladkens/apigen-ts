import fetchMock from "fetch-mock"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { ApiClient } from "../src/_template"

test("apiClient dates parsing", async () => {
  const t = async <T>(body: T) => {
    try {
      const baseUrl = "http://localhost"
      const client = new ApiClient({ baseUrl })
      fetchMock.mockGlobal()
      fetchMock.route(`${baseUrl}`, { body: JSON.stringify(body) })
      return client.Fetch<T>("get", "/")
    } finally {
      fetchMock.unmockGlobal()
    }
  }

  const date = new Date("2021-01-01T00:00:00Z")
  const dateStr = date.toISOString()

  const rs = await t({ date, dates: [date], more: { date, dates: [date] } })
  equal(rs.date.toISOString(), dateStr)
  equal(rs.dates[0].toISOString(), dateStr)
  equal(rs.more.date.toISOString(), dateStr)
  equal(rs.more.dates[0].toISOString(), dateStr)
})

test("apiClient base url", async () => {
  const t = (c: ApiClient, path: string, expect: string) => {
    equal(c.PrepareFetchUrl(path).toString(), expect)
  }

  const c1 = new ApiClient({ baseUrl: "http://localhost" })
  t(c1, "/", "http://localhost/")
  t(c1, "/api/v1/cats", "http://localhost/api/v1/cats")

  const c2 = new ApiClient({ baseUrl: "https://example.com" })
  t(c2, "/", "https://example.com/")
  t(c2, "/api/v1/cats", "https://example.com/api/v1/cats")

  class MyClient extends ApiClient {
    PrepareFetchUrl(path: string) {
      return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
    }
  }

  const c3 = new MyClient({ baseUrl: "https://example.com/api/v1" })
  t(c3, "/", "https://example.com/api/v1/")
  t(c3, "/cats", "https://example.com/api/v1/cats")

  const c4 = new ApiClient({ baseUrl: "https://a.com/b/" })
  t(c4, "c/d", "https://a.com/b/c/d")
  t(c4, "/c/d", "https://a.com/c/d")
  t(c4, "../c/d", "https://a.com/c/d")
  t(c4, "../../c/d", "https://a.com/c/d")
})

test.run()
