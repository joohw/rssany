// Hono ContextVariableMap 扩展：声明自定义 context 变量，供 c.get/c.set 类型推断使用

export {};

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}
