<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type {
  UploadRawFile,
  UploadRequestOptions,
  UploadUserFile,
} from 'element-plus';
import { http } from '../utils/request';

interface ImportError {
  row: number;
  reason: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  geocoded: number;
  errors: ImportError[];
}

const router = useRouter();

const currentStep = ref<number>(0);

const fileList = ref<UploadUserFile[]>([]);
const lastUploadedFile = ref<UploadRawFile | null>(null);
const uploading = ref<boolean>(false);
const importResult = ref<ImportResult | null>(null);

const skipFailed = ref<boolean>(true);
const completing = ref<boolean>(false);
const progress = ref<number>(0);

const hasFailures = computed<boolean>(
  () => (importResult.value?.errors.length ?? 0) > 0,
);

const isUploading = computed<boolean>(() => uploading.value);

function rowClassName(_opts: { row: ImportError; rowIndex: number }): string {
  return 'row-error';
}

function beforeUpload(file: UploadRawFile): boolean {
  const name = file.name.toLowerCase();
  const isXlsx =
    name.endsWith('.xlsx') ||
    file.type.includes('spreadsheet') ||
    file.type.includes('excel');
  if (!isXlsx) {
    ElMessage.warning('请上传 .xlsx 文件');
    return false;
  }
  return true;
}

async function customUpload(options: UploadRequestOptions): Promise<void> {
  lastUploadedFile.value = options.file;
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const res = await http.post<ImportResult>('/customers/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    importResult.value = res.data;
    currentStep.value = 1;
    ElMessage.success(
      `上传完成：成功 ${res.data.imported}，失败 ${res.data.errors.length}`,
    );
    options.onSuccess?.(res.data);
  } catch {
    ElMessage.error('导入失败，请重试');
    options.onError?.({
      name: 'UploadAjaxError',
      message: 'import failed',
      status: 0,
      method: 'POST',
      url: '/api/customers/import',
    });
  } finally {
    uploading.value = false;
  }
}

function onRemoveFile(): void {
  fileList.value = [];
  importResult.value = null;
  currentStep.value = 0;
  lastUploadedFile.value = null;
}

async function retryGeocode(): Promise<void> {
  const file = lastUploadedFile.value;
  if (!file) {
    ElMessage.warning('没有可重试的文件');
    return;
  }
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await http.post<ImportResult>('/customers/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    importResult.value = res.data;
    ElMessage.success('已重新提交坐标补全');
  } catch {
    ElMessage.error('补全失败');
  } finally {
    uploading.value = false;
  }
}

function goNext(): void {
  currentStep.value = 2;
}

async function confirmImport(): Promise<void> {
  completing.value = true;
  progress.value = 0;
  try {
    if (!skipFailed.value && hasFailures.value && lastUploadedFile.value) {
      const file = lastUploadedFile.value;
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post<ImportResult>('/customers/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      importResult.value = res.data;
      progress.value = 100;
    } else {
      progress.value = 100;
    }
    currentStep.value = 3;
    const r = importResult.value;
    ElMessage.success(
      `导入完成：成功 ${r?.imported ?? 0}，失败 ${r?.errors.length ?? 0}`,
    );
  } catch {
    ElMessage.error('确认失败');
  } finally {
    completing.value = false;
  }
}

function backToList(): void {
  router.push('/customers');
}
</script>

<template>
  <div class="import-page">
    <header class="page-header">
      <h2>客户导入</h2>
      <el-button @click="backToList">返回列表</el-button>
    </header>

    <el-steps :active="currentStep" finish-status="success" align-center>
      <el-step title="上传文件" description="选择 .xlsx 文件" />
      <el-step title="预览结果" description="检查导入状态" />
      <el-step title="确认导入" description="处理失败行" />
      <el-step title="完成" description="查看汇总" />
    </el-steps>

    <section v-if="currentStep === 0" class="step-panel">
      <el-upload
        drag
        :http-request="customUpload"
        :before-upload="beforeUpload"
        :on-remove="onRemoveFile"
        :file-list="fileList"
        accept=".xlsx"
      >
        <div class="upload-prompt">
          <div class="upload-title">将 .xlsx 文件拖到此处，或点击上传</div>
          <div class="upload-sub">仅支持 .xlsx 格式，第一行需包含编码、名称等列头</div>
        </div>
      </el-upload>
      <div v-if="isUploading" class="upload-status">
        <el-progress :percentage="50" :indeterminate="true" :stroke-width="14" />
      </div>
    </section>

    <section v-else-if="currentStep === 1" class="step-panel">
      <el-descriptions
        v-if="importResult"
        :column="4"
        border
        class="summary"
      >
        <el-descriptions-item label="成功导入">
          <el-tag type="success">{{ importResult.imported }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="已跳过">
          <el-tag type="warning">{{ importResult.skipped }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="已补全坐标">
          <el-tag type="primary">{{ importResult.geocoded }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="失败行数">
          <el-tag :type="hasFailures ? 'danger' : 'info'">
            {{ importResult.errors.length }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-table
        v-if="importResult"
        :data="importResult.errors"
        border
        stripe
        :row-class-name="rowClassName"
        empty-text="没有失败行，全部导入成功"
      >
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="row" label="行号" width="120" />
        <el-table-column prop="reason" label="失败原因" min-width="320" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default>
            <el-button
              size="small"
              type="primary"
              link
              :loading="uploading"
              @click="retryGeocode"
            >
              补全坐标
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="hasFailures" class="hint hint-error">
        有 {{ importResult?.errors.length ?? 0 }} 行导入失败，请检查后点击「补全坐标」重试
      </div>
      <div v-else class="hint hint-ok">本次导入无失败行</div>

      <footer class="step-actions">
        <el-button @click="currentStep = 0">上一步</el-button>
        <el-button type="primary" @click="goNext">下一步</el-button>
      </footer>
    </section>

    <section v-else-if="currentStep === 2" class="step-panel">
      <el-card>
        <p class="confirm-line">请确认本次导入的结果：</p>
        <el-checkbox v-model="skipFailed">
          跳过失败行（不重试坐标补全）
        </el-checkbox>
        <p v-if="!skipFailed && hasFailures" class="hint">
          将使用原文件重新提交以尝试补全坐标
        </p>
      </el-card>
      <footer class="step-actions">
        <el-button @click="currentStep = 1">上一步</el-button>
        <el-button type="primary" :loading="completing" @click="confirmImport">
          完成导入
        </el-button>
      </footer>
    </section>

    <section v-else-if="currentStep === 3" class="step-panel finish-panel">
      <el-result icon="success" title="导入完成">
        <template #sub-title>
          <div v-if="importResult" class="finish-summary">
            <el-tag type="success">成功 {{ importResult.imported }}</el-tag>
            <el-tag type="warning">跳过 {{ importResult.skipped }}</el-tag>
            <el-tag type="danger">失败 {{ importResult.errors.length }}</el-tag>
            <el-tag type="primary">补全坐标 {{ importResult.geocoded }}</el-tag>
          </div>
        </template>
        <template #extra>
          <el-button type="primary" @click="backToList">返回列表</el-button>
          <el-button @click="currentStep = 0; onRemoveFile()">继续导入</el-button>
        </template>
      </el-result>
    </section>
  </div>
</template>

<style scoped>
.import-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.step-panel {
  background: #fff;
  padding: 24px;
  border-radius: 4px;
  min-height: 240px;
}
.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.upload-title {
  font-size: 14px;
  color: #303133;
}
.upload-sub {
  font-size: 12px;
  color: #909399;
}
.upload-status {
  margin-top: 16px;
}
.summary {
  margin-bottom: 16px;
}
.step-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.hint {
  margin-top: 12px;
  font-size: 13px;
  color: #909399;
}
.hint-error {
  color: #f56c6c;
}
.hint-ok {
  color: #67c23a;
}
.confirm-line {
  margin: 0 0 12px 0;
}
.finish-panel {
  text-align: center;
}
.finish-summary {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
  flex-wrap: wrap;
}
:deep(.el-table .row-error) {
  --el-table-tr-bg-color: #fef0f0;
}
</style>