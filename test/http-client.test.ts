import fetchMock from "fetch-mock"
import { test } from "uvu"
import { equal } from "uvu/assert"
import { ApiClient } from "../src/_template"

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

test("apiClient dates parsing", async () => {
  const date = new Date("2021-01-01T00:00:00Z")
  const dateStr = date.toISOString()

  const rs = await t({ date, dates: [date], more: { date, dates: [date] } })
  equal(rs.date.toISOString(), dateStr)
  equal(rs.dates[0].toISOString(), dateStr)
  equal(rs.more.date.toISOString(), dateStr)
  equal(rs.more.dates[0].toISOString(), dateStr)
})

test("apiClient base url", async () => {
  const c1 = new ApiClient({ baseUrl: "http://localhost" })
  equal(c1.PrepareFetchUrl("/").toString(), "http://localhost/")
  equal(c1.PrepareFetchUrl("/api/v1/cats").toString(), "http://localhost/api/v1/cats")

  const c2 = new ApiClient({ baseUrl: "https://example.com" })
  equal(c2.PrepareFetchUrl("/").toString(), "https://example.com/")
  equal(c2.PrepareFetchUrl("/api/v1/cats").toString(), "https://example.com/api/v1/cats")

  class MyClient extends ApiClient {
    PrepareFetchUrl(path: string) {
      return new URL(`${this.Config.baseUrl}/${path}`.replace(/\/{2,}/g, "/"))
    }
  }

  const c3 = new MyClient({ baseUrl: "https://example.com/api/v1" })
  equal(c3.PrepareFetchUrl("/").toString(), "https://example.com/api/v1/")
  equal(c3.PrepareFetchUrl("/cats").toString(), "https://example.com/api/v1/cats")
})

test.run()
