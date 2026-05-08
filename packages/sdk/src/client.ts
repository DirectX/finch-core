import {
  DocumentVersionSchema,
  DocumentVersionSummarySchema,
  type DocumentVersion,
  type DocumentVersionSummary,
} from "./schemas/version"
import {
  FlatClauseEntrySchema,
  type FlatClauseEntry,
} from "./schemas/clause"
import { VersionDiffSchema, type VersionDiff } from "./schemas/diff"
import { RiskReportSchema, type RiskReport } from "./schemas/risk"

export type { DocumentVersion, DocumentVersionSummary, FlatClauseEntry, VersionDiff, RiskReport }

async function apiFetch<T>(
  schema: { parse: (v: unknown) => T },
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return schema.parse(await res.json())
}

export function createClient(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "")

  return {
    listDocuments(): Promise<DocumentVersionSummary[]> {
      return apiFetch(DocumentVersionSummarySchema.array(), `${base}/documents`)
    },

    getDocument(id: string): Promise<DocumentVersion> {
      return apiFetch(DocumentVersionSchema, `${base}/documents/${id}`)
    },

    getDocumentClauses(id: string): Promise<FlatClauseEntry[]> {
      return apiFetch(FlatClauseEntrySchema.array(), `${base}/documents/${id}/clauses`)
    },

    patchClause(versionId: string, clauseId: string, title: string): Promise<DocumentVersion> {
      return apiFetch(DocumentVersionSchema, `${base}/documents/${versionId}/clauses/${clauseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
    },

    getDiff(fromId: string, toId: string): Promise<VersionDiff> {
      return apiFetch(VersionDiffSchema, `${base}/documents/${fromId}/diff/${toId}`)
    },

    getRiskReport(id: string): Promise<RiskReport> {
      return apiFetch(RiskReportSchema, `${base}/documents/${id}/risk`)
    },

    renderPdfUrl(id: string): string {
      return `${base}/documents/${id}/render/pdf`
    },

    renderDocxUrl(id: string, compareToId?: string): string {
      const url = `${base}/documents/${id}/render/docx`
      return compareToId ? `${url}?compare_to=${compareToId}` : url
    },

    uploadDocument(
      file: File,
      opts: { title?: string; author?: string } = {}
    ): EventSource {
      const form = new FormData()
      form.append("file", file)
      if (opts.title) form.append("title", opts.title)
      if (opts.author) form.append("author", opts.author)

      const url = `${base}/documents`
      const xhr = new XMLHttpRequest()
      xhr.open("POST", url)

      const es = new EventSourcePolyfill(url, form, xhr)
      return es as unknown as EventSource
    },

    uploadDocumentFetch(file: File, opts: { title?: string; author?: string } = {}) {
      const form = new FormData()
      form.append("file", file)
      if (opts.title) form.append("title", opts.title)
      if (opts.author) form.append("author", opts.author)

      return fetch(`${base}/documents`, { method: "POST", body: form })
    },
  }
}

class EventSourcePolyfill {
  private _xhr: XMLHttpRequest
  private _offset = 0
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null

  constructor(_url: string, _form: FormData, xhr: XMLHttpRequest) {
    this._xhr = xhr
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) {
        const chunk = xhr.responseText.slice(this._offset)
        this._offset = xhr.responseText.length
        this._processChunk(chunk)
      }
      if (xhr.readyState === 4 && xhr.status !== 200) {
        this.onerror?.(new Event("error"))
      }
    }
    xhr.send(_form)
  }

  private _processChunk(chunk: string) {
    const lines = chunk.split("\n")
    let eventType = "message"
    let data = ""
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim()
      } else if (line === "") {
        if (data) {
          this.onmessage?.({ type: eventType, data } as unknown as MessageEvent)
          eventType = "message"
          data = ""
        }
      }
    }
  }

  close() {
    this._xhr.abort()
  }
}
