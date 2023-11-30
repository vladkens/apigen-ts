// Use uppercase for names in ApiClient to avoid conflict with the generated code

namespace apigen {
  export type Config = { baseUrl: string; headers: Record<string, string> }
  export type Req = Omit<RequestInit, "body"> & {
    search?: Record<string, unknown>
    body?: unknown
  }
}

export class ApiClient {
  ISO_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d*)?(?:[-+]\d{2}:?\d{2}|Z)?$/
  Config: apigen.Config

  constructor(config?: Partial<apigen.Config>) {
    this.Config = { baseUrl: "/", headers: {}, ...config }
  }

  PopulateDates<T>(d: T): T {
    if (d === null || d === undefined || typeof d !== "object") return d

    const t = d as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === "string" && this.ISO_FORMAT.test(v)) t[k] = new Date(v)
      else if (typeof v === "object") this.PopulateDates(v)
    }

    return d
  }

  async Fetch<T>(method: string, path: string, config: apigen.Req = {}): Promise<T> {
    const fallback = globalThis.location?.origin ?? undefined
    const url = new URL(`${this.Config.baseUrl}/${path}`.replace(/\/+/g, "/"), fallback)
    for (const [k, v] of Object.entries(config?.search ?? {})) {
      url.searchParams.append(k, Array.isArray(v) ? v.join(",") : (v as string))
    }

    const headers = new Headers({ ...this.Config.headers, ...config.headers })
    const ct = headers.get("content-type") ?? "application/json"

    let body: FormData | string | undefined = undefined
    if (ct === "multipart/form-data") {
      headers.delete("content-type") // https://stackoverflow.com/a/61053359/3664464
      body = new FormData()
      for (const [k, v] of Object.entries(config.body as Record<string, string>)) {
        body.append(k, v)
      }
    }

    if (ct === "application/json" && typeof config.body !== "string") {
      headers.set("content-type", "application/json")
      body = JSON.stringify(config.body)
    }

    const rep = await fetch(url.toString(), { method, ...config, headers, body })
    if (!rep.ok) throw rep

    const rs = await rep.text()
    try {
      return this.PopulateDates(JSON.parse(rs))
    } catch (e) {
      return rs as unknown as T
    }
  }
}
