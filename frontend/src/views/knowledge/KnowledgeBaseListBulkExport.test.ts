import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as vue from 'vue'
import { fixture, flush } from '../../test-utils/vueFixture.ts'

const listURL = new URL('./KnowledgeBaseList.vue', import.meta.url)

function createKnowledgeListFixture(
  t: Parameters<typeof fixture>[0],
  options: {
    preflightErrorOnce?: unknown
  } = {},
) {
  const calls: string[] = []
  const route = vue.reactive({ params: {}, query: {} })
  const workspaceKbs = [
    { id: 'kb-own', name: '本空间知识库', updated_at: '2026-11-01T00:00:00Z' },
  ]
  const preflightWorkspaceExport = t.mock.fn(async () => {
    calls.push('preflight')
    if (options.preflightErrorOnce) {
      const error = options.preflightErrorOnce
      options.preflightErrorOnce = undefined
      throw error
    }
    return {
      knowledge_base_count: 1,
      file_count: 1,
      conflict_count: 0,
    }
  })
  const fetchKnowledgeBasesForList = t.mock.fn(async () => {
    calls.push('fetch')
    return workspaceKbs
  })
  const exportWorkspaceKnowledgeBases = t.mock.fn(async () => {
    calls.push('export')
    throw new Error('expected test stop')
  })
  const listKnowledgeFiles = t.mock.fn(async () => {
    calls.push('listFiles')
    return { data: [], total: 0 }
  })
  const batchDownloadKnowledge = t.mock.fn(async () => {
    calls.push('batchDownload')
    return new Blob()
  })
  const downKnowledgeDetails = t.mock.fn(async () => {
    calls.push('singleDownload')
    return new Blob()
  })
  const errorMessage = t.mock.fn()
  const warningMessage = t.mock.fn()

  const f = fixture(t)
  const { vm } = f.component(listURL, {
    'vue-router': { useRoute: () => route, useRouter: () => ({ replace() {} }) },
    'vue-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    'tdesign-vue-next': {
      MessagePlugin: { error: errorMessage, warning: warningMessage, success() {} },
    },
    '@/utils/assistantDataChange': { useAssistantDataChange() {} },
    '@/components/settings/useConfirmDelete': { useConfirmDelete: () => ({}) },
    '@/api/knowledge-base': {
      deleteKnowledgeBase: async () => ({}),
      duplicateKnowledgeBase: async () => ({}),
      togglePinKnowledgeBase: async () => ({}),
      listKnowledgeFiles,
      batchDownloadKnowledge,
      downKnowledgeDetails,
      preflightWorkspaceExport,
    },
    '@/api/organization': { listOrganizationSharedKnowledgeBases: async () => ({ success: true, data: [] }) },
    '@/stores/chatResources': {
      useChatResourcesStore: () => ({
        fetchKnowledgeBasesForList,
        invalidateKnowledgeBaseDetail() {},
      }),
    },
    '@/stores/ui': {
      useUIStore: () => vue.reactive({
        showKBEditorModal: false,
        closeKBEditor() {},
        openKBSettings() {},
        openCreateKB() {},
      }),
    },
    '@/stores/auth': {
      useAuthStore: () => ({
        hasRole: () => true,
        isLiteMode: false,
        effectiveTenantId: 1,
        user: { id: 'user-1' },
      }),
    },
    '@/stores/organization': {
      useOrganizationStore: () => vue.reactive({
        sharedKnowledgeBases: [{
          knowledge_base: { id: 'kb-shared', name: '共享知识库' },
          permission: 'editor',
        }],
        organizations: [],
        fetchSharedKnowledgeBases: async () => {},
        fetchOrganizations: async () => {},
        resourceCounts: undefined,
        getKBPermission: () => 'owner',
      }),
    },
    '@/utils/index': { formatStringDate: (date: Date) => date.toISOString().slice(0, 10) },
    '@/utils/resourceListSearch': { matchesResourceQuery: () => true },
    '@/utils/resourceSorting': { sortResourcesWithinGroups: (items: any[]) => items },
    '@/utils/card-list-badge': { shouldShowResourceOriginBadge: () => false },
    '@/utils/kbPermission': { permissionCanManageKB: () => true },
    '@/config/contextualGuides': {
      isContextualGuideDone: () => true,
      markContextualGuideDone() {},
    },
    '@/composables/useTenantModelReadiness': {
      useTenantModelReadiness: () => ({
        loaded: vue.ref(true),
        isReadyForDocumentKb: vue.computed(() => true),
      }),
    },
    '@/composables/useListUrlState': {
      useListUrlState: () => ({
        scope: vue.ref('all'),
        creator: vue.ref('all'),
        query: vue.ref(''),
      }),
    },
    '@/composables/useResourcePins': {
      useResourcePins: () => ({
        favorites: vue.ref([]),
        recents: vue.ref([]),
        touchRecent() {},
        toggleFavorite() {},
        isFavorite: () => false,
      }),
    },
    './knowledgeBulkExport': {
      exportWorkspaceKnowledgeBases,
      WorkspaceBulkExportError: class extends Error {},
    },
  })

  return {
    vm,
    calls,
    workspaceKbs,
    preflightWorkspaceExport,
    fetchKnowledgeBasesForList,
    exportWorkspaceKnowledgeBases,
    listKnowledgeFiles,
    batchDownloadKnowledge,
    downKnowledgeDetails,
    errorMessage,
    warningMessage,
  }
}

test('knowledge list renders a bulk export action beside the create action', () => {
  const source = readFileSync(listURL, 'utf8')
  assert.match(source, /data-testid="kb-list-bulk-export"/)
  assert.match(source, /class="header-action-btn"/)
  assert.match(source, /@click="openBulkExport"/)
  assert.match(source, /<KnowledgeBulkExportDialog/)
})

test('bulk export refreshes every current-workspace KB and excludes shared KBs', async t => {
  const {
    vm,
    calls,
    fetchKnowledgeBasesForList,
    exportWorkspaceKnowledgeBases,
    errorMessage,
  } = createKnowledgeListFixture(t)
  await flush()
  await flush()

  vm.openBulkExport()
  assert.equal(vm.bulkExportVisible, true)

  await vm.handleBulkExport()
  const fetchArgs = fetchKnowledgeBasesForList.mock.calls.at(-1)?.arguments as any[]
  assert.equal(fetchArgs[0].creator, 'all')
  assert.equal(fetchArgs[1], true)
  assert.deepEqual(calls.slice(0, 2), ['preflight', 'fetch'])
  assert.equal(
    exportWorkspaceKnowledgeBases.mock.callCount(),
    1,
    JSON.stringify(errorMessage.mock.calls),
  )
  const exportCall = exportWorkspaceKnowledgeBases.mock.calls[0] as unknown as {
    arguments: [Array<{ id: string }>, unknown, unknown]
  }
  const exportedKbs = exportCall.arguments[0]
  assert.deepEqual(exportedKbs.map(kb => kb.id), ['kb-own'])
  assert.equal(errorMessage.mock.callCount(), 1)
})

test('stops before fetching or downloading when preflight reports path conflicts', async t => {
  const conflictDetails = {
    conflicts: [{
      reason: 'file_directory_conflict',
      knowledge_base_id: 'kb-own',
      knowledge_base_name: '本空间知识库',
      conflict_path: 'report.pdf',
      file_name: 'report.pdf',
      conflicting_directory_file_name: 'notes.md',
    }],
    conflict_count: 1,
    truncated: false,
  }
  const {
    vm,
    fetchKnowledgeBasesForList,
    exportWorkspaceKnowledgeBases,
    listKnowledgeFiles,
    batchDownloadKnowledge,
    downKnowledgeDetails,
  } = createKnowledgeListFixture(t, {
    preflightErrorOnce: {
      status: 409,
      message: '检测到文件与文件夹路径冲突，请修改名称后重试',
      success: false,
      error: {
        code: 409,
        message: '检测到文件与文件夹路径冲突，请修改名称后重试',
        details: conflictDetails,
      },
    },
  })
  await flush()
  await flush()

  await vm.handleBulkExport()

  assert.equal(fetchKnowledgeBasesForList.mock.callCount(), 0)
  assert.equal(exportWorkspaceKnowledgeBases.mock.callCount(), 0)
  assert.equal(listKnowledgeFiles.mock.callCount(), 0)
  assert.equal(batchDownloadKnowledge.mock.callCount(), 0)
  assert.equal(downKnowledgeDetails.mock.callCount(), 0)
  assert.deepEqual(vm.bulkExportConflictDetails, conflictDetails)
  assert.match(vm.bulkExportError, /pathConflict/)
})

test('retry runs workspace preflight again before starting the export', async t => {
  const {
    vm,
    preflightWorkspaceExport,
    exportWorkspaceKnowledgeBases,
  } = createKnowledgeListFixture(t, {
    preflightErrorOnce: {
      status: 409,
      error: {
        message: 'conflict',
        details: {
          conflicts: [{
            reason: 'file_directory_conflict',
            knowledge_base_id: 'kb-own',
            knowledge_base_name: '本空间知识库',
            conflict_path: 'report.pdf',
            file_name: 'report.pdf',
            conflicting_directory_file_name: 'notes.md',
          }],
          conflict_count: 1,
          truncated: false,
        },
      },
    },
  })
  await flush()
  await flush()

  await vm.handleBulkExport()
  await vm.handleBulkExport()

  assert.equal(preflightWorkspaceExport.mock.callCount(), 2)
  assert.equal(exportWorkspaceKnowledgeBases.mock.callCount(), 1)
})
