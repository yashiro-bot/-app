<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { http } from '../utils/request';

interface Customer {
  id: number;
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  contact: string | null;
  phone: string | null;
  status: string;
}

interface CustomerForm {
  id: number | null;
  code: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
  status: string;
}

interface ListResponse {
  data: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

const router = useRouter();

const customers = ref<Customer[]>([]);
const total = ref<number>(0);
const loading = ref<boolean>(false);
const search = ref<string>('');
const page = ref<number>(1);
const pageSize = ref<number>(20);

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref<boolean>(false);
const customerFormRef = ref<FormInstance | null>(null);

const customerForm = reactive<CustomerForm>({
  id: null,
  code: '',
  name: '',
  address: '',
  contact: '',
  phone: '',
  status: 'active',
});

const formRules: FormRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
};

const filtered = computed<Customer[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return customers.value;
  return customers.value.filter(
    (c) =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  );
});

async function fetchCustomers(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.get<ListResponse>('/customers', {
      params: { page: page.value, pageSize: pageSize.value },
    });
    customers.value = res.data.data;
    total.value = res.data.total;
  } catch {
    ElMessage.error('客户列表加载失败');
  } finally {
    loading.value = false;
  }
}

function formatCoord(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '-';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function statusType(
  status: string,
): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'active') return 'success';
  if (status === 'inactive') return 'info';
  return 'warning';
}

function statusLabel(status: string): string {
  if (status === 'active') return '启用';
  if (status === 'inactive') return '停用';
  return status;
}

function resetForm(): void {
  customerForm.id = null;
  customerForm.code = '';
  customerForm.name = '';
  customerForm.address = '';
  customerForm.contact = '';
  customerForm.phone = '';
  customerForm.status = 'active';
}

function openCreate(): void {
  dialogMode.value = 'create';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(customer: Customer): void {
  dialogMode.value = 'edit';
  customerForm.id = customer.id;
  customerForm.code = customer.code;
  customerForm.name = customer.name;
  customerForm.address = customer.address ?? '';
  customerForm.contact = customer.contact ?? '';
  customerForm.phone = customer.phone ?? '';
  customerForm.status = customer.status;
  dialogVisible.value = true;
}

async function submitForm(): Promise<void> {
  if (!customerFormRef.value) return;
  try {
    await customerFormRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await http.post<Customer>('/customers', {
        code: customerForm.code,
        name: customerForm.name,
        address: customerForm.address || null,
        contact: customerForm.contact || null,
        phone: customerForm.phone || null,
        status: customerForm.status,
      });
      ElMessage.success('客户已创建');
    } else {
      const id = customerForm.id;
      if (id === null) return;
      await http.patch<Customer>(`/customers/${id}`, {
        name: customerForm.name,
        address: customerForm.address || null,
        contact: customerForm.contact || null,
        phone: customerForm.phone || null,
        status: customerForm.status,
      });
      ElMessage.success('客户已更新');
    }
    dialogVisible.value = false;
    await fetchCustomers();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    submitting.value = false;
  }
}

async function removeCustomer(customer: Customer): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除客户「${customer.name}」吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await http.delete(`/customers/${customer.id}`);
    ElMessage.success('已删除');
    await fetchCustomers();
  } catch {
    ElMessage.error('删除失败');
  }
}

function goImport(): void {
  router.push('/customers/import');
}

onMounted(fetchCustomers);
</script>

<template>
  <div class="customers-page">
    <header class="page-header">
      <h2>客户管理</h2>
      <div class="header-actions">
        <el-input
          v-model="search"
          placeholder="搜索编码或名称"
          clearable
          style="width: 240px"
        />
        <el-button type="primary" @click="goImport">导入客户</el-button>
        <el-button type="success" @click="openCreate">新增客户</el-button>
      </div>
    </header>

    <el-table v-loading="loading" :data="filtered" border stripe>
      <el-table-column prop="code" label="编码" width="140" />
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column
        prop="address"
        label="地址"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column label="坐标" width="180">
        <template #default="{ row }: { row: Customer }">
          {{ formatCoord(row.lat, row.lng) }}
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="联系电话" width="140" />
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: Customer }">
          <el-tag :type="statusType(row.status)" disable-transitions>
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }: { row: Customer }">
          <el-button size="small" link type="primary" @click="openEdit(row)">
            编辑
          </el-button>
          <el-button
            size="small"
            link
            type="danger"
            @click="removeCustomer(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <footer class="page-footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchCustomers"
        @current-change="fetchCustomers"
      />
    </footer>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增客户' : '编辑客户'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="customerFormRef"
        :model="customerForm"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="编码" prop="code">
          <el-input
            v-model="customerForm.code"
            :disabled="dialogMode === 'edit'"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="customerForm.name" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input
            v-model="customerForm.address"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="customerForm.contact" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="customerForm.phone" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="customerForm.status" style="width: 100%">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
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
.customers-page {
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
.page-footer {
  display: flex;
  justify-content: flex-end;
}
</style>