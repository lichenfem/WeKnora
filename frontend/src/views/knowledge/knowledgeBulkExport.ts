import JSZip from 'jszip'
import { resolveKnowledgeDownloadFileName } from './knowledgeDownloadFileName'

export const WORKSPACE_EXPORT_PAGE_SIZE = 200
export const WORKSPACE_EXPORT_MAX_FILES = 200
export const WORKSPACE_EXPORT_MAX_BYTES = 512 * 1024 * 1024

export interface WorkspaceKnowledgeBase {
  id: string
  name: string
  type?: string
}

export interface KnowledgeFileItem {
  id: string
  type?: string
  file_path?: string
  file_size?: number
  folder_path?: string
  file_name?: string
  title?: string
}

export interface KnowledgeFilePage {
  data: KnowledgeFileItem[]
  total: number
}

export interface ExportProgress {
  completedKbs: number
  totalKbs: number
  currentKbName: string
  downloadedDocs: number
  currentKbDocs: number
  skippedDocs: number
}

export interface WorkspaceBulkExportResult {
  blob: Blob
  fileName: string
  exportedKbs: number
  exportedDocs: number
  skippedDocs: number
}

export interface WorkspaceBulkExportDeps {
  listFiles: (
    kbId: string,
    params: { page: number; page_size: number },
    options?: { signal?: AbortSignal },
  ) => Promise<KnowledgeFilePage>
  downloadBatch: (kbId: string, ids: string[], signal?: AbortSignal) => Promise<Blob>
  downloadSingle: (id: string, signal?: AbortSignal) => Promise<Blob>
}

export class WorkspaceBulkExportError extends Error {
  constructor(
    public readonly code: 'NO_EXPORTABLE_FILES',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceBulkExportError'
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('The export was aborted.', 'AbortError')
}

function isExportableSource(item: KnowledgeFileItem): boolean {
  if (!item?.id) return false
  if (item.type === 'manual') return true
  return item.type !== 'url' && Boolean(item.file_path)
}

function uniqueKnowledgeBaseFolderName(
  rawName: string,
  knowledgeBaseID: string,
  usedNames: Set<string>,
): string {
  const base = sanitizeZipSegment(rawName, `knowledge-base-${knowledgeBaseID}`)
  let candidate = base
  for (let suffix = 2; usedNames.has(candidate.toLocaleLowerCase()); suffix += 1) {
    candidate = `${base} (${suffix})`
  }
  usedNames.add(candidate.toLocaleLowerCase())
  return candidate
}

function sanitizeZipSegment(raw: string, fallback: string): string {
  let value = String(raw ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.\s_]+|[.\s_]+$/g, '')
  if (!value || value === '.' || value === '..') {
    value = fallback
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    value = `_${value}`
  }
  return value.slice(0, 160).replace(/[.\s]+$/g, '') || fallback
}

function sanitizeInnerArchivePath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .map(segment => sanitizeZipSegment(segment, 'document'))
    .join('/')
}

function joinArchivePath(...parts: string[]): string {
  return parts.filter(Boolean).join('/')
}

function uniqueArchiveFilePath(filePath: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(filePath.toLocaleLowerCase())) {
    usedPaths.add(filePath.toLocaleLowerCase())
    return filePath
  }

  const slash = filePath.lastIndexOf('/')
  const directory = slash >= 0 ? filePath.slice(0, slash + 1) : ''
  const filename = slash >= 0 ? filePath.slice(slash + 1) : filePath
  const dot = filename.lastIndexOf('.')
  const extension = dot > 0 ? filename.slice(dot) : ''
  const stem = dot > 0 ? filename.slice(0, dot) : filename

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${directory}${stem} (${suffix})${extension}`
    if (!usedPaths.has(candidate.toLocaleLowerCase())) {
      usedPaths.add(candidate.toLocaleLowerCase())
      return candidate
    }
  }
}

function makeBatches(items: KnowledgeFileItem[]): KnowledgeFileItem[][] {
  const batches: KnowledgeFileItem[][] = []
  let current: KnowledgeFileItem[] = []
  let currentBytes = 0

  for (const item of items) {
    const itemBytes = Math.max(0, Number(item.file_size) || 0)
    const exceedsCount = current.length >= WORKSPACE_EXPORT_MAX_FILES
    const exceedsBytes = current.length > 0
      && currentBytes + itemBytes > WORKSPACE_EXPORT_MAX_BYTES
    if (exceedsCount || exceedsBytes) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(item)
    currentBytes += itemBytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function isBatchSizeError(error: unknown): boolean {
  const candidate = error as { status?: number; $httpStatus?: number; message?: string } | null
  const status = candidate?.status ?? candidate?.$httpStatus
  return status === 400 && /512\s*MiB/i.test(candidate?.message ?? '')
}

async function copyInnerArchive(
  target: JSZip,
  innerBlob: Blob,
  prefix: string,
  usedPaths: Set<string>,
): Promise<number> {
  const inner = await JSZip.loadAsync(new Uint8Array(await innerBlob.arrayBuffer()))
  let copied = 0
  for (const entry of Object.values(inner.files)) {
    if (entry.dir) continue
    const archivePath = sanitizeInnerArchivePath(entry.name)
    if (!archivePath) continue
    const data = await entry.async('uint8array')
    target.file(
      uniqueArchiveFilePath(joinArchivePath(prefix, archivePath), usedPaths),
      data,
    )
    copied += 1
  }
  return copied
}

export async function exportWorkspaceKnowledgeBases(
  knowledgeBases: WorkspaceKnowledgeBase[],
  deps: WorkspaceBulkExportDeps,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: ExportProgress) => void
  } = {},
): Promise<WorkspaceBulkExportResult> {
  throwIfAborted(options.signal)
  const outer = new JSZip()
  const usableKnowledgeBases = knowledgeBases.filter(kb => kb.id && kb.type !== 'faq')
  const usedFolderNames = new Set<string>()
  let completedKbs = 0
  let exportedDocs = 0
  let skippedDocs = 0

  for (const kb of usableKnowledgeBases) {
    throwIfAborted(options.signal)
    const rawItems: KnowledgeFileItem[] = []
    for (let page = 1; ; page += 1) {
      throwIfAborted(options.signal)
      const result = await deps.listFiles(
        kb.id,
        { page, page_size: WORKSPACE_EXPORT_PAGE_SIZE },
        { signal: options.signal },
      )
      throwIfAborted(options.signal)
      const pageItems = result.data ?? []
      rawItems.push(...pageItems)
      if (pageItems.length === 0 || rawItems.length >= Number(result.total || 0)) break
    }

    const sourceItems = rawItems.filter(isExportableSource)
    skippedDocs += rawItems.length - sourceItems.length
    if (sourceItems.length === 0) continue

    const folder = uniqueKnowledgeBaseFolderName(kb.name, kb.id, usedFolderNames)
    const usedPaths = new Set<string>()

    const addBatch = async (items: KnowledgeFileItem[]): Promise<void> => {
      throwIfAborted(options.signal)
      try {
        const innerBlob = await deps.downloadBatch(
          kb.id,
          items.map(item => item.id),
          options.signal,
        )
        throwIfAborted(options.signal)
        exportedDocs += await copyInnerArchive(outer, innerBlob, folder, usedPaths)
      } catch (error) {
        if (!isBatchSizeError(error)) throw error
        if (items.length > 1) {
          const midpoint = Math.ceil(items.length / 2)
          await addBatch(items.slice(0, midpoint))
          await addBatch(items.slice(midpoint))
          return
        }

        const item = items[0]
        const fileBlob = await deps.downloadSingle(item.id, options.signal)
        throwIfAborted(options.signal)
        const filename = sanitizeZipSegment(
          resolveKnowledgeDownloadFileName(item),
          `${item.id}.bin`,
        )
        const folderPath = sanitizeInnerArchivePath(item.folder_path ?? '')
        const fileBytes = new Uint8Array(await fileBlob.arrayBuffer())
        outer.file(
          uniqueArchiveFilePath(joinArchivePath(folder, folderPath, filename), usedPaths),
          fileBytes,
        )
        exportedDocs += 1
      }
    }

    for (const batch of makeBatches(sourceItems)) {
      await addBatch(batch)
      options.onProgress?.({
        completedKbs,
        totalKbs: usableKnowledgeBases.length,
        currentKbName: kb.name,
        downloadedDocs: exportedDocs,
        currentKbDocs: sourceItems.length,
        skippedDocs,
      })
    }
    completedKbs += 1
    options.onProgress?.({
      completedKbs,
      totalKbs: usableKnowledgeBases.length,
      currentKbName: kb.name,
      downloadedDocs: exportedDocs,
      currentKbDocs: sourceItems.length,
      skippedDocs,
    })
  }

  if (exportedDocs === 0) {
    throw new WorkspaceBulkExportError(
      'NO_EXPORTABLE_FILES',
      'No exportable source files were found in the current workspace.',
    )
  }

  throwIfAborted(options.signal)
  const blob = await outer.generateAsync({
    type: 'blob',
    compression: 'STORE',
  })
  throwIfAborted(options.signal)
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return {
    blob,
    fileName: `weknora-workspace-source-files-${timestamp}.zip`,
    exportedKbs: completedKbs,
    exportedDocs,
    skippedDocs,
  }
}
