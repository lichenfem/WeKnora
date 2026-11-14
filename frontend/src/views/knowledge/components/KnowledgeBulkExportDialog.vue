<template>
  <t-dialog
    :visible="visible"
    :footer="false"
    :close-on-overlay-click="!exporting"
    :close-btn="!exporting"
    width="480px"
    dialog-class-name="knowledge-bulk-export-dialog"
    @close="handleClose"
  >
    <template #header>
      <div class="bulk-export-heading">
        <div class="bulk-export-title-row">
          <t-icon name="download" size="18px" aria-hidden="true" />
          <span>{{ $t('knowledgeList.bulkExport.title') }}</span>
        </div>
        <p>{{ $t('knowledgeList.bulkExport.description') }}</p>
      </div>
    </template>

    <div v-if="isConfirming" class="bulk-export-body">
      <p>{{ $t('knowledgeList.bulkExport.scopePrompt') }}</p>
      <p class="bulk-export-note">{{ $t('knowledgeList.bulkExport.structure') }}</p>
    </div>

    <div v-else class="bulk-export-body">
      <div v-if="hasError" class="bulk-export-error" role="alert">
        <t-icon name="error-circle" size="18px" />
        <div>
          <strong>{{ $t('knowledgeList.bulkExport.failed') }}</strong>
          <p>{{ errorText }}</p>
        </div>
      </div>

      <template v-else>
        <t-progress :percentage="progressPercent" size="small" />
        <p class="bulk-export-current">{{ currentKbLabel }}</p>
        <p v-if="progress" class="bulk-export-stats">
          {{ $t('knowledgeList.bulkExport.kbProgress', {
            done: progress.completedKbs,
            total: progress.totalKbs,
          }) }}
          ·
          {{ $t('knowledgeList.bulkExport.docProgress', {
            count: progress.downloadedDocs,
          }) }}
          <template v-if="progress.skippedDocs > 0">
            ·
            {{ $t('knowledgeList.bulkExport.skipped', { count: progress.skippedDocs }) }}
          </template>
        </p>
      </template>
    </div>

    <div class="bulk-export-footer">
      <t-button
        v-if="exporting"
        data-testid="bulk-export-cancel"
        variant="outline"
        size="small"
        @click="emitCancel"
      >
        {{ $t('knowledgeList.bulkExport.cancel') }}
      </t-button>
      <template v-else>
        <t-button variant="outline" size="small" @click="handleClose">
          {{ $t('knowledgeList.bulkExport.close') }}
        </t-button>
        <t-button
          data-testid="bulk-export-start"
          theme="primary"
          size="small"
          @click="emitStart"
        >
          {{ hasError ? $t('knowledgeList.bulkExport.retry') : $t('knowledgeList.bulkExport.start') }}
        </t-button>
      </template>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ExportProgress } from '../knowledgeBulkExport'

const { t } = useI18n()
const props = defineProps<{
  visible: boolean
  exporting: boolean
  progress?: ExportProgress
  error?: string
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'start'): void
  (event: 'cancel'): void
}>()

const hasError = computed(() => Boolean(props.error))
const isConfirming = computed(() => !props.exporting && !hasError.value)
const canClose = computed(() => !props.exporting)
const errorText = computed(() => props.error ?? '')
const progressPercent = computed(() => {
  if (!props.progress || props.progress.totalKbs <= 0) return 0
  const percentage = Math.floor(
    (props.progress.completedKbs / props.progress.totalKbs) * 100,
  )
  return Math.max(0, Math.min(100, percentage))
})
const currentKbLabel = computed(() => {
  const name = props.progress?.currentKbName ?? ''
  return name ? t('knowledgeList.bulkExport.currentKb', { name }) : ''
})

function emitStart(): void {
  if (props.exporting) return
  emit('start')
}

function emitCancel(): void {
  if (props.exporting) {
    emit('cancel')
    return
  }
  handleClose()
}

function handleClose(): void {
  if (!canClose.value) return
  emit('update:visible', false)
}
</script>

<style>
.knowledge-bulk-export-dialog {
  overflow: hidden;
}

.knowledge-bulk-export-dialog .t-dialog__header {
  padding: 20px 20px 0;
}

.knowledge-bulk-export-dialog .t-dialog__body {
  padding: 0 20px 20px;
}
</style>

<style scoped>
.bulk-export-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 28px;
}

.bulk-export-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--td-text-color-primary);
  font-size: var(--app-text-lg);
  font-weight: 600;
}

.bulk-export-heading p,
.bulk-export-body p,
.bulk-export-error p {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  line-height: 1.55;
}

.bulk-export-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bulk-export-note,
.bulk-export-current {
  color: var(--td-text-color-placeholder) !important;
}

.bulk-export-stats {
  font-variant-numeric: tabular-nums;
}

.bulk-export-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  color: var(--td-error-color);
  background: var(--td-error-color-light);
  border-radius: var(--app-radius-sm);
}

.bulk-export-error > .t-icon {
  flex-shrink: 0;
}

.bulk-export-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--td-component-stroke);
}
</style>
