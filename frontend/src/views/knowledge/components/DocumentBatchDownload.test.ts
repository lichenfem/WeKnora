import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const knowledgeBase = readFileSync(new URL('../KnowledgeBase.vue', import.meta.url), 'utf8')
const batchBar = readFileSync(new URL('./DocumentBatchBar.vue', import.meta.url), 'utf8')
const listView = readFileSync(new URL('./DocumentListView.vue', import.meta.url), 'utf8')
const knowledgeApi = readFileSync(new URL('../../../api/knowledge-base/index.ts', import.meta.url), 'utf8')
const request = readFileSync(new URL('../../../utils/request.ts', import.meta.url), 'utf8')
const knowledgeList = readFileSync(new URL('../KnowledgeBaseList.vue', import.meta.url), 'utf8')
const bulkExportDialog = readFileSync(new URL('./KnowledgeBulkExportDialog.vue', import.meta.url), 'utf8')
const localeNames = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'ru-RU']

test('批量下载使用受认证的 Blob 请求并支持取消', () => {
  assert.match(knowledgeApi, /knowledge-bases\/\$\{encodeURIComponent\(kbId\)\}\/knowledge\/batch-download/)
  assert.match(knowledgeApi, /responseType:\s*'blob'/)
  assert.match(knowledgeApi, /signal,/)
  assert.match(knowledgeBase, /new AbortController\(\)/)
  assert.match(knowledgeBase, /batchDownloadController\?\.abort\(\)/)
})

test('批量下载界面限制单批 200 项并保留只读权限边界', () => {
  assert.match(batchBar, /v-if="canDownload"/)
  assert.match(batchBar, /count > 200/)
  assert.match(batchBar, /batch-download-trigger/)
  assert.match(batchBar, /v-if="canMutate"/)
  assert.match(knowledgeBase, /isBatchDownloadableKnowledge/)
  assert.match(knowledgeBase, /ids\.length > MAX_BATCH_DOWNLOAD_FILES/)
  assert.match(knowledgeBase, /:can-download="canDownloadKnowledge"/)
  assert.match(knowledgeBase, /@select-loaded="toggleSelectAll\(true\)"/)
  assert.match(listView, /v-if="canEdit \|\| canDownload"/)
})

test('Blob 格式的 JSON 错误会还原为可读消息', () => {
  assert.match(request, /error\.response\.data instanceof Blob/)
  assert.match(request, /JSON\.parse\(text\)/)
  assert.match(request, /text\.startsWith\('\{'\)/)
})

test('当前工作空间批量导出复用统一头按钮并接入确认弹窗', () => {
  assert.match(knowledgeList, /data-testid="kb-list-bulk-export"/)
  assert.match(knowledgeList, /class="header-action-btn"/)
  assert.match(knowledgeList, /@click="openBulkExport"/)
  assert.match(knowledgeList, /<KnowledgeBulkExportDialog/)
  assert.match(bulkExportDialog, /data-testid="bulk-export-start"/)
  assert.match(bulkExportDialog, /data-testid="bulk-export-cancel"/)
})

test('所有支持语言都包含工作空间批量导出文案', () => {
  const requiredKeys = [
    'action',
    'title',
    'description',
    'scopePrompt',
    'structure',
    'start',
    'currentKb',
    'kbProgress',
    'docProgress',
    'cancel',
    'completed',
    'failed',
    'retry',
    'noFiles',
    'skipped',
    'close',
  ]
  for (const localeName of localeNames) {
    const locale = readFileSync(
      new URL(`../../../i18n/locales/${localeName}.ts`, import.meta.url),
      'utf8',
    )
    assert.match(locale, /bulkExport:\s*\{/, `${localeName} missing bulkExport`)
    for (const key of requiredKeys) {
      assert.match(locale, new RegExp(`\\b${key}:`), `${localeName} missing ${key}`)
    }
  }
})
