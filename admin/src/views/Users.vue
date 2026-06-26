<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { http } from '../utils/request';

type Role = 'ADMIN' | 'MANAGER';
type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

interface User {
  id: number;
  username: string;
  name: string;
  phone: string | null;
  role: Role;
  status: string;
  createdAt: string;
}

interface UserForm {
  id: number | null;
  username: string;
  name: string;
  phone: string;
  password: string;
  role: Role;
  status: string;
}

interface ListResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

const users = ref<User[]>([]);
const total = ref<number>(0);
const loading = ref<boolean>(false);
const roleFilter = ref<'' | Role>('');
const page = ref<number>(1);
const pageSize = ref<number>(20);

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref<boolean>(false);
const userFormRef = ref<FormInstance | null>(null);

const userForm = reactive<UserForm>({
  id: null,
  username: '',
  name: '',
  phone: '',
  password: '',
  role: 'MANAGER',
  status: 'active',
});

const formRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 32, message: '长度 3-32', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' },
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
};

const passwordDialogVisible = ref<boolean>(false);
const passwordSubmitting = ref<boolean>(false);
const passwordFormRef = ref<FormInstance | null>(null);
const passwordTarget = ref<User | null>(null);
const passwordValue = reactive<{ password: string }>({ password: '' });

const passwordRules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '至少 6 位', trigger: 'blur' },
  ],
};

async function fetchUsers(): Promise<void> {
  loading.value = true;
  try {
    const res = await http.get<ListResponse>('/users', {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        ...(roleFilter.value ? { role: roleFilter.value } : {}),
      },
    });
    users.value = res.data.data;
    total.value = res.data.total;
  } catch {
    ElMessage.error('用户列表加载失败');
  } finally {
    loading.value = false;
  }
}

function roleColor(role: Role): string {
  return role === 'ADMIN' ? '#f56c6c' : '#409eff';
}

function statusType(status: string): TagType {
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
  userForm.id = null;
  userForm.username = '';
  userForm.name = '';
  userForm.phone = '';
  userForm.password = '';
  userForm.role = 'MANAGER';
  userForm.status = 'active';
}

function openCreate(): void {
  dialogMode.value = 'create';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(user: User): void {
  dialogMode.value = 'edit';
  userForm.id = user.id;
  userForm.username = user.username;
  userForm.name = user.name;
  userForm.phone = user.phone ?? '';
  userForm.password = '';
  userForm.role = user.role;
  userForm.status = user.status;
  dialogVisible.value = true;
}

async function submitForm(): Promise<void> {
  if (!userFormRef.value) return;
  try {
    await userFormRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    if (dialogMode.value === 'create') {
      await http.post<User>('/users', {
        username: userForm.username,
        name: userForm.name,
        phone: userForm.phone || null,
        password: userForm.password,
        role: userForm.role,
      });
      ElMessage.success('用户已创建');
    } else {
      const id = userForm.id;
      if (id === null) return;
      await http.patch<User>(`/users/${id}`, {
        name: userForm.name,
        phone: userForm.phone || null,
        role: userForm.role,
        status: userForm.status,
      });
      ElMessage.success('用户已更新');
    }
    dialogVisible.value = false;
    await fetchUsers();
  } catch {
    ElMessage.error('保存失败');
  } finally {
    submitting.value = false;
  }
}

async function removeUser(user: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定停用用户「${user.username}」吗？`,
      '确认停用',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await http.delete(`/users/${user.id}`);
    ElMessage.success('已停用');
    await fetchUsers();
  } catch {
    ElMessage.error('操作失败');
  }
}

function openPasswordDialog(user: User): void {
  passwordTarget.value = user;
  passwordValue.password = '';
  passwordDialogVisible.value = true;
}

async function submitPassword(): Promise<void> {
  if (!passwordFormRef.value) return;
  try {
    await passwordFormRef.value.validate();
  } catch {
    return;
  }
  if (!passwordTarget.value) return;
  passwordSubmitting.value = true;
  try {
    await http.patch(`/users/${passwordTarget.value.id}/password`, {
      password: passwordValue.password,
    });
    ElMessage.success('密码已重置');
    passwordDialogVisible.value = false;
  } catch {
    ElMessage.error('重置失败');
  } finally {
    passwordSubmitting.value = false;
  }
}

function onRoleFilterChange(): void {
  page.value = 1;
  void fetchUsers();
}

onMounted(fetchUsers);
</script>

<template>
  <div class="users-page">
    <header class="page-header">
      <h2>用户管理</h2>
      <div class="header-actions">
        <el-select
          v-model="roleFilter"
          placeholder="角色筛选"
          clearable
          style="width: 140px"
          @change="onRoleFilterChange"
        >
          <el-option label="管理员" value="ADMIN" />
          <el-option label="客户经理" value="MANAGER" />
        </el-select>
        <el-button type="success" @click="openCreate">新增用户</el-button>
      </div>
    </header>

    <el-table v-loading="loading" :data="users" border stripe>
      <el-table-column prop="username" label="用户名" width="140" />
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="phone" label="手机" width="140" />
      <el-table-column label="角色" width="120">
        <template #default="{ row }: { row: User }">
          <el-tag
            :color="roleColor(row.role)"
            effect="dark"
            disable-transitions
            :style="{ borderColor: roleColor(row.role) }"
          >
            {{ row.role === 'ADMIN' ? '管理员' : '客户经理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: User }">
          <el-tag :type="statusType(row.status)" disable-transitions>
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180" />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }: { row: User }">
          <el-button size="small" link type="primary" @click="openEdit(row)">
            编辑
          </el-button>
          <el-button
            size="small"
            link
            type="warning"
            @click="openPasswordDialog(row)"
          >
            重置密码
          </el-button>
          <el-button
            v-if="row.status === 'active'"
            size="small"
            link
            type="danger"
            @click="removeUser(row)"
          >
            停用
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
        @size-change="fetchUsers"
        @current-change="fetchUsers"
      />
    </footer>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增用户' : '编辑用户'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="userFormRef"
        :model="userForm"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="userForm.username"
            :disabled="dialogMode === 'edit'"
            placeholder="登录用户名"
          />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="userForm.name" />
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="userForm.phone" placeholder="可选" />
        </el-form-item>
        <el-form-item
          v-if="dialogMode === 'create'"
          label="密码"
          prop="password"
        >
          <el-input
            v-model="userForm.password"
            type="password"
            show-password
            placeholder="至少 6 位"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" style="width: 100%">
            <el-option label="管理员" value="ADMIN" />
            <el-option label="客户经理" value="MANAGER" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="状态">
          <el-select v-model="userForm.status" style="width: 100%">
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

    <el-dialog
      v-model="passwordDialogVisible"
      title="重置密码"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordValue"
        :rules="passwordRules"
        label-width="100px"
      >
        <el-form-item label="用户">
          <span>{{ passwordTarget?.username ?? '' }}</span>
        </el-form-item>
        <el-form-item label="新密码" prop="password">
          <el-input
            v-model="passwordValue.password"
            type="password"
            show-password
            placeholder="至少 6 位"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="passwordSubmitting"
          @click="submitPassword"
        >
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-page {
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
