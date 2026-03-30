import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client

if (!url || !anonKey) {
  // 演示 / 纯本地模式：提供一个“空实现”，所有调用直接返回空结果，不会报错
  console.warn('[supabase] 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，将以纯本地模式运行')
  client = {
    auth: {
      async getSession() { return { data: { session: null }, error: null } },
      async signInWithOtp() { return { data: null, error: null } },
      async signOut() { return { error: null } },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
    },
    storage: {
      from() {
        return {
          async upload() { return { data: null, error: null } },
          async createSignedUrl() { return { data: { signedUrl: '' }, error: null } },
        }
      },
    },
    from() {
      return {
        select() { return Promise.resolve({ data: [], error: null }) },
        insert() { return Promise.resolve({ data: null, error: null }) },
        upsert() { return Promise.resolve({ data: null, error: null }) },
        delete() { return Promise.resolve({ data: null, error: null }) },
        eq() { return this },
        neq() { return this },
        gt() { return this },
        order() { return this },
        limit() { return this },
      }
    },
  }
} else {
  client = createClient(url, anonKey)
}

export const supabase = client

