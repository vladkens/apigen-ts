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

  async ParseError(rep: Response) {
    try {
      // try to parse domain error from response body
      return await rep.json()
    } catch (e) {
      // otherwise return response as is
      throw rep
    }
  }

  async Fetch<T>(method: string, path: string, opts: apigen.Req = {}): Promise<T> {
    let base = this.Config.baseUrl
    if (globalThis.location && (base === "" || base.startsWith("/"))) {
      base = `${globalThis.location.origin}${base.endsWith("/") ? base : `/${base}`}`
    }

    const url = new URL(path, base)
    for (const [k, v] of Object.entries(opts?.search ?? {})) {
      url.searchParams.append(k, Array.isArray(v) ? v.join(",") : (v as string))
    }

    const headers = new Headers({ ...this.Config.headers, ...opts.headers })
    const ct = headers.get("content-type") ?? "application/json"

    let body: FormData | URLSearchParams | string | undefined = undefined

    if (ct === "multipart/form-data" || ct === "application/x-www-form-urlencoded") {
      headers.delete("content-type") // https://stackoverflow.com/a/61053359/3664464
      body = ct === "multipart/form-data" ? new FormData() : new URLSearchParams()
      for (const [k, v] of Object.entries(opts.body as Record<string, string>)) {
        body.append(k, v)
      }
    }

    if (ct === "application/json" && typeof opts.body !== "string") {
      headers.set("content-type", "application/json")
      body = JSON.stringify(opts.body)
    }

    const credentials = opts.credentials ?? "include"
    const rep = await fetch(url.toString(), { method, ...opts, headers, body, credentials })
    if (!rep.ok) throw this.ParseError(rep)

    const rs = await rep.text()
    try {
      return this.PopulateDates(JSON.parse(rs))
    } catch (e) {
      return rs as unknown as T
    }
  }
}
