// Supabase 客户端单例：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "请在 .env 中设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
