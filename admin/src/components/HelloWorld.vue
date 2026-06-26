<script setup lang="ts">
import axios from 'axios'

// T1: minimal axios instance. Real baseURL + interceptors land in T7.
const api = axios.create({ baseURL: '/' })
console.log('axios ready', typeof api)
</script>

<template>
  <div class="hello">
    <h1>cigar-collection admin — T1 scaffold</h1>
    <p>Stack: Vue 3 · Vite · Element Plus · Pinia · Vue Router 4 · ECharts</p>
  </div>
</template>

<style scoped>
.hello {
  font-family: system-ui, sans-serif;
  padding: 16px;
}
</style>
