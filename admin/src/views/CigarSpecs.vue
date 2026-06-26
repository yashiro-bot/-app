<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { ArrowDown, ArrowUp, Plus } from '@element-plus/icons-vue';
import { http } from '../utils/request';

interface CigarSpec {
  id: number;
  code: string;
  name: string;
  category: string;
  unitPerBox: number;
  status: string;
  sortOrder: number;
}

interface CigarSpecForm {
  id: number | null;
  code: string;
  name: string;
  category: string;
  unitPerBox: number;
  sortOrder: number;
  status: string;
}

const specs = ref<CigarSpec[]>([]);
const categories = ref<string[]>([]);
const loading = ref<boolean>(false);
const search = ref<string>('');
const statusFilter = ref<string>('ACTIVE');
const categoryFilter = ref<string>('');

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref<boolean>(false);
const formRef = ref<FormInstance | null>(null);

const form = reactive<CigarSpecForm>({
  id: null,
  code: '',
  name: '',
  category: '',
  unitPerBox: 25,
  sortOrder: 0,
  status: 'ACTIVE',
});

const formRules: FormRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  category: [{ required: true, message: '请输入分类', trigger: 'blur' }],
  unitPerBox: [
    { required: true, message: '请输入每盒支数', trigger: 'blur' },
    {
      validator: (_rule, value: number, callback) => {
        if (!Number.isInteger(value) || value < 1 || value > 10000) {
          callback(new Error('每盒支数必须为 1-10000 的整数'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

const filtered = computed<CigarSpec[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return specs.value;
  return specs.value.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
  );
});

async function fetchSpecs(): Promise<void> {
  loading.value = true;
  try {
    const params: { status?: string; category?: string } = {};
    if (statusFilter.value) params.status = statusFilter.value;
    if (categoryFilter.value) params.category = categoryFilter.value;
    const res = await http.get<CigarSpec[]>('/cigar-specs', { params });
    specs.value = res.data;
  } catch {
    ElMessage.error('规格列表加载失败');
  } finally {
    loading.value = false;
  }
}

async function fetchCategories(): Promise<void> {
  try {
    const res = await http.get<{ categories: string[] }>(
      '/cigar-specs/categories',
    );
    categories.value = res.data.categories;
  } catch {
    categories.value = [];
  }
}

function statusType(
  status: string,
): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DISABLED') return 'info';
  return 'warning';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE') return '启用';
  if (status === 'DISABLED') return '停用';
  return status;
}

function resetForm(): void {
  form.id = null;
  form.code = '';
  form.name = '';
  form.category = '';
  form.unitPerBox = 25;
  form.sortOrder = 0;
  form.status = 'ACTIVE';
}

function openCreate(): void {
  dialogMode.value = 'create';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(spec: CigarSpec): void {
  dialogMode.value = 'edit';
  form.id = spec.id;
  form.code = spec.code;
  form.name = spec.name;
  form.category = spec.category;
  form.unitPerBox = spec.unitPerBox;
  form.sortOrder = spec.sortOrder;
  form.status = spec.status;
  dialogVisible.value = true;
}

async function submitForm(): Promise<void> {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await http.post<CigarSpec>('/cigar-specs', {
        code: form.code,
        name: form.name,
        category: form.category,
        unitPerBox: form.unitPerBox,
        sortOrder: form.sortOrder,
      });
      ElMessage.success('规格已创建');
    } else {
      const id = form.id;
      if (id === null) return;
      await http.patch<CigarSpec>(`/cigar-specs/${id}`, {
        name: form.name,
        category: form.category,
        unitPerBox: form.unitPerBox,
        sortOrder: form.sortOrder,
        status: form.status,
      });
      ElMessage.success('规格已更新');
    }
    dialogVisible.value = false;
    await fetchSpecs();
    await fetchCategories();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(spec: CigarSpec): Promise<void> {
  const next = spec.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  try {
    await http.patch(`/cigar-specs/${spec.id}`, { status: next });
    ElMessage.success(next === 'ACTIVE' ? '已启用' : '已停用');
    await fetchSpecs();
  } catch {
    ElMessage.error('状态切换失败');
  }
}

async function removeSpec(spec: CigarSpec): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定停用规格「${spec.name}」吗？`,
      '确认停用',
      {
        type: 'warning',
        confirmButtonText: '停用',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  try {
    await http.delete(`/cigar-specs/${spec.id}`);
    ElMessage.success('已停用');
    await fetchSpecs();
  } catch (err: unknown) {
    const msg =
      err instanceof Error && err.message ? err.message : '停用失败';
    ElMessage.error(msg);
  }
}

async function moveSort(
  spec: CigarSpec,
  direction: 'up' | 'down',
): Promise<void> {
  const list = specs.value;
  const i = list.findIndex((s) => s.id === spec.id);
  if (i < 0) return;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  const target = list[j];
  if (target === undefined) return;
  const tmp = spec.sortOrder;
  try {
    await Promise.all([
      http.patch(`/cigar-specs/${spec.id}`, { sortOrder: target.sortOrder }),
      http.patch(`/cigar-specs/${target.id}`, { sortOrder: tmp }),
    ]);
    await fetchSpecs();
  } catch {
    ElMessage.error('排序更新失败');
  }
}

function onStatusFilterChange(): void {
  void fetchSpecs();
}

function onCategoryFilterChange(): void {
  void fetchSpecs();
}

onMounted(() => {
  void fetchSpecs();
  void fetchCategories();
});
</script>

<template>
  <div class="specs-page">
    <header class="page-header">
      <h2>烟标规格管理</h2>
      <div class="header-actions">
        <el-input
          v-model="search"
          placeholder="搜索编码/名称/分类"
          clearable
          style="width: 220px"
        />
        <el-select
          v-model="statusFilter"
          placeholder="状态"
          clearable
          style="width: 120px"
          @change="onStatusFilterChange"
        >
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
        <el-select
          v-model="categoryFilter"
          placeholder="分类"
          clearable
          style="width: 160px"
          @change="onCategoryFilterChange"
        >
          <el-option
            v-for="cat in categories"
            :key="cat"
            :label="cat"
            :value="cat"
          />
        </el-select>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新增规格
        </el-button>
      </div>
    </header>

    <el-table v-loading="loading" :data="filtered" border stripe>
      <el-table-column prop="code" label="编码" width="140" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="140" />
      <el-table-column
        prop="unitPerBox"
        label="每盒支数"
        width="110"
        align="right"
      />
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: CigarSpec }">
          <el-tag :type="statusType(row.status)" disable-transitions>
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="sortOrder"
        label="排序"
        width="90"
        align="right"
      />
      <el-table-column label="操作" width="320" fixed="right">
        <template
          #default="{ row, $index }: { row: CigarSpec; $index: number }"
        >
          <el-button
            size="small"
            link
            type="primary"
            :disabled="$index === 0"
            @click="moveSort(row, 'up')"
          >
            <el-icon><ArrowUp /></el-icon>
          </el-button>
          <el-button
            size="small"
            link
            type="primary"
            :disabled="$index === filtered.length - 1"
            @click="moveSort(row, 'down')"
          >
            <el-icon><ArrowDown /></el-icon>
          </el-button>
          <el-button size="small" link type="primary" @click="openEdit(row)">
            编辑
          </el-button>
          <el-button
            size="small"
            link
            :type="row.status === 'ACTIVE' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
          </el-button>
          <el-button size="small" link type="danger" @click="removeSpec(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增规格' : '编辑规格'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="编码" prop="code">
          <el-input
            v-model="form.code"
            :disabled="dialogMode === 'edit'"
            placeholder="例如 CIGAR-046"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-input
            v-model="form.category"
            placeholder="例如 国产雪茄 / 进口雪茄"
          />
        </el-form-item>
        <el-form-item label="每盒支数" prop="unitPerBox">
          <el-input-number
            v-model="form.unitPerBox"
            :min="1"
            :max="10000"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            :max="1000000"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.specs-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>