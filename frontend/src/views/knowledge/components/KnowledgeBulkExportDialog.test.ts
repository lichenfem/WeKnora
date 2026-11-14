import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fixture, flush } from '../../../test-utils/vueFixture.ts'

const componentURL = new URL('./KnowledgeBulkExportDialog.vue', import.meta.url)

function mountDialog(t: Parameters<typeof fixture>[0], props: Record<string, unknown>) {
  const f = fixture(t)
  const page = f.component(componentURL, {
    'vue-i18n': {
      useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params ?? {})}` }),
    },
  }, props)
  return { ...f, ...page }
}

test('shows confirmation copy before an export starts', async t => {
  const { vm } = mountDialog(t, { visible: true, exporting: false })
  await flush()

  assert.equal(vm.isConfirming, true)
  assert.equal(vm.canClose, true)
  assert.equal(vm.progressPercent, 0)
})

test('shows progress while exporting and prevents closing the dialog', async t => {
  const { vm } = mountDialog(t, {
    visible: true,
    exporting: true,
    progress: {
      completedKbs: 2,
      totalKbs: 4,
      currentKbName: '知识库 C',
      downloadedDocs: 12,
      currentKbDocs: 8,
      skippedDocs: 3,
    },
  })
  await flush()

  assert.equal(vm.isConfirming, false)
  assert.equal(vm.canClose, false)
  assert.equal(vm.progressPercent, 50)
  assert.match(vm.currentKbLabel, /知识库 C/)
})

test('shows the final error without pretending the export succeeded', async t => {
  const { vm } = mountDialog(t, {
    visible: true,
    exporting: false,
    error: 'storage unavailable',
  })
  await flush()

  assert.equal(vm.hasError, true)
  assert.equal(vm.canClose, true)
  assert.match(vm.errorText, /storage unavailable/)
})

test('shows structured file and directory conflicts with retry available', async t => {
  const { vm } = mountDialog(t, {
    visible: true,
    exporting: false,
    error: 'knowledgeList.bulkExport.pathConflict',
    conflictDetails: {
      conflicts: [{
        reason: 'file_directory_conflict',
        knowledge_base_id: 'kb-1',
        knowledge_base_name: '项目资料',
        conflict_path: 'report.pdf',
        file_name: 'report.pdf',
        conflicting_directory_file_name: 'notes.md',
      }],
      conflict_count: 1,
      truncated: false,
    },
  })
  await flush()

  assert.equal(vm.hasPathConflicts, true)
  assert.equal(vm.conflictItems.length, 1)
  assert.match(vm.conflictItems[0], /项目资料/)
  assert.match(vm.conflictItems[0], /report\.pdf/)
  assert.equal(vm.canClose, true)
})

test('dialog template exposes start, cancel and progress actions', () => {
  const source = readFileSync(componentURL, 'utf8')
  assert.match(source, /data-testid="bulk-export-start"/)
  assert.match(source, /data-testid="bulk-export-cancel"/)
  assert.match(source, /data-testid="bulk-export-conflicts"/)
  assert.match(source, /<t-progress/)
  assert.match(source, /:close-on-overlay-click="!exporting"/)
})
