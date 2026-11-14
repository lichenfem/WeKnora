import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'

import {
  exportWorkspaceKnowledgeBases,
  type KnowledgeFileItem,
  type WorkspaceBulkExportDeps,
  type WorkspaceKnowledgeBase,
} from './knowledgeBulkExport.ts'

async function createZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content)
  }
  return zip.generateAsync({ type: 'blob' })
}

async function loadZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()))
}

function createDeps(options: {
  filesByKb: Record<string, KnowledgeFileItem[]>
  batch?: WorkspaceBulkExportDeps['downloadBatch']
  single?: WorkspaceBulkExportDeps['downloadSingle']
}): WorkspaceBulkExportDeps {
  return {
    listFiles: async (kbId, params) => {
      const items = options.filesByKb[kbId] ?? []
      const start = (params.page - 1) * params.page_size
      return {
        data: items.slice(start, start + params.page_size),
        total: items.length,
      }
    },
    downloadBatch: options.batch ?? (async (_kbId, ids) => createZip(
      Object.fromEntries(ids.map(id => [`docs/${id}.txt`, id])),
    )),
    downloadSingle: options.single ?? (async id => new Blob([id])),
  }
}

test('exports only source files from each workspace knowledge base', async () => {
  const knowledgeBases: WorkspaceKnowledgeBase[] = [
    { id: 'kb-a', name: '知识库 A', type: 'document' },
    { id: 'kb-empty', name: '空知识库', type: 'document' },
    { id: 'kb-faq', name: 'FAQ', type: 'faq' },
  ]
  const result = await exportWorkspaceKnowledgeBases(
    knowledgeBases,
    createDeps({
      filesByKb: {
        'kb-a': [
          { id: 'file-1', type: 'file', file_path: 'stored-a', file_size: 10 },
          { id: 'manual-1', type: 'manual', title: '手工记录', file_size: 5 },
          { id: 'url-1', type: 'url', file_path: 'snapshot.html', file_size: 8 },
        ],
        'kb-empty': [],
        'kb-faq': [{ id: 'faq-1', type: 'manual', title: '不应进入文档库导出' }],
      },
      batch: async (_kbId, ids) => createZip(Object.fromEntries(ids.map(id => {
        if (id === 'manual-1') return ['notes/手工记录.md', 'manual']
        return ['docs/report.pdf', 'file']
      }))),
    }),
  )

  const zip = await loadZip(result.blob)
  assert.deepEqual(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort(), [
    '知识库 A/docs/report.pdf',
    '知识库 A/notes/手工记录.md',
  ])
  assert.equal(result.exportedKbs, 1)
  assert.equal(result.exportedDocs, 2)
})

test('paginates files and keeps every batch at or below 200 documents', async () => {
  const batchSizes: number[] = []
  const files = Array.from({ length: 201 }, (_, index): KnowledgeFileItem => ({
    id: `file-${index}`,
    type: 'file',
    file_path: `stored-${index}`,
    file_size: 1,
  }))

  await exportWorkspaceKnowledgeBases(
    [{ id: 'kb-a', name: 'A' }],
    createDeps({
      filesByKb: { 'kb-a': files },
      batch: async (_kbId, ids) => {
        batchSizes.push(ids.length)
        return createZip(Object.fromEntries(ids.map(id => [`${id}.txt`, id])))
      },
    }),
  )

  assert.deepEqual(batchSizes, [200, 1])
})

test('disambiguates duplicate and unsafe knowledge base folder names', async () => {
  const result = await exportWorkspaceKnowledgeBases(
    [
      { id: 'kb-a', name: 'Docs' },
      { id: 'kb-b', name: 'Docs' },
      { id: 'kb-c', name: '../unsafe/name' },
    ],
    createDeps({
      filesByKb: {
        'kb-a': [{ id: 'a', type: 'file', file_path: 'a' }],
        'kb-b': [{ id: 'b', type: 'file', file_path: 'b' }],
        'kb-c': [{ id: 'c', type: 'file', file_path: 'c' }],
      },
      batch: async (_kbId, ids) => createZip(
        Object.fromEntries(ids.map(id => [`${id}.txt`, id])),
      ),
    }),
  )

  const zip = await loadZip(result.blob)
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
  assert.ok(names.includes('Docs/a.txt'))
  assert.ok(names.includes('Docs (2)/b.txt'))
  assert.ok(names.includes('unsafe_name/c.txt'))
  assert.ok(names.every(name => !name.includes('..') && !name.startsWith('/')))
})

test('splits an oversized batch before writing the outer archive', async () => {
  const batchCalls: string[][] = []
  const result = await exportWorkspaceKnowledgeBases(
    [{ id: 'kb-a', name: 'A' }],
    createDeps({
      filesByKb: {
        'kb-a': [
          { id: 'large-a', type: 'file', file_path: 'a', file_size: 1 },
          { id: 'large-b', type: 'file', file_path: 'b', file_size: 1 },
        ],
      },
      batch: async (_kbId, ids) => {
        batchCalls.push(ids)
        if (ids.length > 1) {
          throw Object.assign(new Error('所选文件合计超过 512 MiB，请分批下载'), { status: 400 })
        }
        return createZip({ [`${ids[0]}.txt`]: ids[0] })
      },
    }),
  )

  assert.deepEqual(batchCalls, [['large-a', 'large-b'], ['large-a'], ['large-b']])
  const zip = await loadZip(result.blob)
  assert.ok(zip.file('A/large-a.txt'))
  assert.ok(zip.file('A/large-b.txt'))
})

test('keeps duplicate filenames from separate batches instead of overwriting them', async () => {
  const result = await exportWorkspaceKnowledgeBases(
    [{ id: 'kb-a', name: 'A' }],
    createDeps({
      filesByKb: {
        'kb-a': [
          { id: 'first', type: 'file', file_path: 'first', file_size: 512 * 1024 * 1024 },
          { id: 'second', type: 'file', file_path: 'second', file_size: 1 },
        ],
      },
      batch: async (_kbId, ids) => createZip({ 'docs/report.txt': ids[0] }),
    }),
  )

  const zip = await loadZip(result.blob)
  assert.equal(await zip.file('A/docs/report.txt')?.async('string'), 'first')
  assert.equal(await zip.file('A/docs/report (2).txt')?.async('string'), 'second')
})

test('falls back to a single authenticated download for a file over the batch limit', async () => {
  const singles: string[] = []
  const result = await exportWorkspaceKnowledgeBases(
    [{ id: 'kb-a', name: 'A' }],
    createDeps({
      filesByKb: {
        'kb-a': [{
          id: 'manual-large',
          type: 'manual',
          title: '大文档',
          folder_path: 'notes',
          file_size: 600 * 1024 * 1024,
        }],
      },
      batch: async () => {
        throw Object.assign(new Error('所选文件合计超过 512 MiB，请分批下载'), { status: 400 })
      },
      single: async id => {
        singles.push(id)
        return new Blob(['manual source'])
      },
    }),
  )

  assert.deepEqual(singles, ['manual-large'])
  const zip = await loadZip(result.blob)
  assert.equal(await zip.file('A/notes/大文档.md')?.async('string'), 'manual source')
})

test('does not produce an archive after abort or a knowledge base read failure', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    exportWorkspaceKnowledgeBases(
      [{ id: 'kb-a', name: 'A' }],
      createDeps({
        filesByKb: { 'kb-a': [{ id: 'a', type: 'file', file_path: 'a' }] },
      }),
      { signal: controller.signal },
    ),
    error => error instanceof DOMException && error.name === 'AbortError',
  )

  await assert.rejects(
    exportWorkspaceKnowledgeBases(
      [
        { id: 'kb-a', name: 'A' },
        { id: 'kb-b', name: 'B' },
      ],
      createDeps({
        filesByKb: {
          'kb-a': [{ id: 'a', type: 'file', file_path: 'a' }],
          'kb-b': [{ id: 'b', type: 'file', file_path: 'b' }],
        },
        batch: async (kbId, ids) => {
          if (kbId === 'kb-b') throw new Error('storage unavailable')
          return createZip(Object.fromEntries(ids.map(id => [`${id}.txt`, id])))
        },
      }),
    ),
    /storage unavailable/,
  )
})

test('reports no files when every workspace knowledge base is empty', async () => {
  await assert.rejects(
    exportWorkspaceKnowledgeBases(
      [{ id: 'kb-empty', name: 'Empty' }],
      createDeps({ filesByKb: { 'kb-empty': [] } }),
    ),
    (error: any) => error?.code === 'NO_EXPORTABLE_FILES',
  )
})
