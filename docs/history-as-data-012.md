# dsh 0.1.2+ 全量历史（history-as-data）可行性调研与实施方案

> 生成日期：2026-08-29。基于 dsh 0.1.2-alpha.1 源码（`dsh-v0.1.2-alpha.1` = cd5ef81，与用户实例一致）。
> 结论：**浏览器侧可行，零宿主改动、零 dsh 源码改动、零新增依赖**。旧 `sessions.history` RPC 的等价能力由 Typert Remote 的 `session/page` 端点承接，且挂载在我们插件已经依赖的 `@deepseek-ai/dsh-api-remotes/client` 装配里。
> 本文件仅为调研结论与方案，未做任何代码改动。

## 一、背景：0.1.2+ 把历史读取通道搬到了哪里

0.1.2+（ui-chat 重构）移除了浏览器侧的 `connection.api` 门面（`packages/client/connection/src/client/index.ts` 的 `ConnectionHandle` 只剩 `isLoopback / generation / rpc / registerGenerationSource / start`，无 `api` 字段）。但旧 `api.sessions.history` 的宿主能力没有删除，而是重构为 **Typert Remote 命名空间 `session`**：

| 端点（wire） | 方法 | 作用 |
|---|---|---|
| `session/page` | `page(request, signal)` | 冷读一页消息对齐的历史（对应旧 `sessions.history`） |
| `session/follow` | `follow(request, signal)` | 打开窗口快照 + 增量事件流（官方 UI 的窗口来源） |
| `session/control` | `control(signal)` | 宿主级队列/作业/投影控制流 |

宿主实现：`packages/api/session-controller/src/history.ts`（`SessionHistoryController.page`）。浏览器装配：`packages/api/remotes/src/client/index.ts` 在启动时把 `sessionRemote`（`@deepseek-ai/dsh-api-session-controller/remote` 生成物）mount 进 `ctx.remote`。

**关键事实**：`@deepseek-ai/dsh-api-remotes/client` 正是 dsh-turn-nav **已经在 `dsh.client.inject` 里、已经在 import** 的包（`ConnectionHandle` 类型）。其 `declare module '@deepseek-ai/cordis'` 已声明 `ctx.remote: ClientRemote`，并 re-export 了 `SessionPageRequest`/`SessionPage` 等全部载荷类型。因此插件代码可以直接 `ctx.remote.session.page(...)`，**不需要新增任何依赖、不需要宿主侧任何东西**。

## 二、wire 契约（分页循环设计依据）

请求（`SessionPageRequest`）：

```ts
{
  address: { kind: 'session', sessionId },   // 普通会话；subagent 需要子会话专用地址
  throughSeq: number,                        // 日志内真实 seq（含），≥ -1；必须 ≤ 宿主游标且命中日志
  beforeSeq?: number,                        // 独占上界（可选），≥ 0 的整数
  maxMessages?: number,                      // 按"消息"计数（user/assistant message），默认 50，无上限
}
```

响应（`SessionPage`）：

```ts
{ records: SessionHistoryRecord[], hasMore: boolean }   // hasMore = 更老的消息仍存在
```

- `records` 是原始事件（`SessionWireEvent {type, seq, time, data}`）或打包的 assistant chunk run（`type: 'chunks'`）。
- `paginate`（history.ts:291）按 `MESSAGE_TYPES = {user/message, assistant/message}` 且 append-surface 的事件计数；`hasMore = cut > 0`，`cut` 是消息事件 seq（含其 `sourceEventSeqs` 组起点）。
- **翻页循环**：第一页 `throughSeq = 当前事件窗最后一条的 seq`（取 `sessions.binding(id).eventSource.getSnapshot().entries` 尾部），`beforeSeq` 不传；之后每页 `beforeSeq = 上一页 records 最小 seq - 1`，直到 `hasMore === false`。
- `maxMessages` 无上限（validatePageRequest 仅要求正整数），建议 100–200/页，减少往返次数。

## 三、轮次重建成本（低）

rail 只需要三个事实，全部可以从原始事件流式得到：

1. **轮次定界**：`turn/start {turn}` 事件（绝对轮次号，与 `navigation.items()[i].turn` 同轴）。
2. **prompt 预览**：`user/message` 事件（`UserMessage.content` 文本块），复用官方同款 ≤160 字符截断。
3. **计数**：`turn/start` 个数（或最大轮次号）。

其余事件类型（assistant/chunk、tool/*、step/*、request/header 等）全部忽略。事件词汇表耦合面 = 两个稳定事件名，后续 dsh 演进风险极小；且全部调用走既有 `/api` 鉴权通道，无新增权限面。

**已知边界**：compaction/派生会话的 seed 部分可能没有 `turn/start` 事件（seed 长度由 header 描述），导致重建的轮次号与官方窗口的绝对轮次号存在偏移。解法：以已加载窗口的 `navigation.items()` 做一次对齐（第一个重叠轮次校准 offset），偏移量缓存复用。

## 四、跳转仍走官方窗口（loadOlder）

窗口外轮次的跳转必须先把该段历史并入官方事件窗（DOM 才有锚点）。公开面齐全：

- `ctx.sessions.binding(sessionId).session.loadOlder()` —— `ISession` 公开方法（`contract/session.ts:120`），失败会落到 `snapshot.openState/loadingOlder`。
- **终止信号（权威）**：`binding.eventSource.getSnapshot().hasMore` —— `SessionEventWindow.hasMore`（`contract/events.ts:84`，公开）。
- 目标就位后，取官方 `navigation.items()` 里该轮的 `anchorKey` 滚动（与现有跳转逻辑一致，保留"正在定位第 N 轮…"反馈气泡）。
- 性能边界：每页 prepend 会触发整窗重装配（O(窗口大小)），跨很大距离的跳转是 O(n²)；这是用户主动触发且有反馈，可接受；大距离跳转可加"先加载到最近已加载轮次"的降级提示（可选）。

## 五、方案对比（给用户决策）

### 方案 A（推荐）：双通道混合 —— 全量数据自取 + 官方窗口跳转

- **数据通道**：插件自己用 `ctx.remote.session.page` 向后翻页到 `hasMore=false`，重建轮次索引，缓存于模块级 `Map<sessionId, Turns>`；打开会话**零 DOM 影响、零卡顿**（与 0.1.x 的 history-as-data 同效果，但纯浏览器实现）。
- **跳转通道**：窗口内直接滚；窗口外 `loadOlder()` 循环（`hasMore` 终止）+ 官方 anchorKey。
- **跟随高亮**：窗口内保持现状（`turnOfNodeKey`）；窗口外不强行高亮（无 DOM，合理降级）。
- 增量：会话新轮次到达时，比对 `navigation.items()` 尾部补一页（或监听窗口 revision）。
- 改动量估计：新增 `src/client/history-journal.ts`（分页 + 重建 + 缓存，~150 行），`TurnNavRail.tsx` 数据源/跳转流程改造（~80 行），版本 0.3.0。
- 风险：低。全部 API 公开、类型完备、版本探测兜底（`ctx.remote?.session?.page` 缺失 → 自动退回当前"仅窗口"行为）。

### 方案 B：纯官方 loadOlder 循环

打开（或首次需要）时循环 `loadOlder()` 直到 `hasMore=false`，rail 数据直接用 `navigation.items()`。
- 优点：零事件重建，官方 rail 也同步变全量，锚点天然一致。
- 缺点：每页 prepend 触发整窗重装配，150 轮大会话全量加载会卡（0.1.1 的历史教训，正是当初做 history-as-data 的原因）；且官方 rail 同步变全量后，我们与官方的数据差异消失，只剩 UI 差异。

### 方案 C（作废）：宿主侧自建路由/插件半区

调研结论：`session/page` 已经等价于旧 `sessions.history`，且浏览器可达；自建宿主路由需要额外处理鉴权、生命周期、双端版本同步，**无任何增量价值**。放弃。

## 六、落地顺序（若批准方案 A）

1. `history-journal.ts`：`fetchAllTurns(remote, sessionId, onPage)` —— 翻页循环 + `turn/start`/`user/message` 重建 + 模块级缓存 + offset 对齐。
2. `TurnNavRail.tsx`：数据源改为"缓存全量索引 ⊕ 窗口 navigation 实时修正"；跳转改为"窗口内直跳 / 窗口外 loadOlder 循环"；空/失败/版本不支持时逐级降级。
3. 验证：150 轮 fixture 会话（现有 verify-history 脚本思路）——打开零卡顿、全量胶囊即时可见、远距跳转成功且页面不冻结。
4. 发版 0.3.0（版本号、release gates、npm 发布由用户执行）。
