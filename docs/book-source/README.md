# 通用书源（Book Source）

ReadAny **不再内置任何厂商特例**（例如已移除的 CodexNovel 对接）。  
在线书库能力通过 **可注册的书源适配器** 扩展，开发者可自由对接自己的 API 或规则引擎。

## 位置

- 契约与注册表：`packages/core/src/book-source/`
- 导出：`@readany/core/book-source`

## 最小用法

```ts
import {
  registerBookSource,
  listBookSources,
  type BookSourceAdapter,
} from "@readany/core/book-source";

const mySource: BookSourceAdapter = {
  id: "demo-api",
  name: "Demo API",
  description: "Example online library",
  capabilities: { search: true, browse: true, toc: true, chapter: true },
  async search({ q, page = 1, pageSize = 20 }) {
    // call your backend / rule engine
    return { items: [], page, pageSize, total: 0 };
  },
  async getToc(sourceBookId) {
    return [];
  },
  async getChapter(sourceBookId, chapterId) {
    return { id: chapterId, title: "", content: "" };
  },
};

registerBookSource(mySource);
console.log(listBookSources());
```

## 后续方向

1. **书源规则 DSL**（检索/目录/正文选择器或 JSON 规则）与导入导出  
2. **书架映射**：`format: "online"` + `filePath`/`sourceId` 通用约定（不绑定单一后端）  
3. **阅读器**：按 `sourceId` 解析章节流，替代已删除的厂商 OnlineReader  
4. **设置 UI**：书源列表、启用/禁用、规则编辑（面向开发者与高级用户）

历史 SQLite 表 `codexnovel_books` 仅保留迁移兼容，运行时不再读写。
