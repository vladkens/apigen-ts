// Note: Use uppercase for names in ApiClient to avoid conflict with the generated code

type Headers = Record<string, string>
export type ApigenHeaders = Headers | ((method: string, path: string) => Headers | Promise<Headers>)

export interface ApigenConfig {
  baseUrl: string
  headers: ApigenHeaders
}

export interface ApigenRequest extends Omit<RequestInit, "body"> {
  search?: Record<string, unknown>
  body?: unknown
  // apigen:dates-start
  dates?: ApigenDates
  // apigen:dates-end
}

// apigen:dates-start
// where a response has date-time strings: true is a date, a string names a shape in DateShapes,
// an array applies every shape in it (oneOf, anyOf, allOf), an object maps keys ("*" for the rest)
export type ApigenDates = true | string | ApigenDates[] | { [key: string]: ApigenDates }
// apigen:dates-end

export class ApiClient {
  Config: ApigenConfig
  // apigen:dates-start
  DateShapes: Record<string, ApigenDates> = {
    // apigen:date-shapes
  }
  // apigen:dates-end

  constructor(config?: Partial<ApigenConfig>) {
    this.Config = { baseUrl: "/", headers: {}, ...config }
  }

  // apigen:dates-start
  // turns date-time strings into Date objects where the schema has them, see ApigenDates
  PopulateDates(d: unknown, s?: ApigenDates): unknown {
    if (s === true) return typeof d === "string" ? new Date(d) : d
    if (typeof s === "string") return this.PopulateDates(d, this.DateShapes[s])
    if (Array.isArray(s)) return s.reduce((acc, x) => this.PopulateDates(acc, x), d)
    if (s === undefined || d === null || typeof d !== "object") return d

    const t = d as Record<string, unknown>
    for (const [k, v] of Object.entries(t)) {
      const x = Object.prototype.hasOwnProperty.call(s, k) ? s[k] : s["*"]
      if (x !== undefined) t[k] = this.PopulateDates(v, x)
    }

    return d
  }
  // apigen:dates-end

  async ParseError(rep: Response) {
    try {
      // try to parse domain error from response body
      return await rep.json()
    } catch (e) {
      // otherwise return response as is
      throw rep
    }
  }

  PrepareFetchUrl(path: string): URL {
    let base = this.Config.baseUrl
    if ("location" in globalThis && (base === "" || base.startsWith("/"))) {
      // make ts happy in pure nodejs environment, should never pass here
      const { location } = globalThis as unknown as { location: { origin: string } }
      base = `${location.origin}${base.endsWith("/") ? base : `/${base}`}`
    }

    return new URL(path, base)
  }

  // Date values in path, query and form params are sent as ISO strings
  FormatParam(v: unknown) {
    return v instanceof Date ? v.toISOString() : v
  }

  // same as "${v}" in path template, but keeps "/", "?", "#" inside the path segment
  EncodePathParam(v: unknown) {
    return encodeURIComponent(String(this.FormatParam(v)))
  }

  // query params with explode: false, eg. Swagger 2 `collectionFormat: csv`
  JoinQueryParam(v: unknown, sep: string) {
    return Array.isArray(v) ? v.map((x) => this.FormatParam(x)).join(sep) : v
  }

  async Fetch<T>(method: string, path: string, opts: ApigenRequest = {}): Promise<T> {
    const url = this.PrepareFetchUrl(path)

    // skip omitted values; arrays repeat the key per item (OpenAPI default: form + explode)
    for (const [k, v] of Object.entries(opts?.search ?? {})) {
      for (const x of Array.isArray(v) ? v : [v]) {
        if (x !== undefined && x !== null) url.searchParams.append(k, this.FormatParam(x) as string)
      }
    }

    const configHeaders =
      typeof this.Config.headers === "function"
        ? await this.Config.headers(method, path)
        : this.Config.headers

    const headers = new Headers({ ...configHeaders, ...opts.headers })
    const ct = headers.get("content-type") ?? "application/json"

    let body: FormData | URLSearchParams | string | null = null

    if (ct === "multipart/form-data" || ct === "application/x-www-form-urlencoded") {
      // https://stackoverflow.com/a/61053359/3664464
      headers.delete("content-type")
      body = ct === "multipart/form-data" ? new FormData() : new URLSearchParams()
      for (const [k, v] of Object.entries(opts.body as Record<string, string>)) {
        if (v !== undefined && v !== null) body.append(k, this.FormatParam(v) as string)
      }
    }

    if (ct === "application/json" && typeof opts.body !== "string") {
      headers.set("content-type", "application/json")
      body = JSON.stringify(opts.body)
    }

    const credentials = opts.credentials ?? "include"
    const rep = await fetch(url.toString(), { method, ...opts, headers, body, credentials })
    if (!rep.ok) throw await this.ParseError(rep)

    const rs = await rep.text()
    try {
      // apigen:dates-start
      if (opts.dates) return this.PopulateDates(JSON.parse(rs), opts.dates) as T
      // apigen:dates-end
      return JSON.parse(rs) as T
    } catch (e) {
      return rs as unknown as T
    }
  }

  // apigen:modules
}

// apigen:types
