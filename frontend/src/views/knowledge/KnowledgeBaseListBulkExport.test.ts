import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as vue from 'vue'
import { fixture, flush } from '../../test-utils/vueFixture.ts'

const listURL = new URL('./KnowledgeBaseList.vue', import.meta.url)

test('knowledge list renders a bulk export action beside the create action', () => {
  const source = readFileSync(listURL, 'utf8')
  assert.match(source, /data-testid="kb-list-bulk-export"/)
  assert.match(source, /class="header-action-btn"/)
  assert.match(source, /@click="openBulkExport"/)
  assert.match(source, /<KnowledgeBulkExportDialog/)
})

test('bulk export refreshes every current-workspace KB and excludes shared KBs', async t => {
  const f = fixture(t)
  const route = vue.reactive({ params: {}, query: {} })
  const workspaceKbs = [
    { id: 'kb-own', name: '本空间知识库', updated_at: '2026-11-01T00:00:00Z' },
  ]
  const fetchKnowledgeBasesForList = t.mock.fn(async () => workspaceKbs)
  const exportWorkspaceKnowledgeBases = t.mock.fn(async () => {
    throw new Error('expected test stop')
  })
  const errorMessage = t.mock.fn()

  const { vm } = f.component(listURL, {
    'vue-router': { useRoute: () => route, useRouter: () => ({ replace() {} }) },
    'vue-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    'tdesign-vue-next': { MessagePlugin: { error: errorMessage, warning() {}, success() {} } },
    '@/utils/assistantDataChange': { useAssistantDataChange() {} },
    '@/components/settings/useConfirmDelete': { useConfirmDelete: () => ({}) },
    '@/api/knowledge-base': {
      deleteKnowledgeBase: async () => ({}),
      duplicateKnowledgeBase: async () => ({}),
      togglePinKnowledgeBase: async () => ({}),
      listKnowledgeFiles: async () => ({ data: [], total: 0 }),
      batchDownloadKnowledge: async () => new Blob(),
      downKnowledgeDetails: async () => new Blob(),
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
  await flush()
  await flush()

  vm.openBulkExport()
  assert.equal(vm.bulkExportVisible, true)

  await vm.handleBulkExport()
  const fetchArgs = fetchKnowledgeBasesForList.mock.calls.at(-1)?.arguments as any[]
  assert.equal(fetchArgs[0].creator, 'all')
  assert.equal(fetchArgs[1], true)
  const exportCalls = exportWorkspaceKnowledgeBases.mock.calls as unknown as any[][]
  const exportedKbs = exportCalls[0]?.[0] as Array<{ id: string }>
  assert.deepEqual(exportedKbs.map(kb => kb.id), ['kb-own'])
  assert.equal(errorMessage.mock.callCount(), 1)
})
