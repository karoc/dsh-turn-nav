# dsh-turn-navigator

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 外部插件，为会话界面增加**钢琴键式轮次胶囊条**——在会话界面右侧悬浮一条竖向胶囊列，每轮一个小胶囊，让你一眼纵览整场会话有哪几轮，悬停预览，点击跳转到任意轮次起始点。

## 为什么需要

DSH Web UI 中，在长会话里找某一轮只能靠滚动——没有轮次概览，不知道有几轮、每轮说了什么、当前滚到哪里。`dsh-turn-navigator` 用类似 minimap 的胶囊条解决这个问题：

- 会话界面右侧**悬浮一条竖向胶囊列**（每轮一个灰色小胶囊，约 3px 高，钢琴键式）。
- **悬停**某个胶囊：该胶囊以**主题色**亮起并加宽 150%，相邻两个胶囊也稍微加宽（125%）——鼠标滑过时像波浪一样起伏；同时以 DSH 原生 Tooltip 完整展示该轮信息（序号、时间戳、用户消息摘要）。
- **点击**某个胶囊：会话滚动到该轮起点并短暂高亮。
- **历史自动加载**：会话历史是分页的，插件自动持续加载更早的页面，直到全部轮次可定位，无需手动点击"加载更早"。

## 安装

```sh
dsh plugin --profile web add dsh-turn-navigator
```

然后重启 `dsh web`：

```sh
dsh web
```

## 使用

1. 打开任意有至少一轮完成的会话。
2. 会话界面右侧出现一条竖向灰色胶囊列（每轮一个胶囊）。胶囊条**限高（60vh）且内部可滚动**，轮次再多也不会超出浏览器范围。
3. 悬停某个胶囊：以 DSH Tooltip 查看该轮的序号、时间戳、用户消息摘要（胶囊**以主题色亮起并加宽 150%**，相邻两个胶囊也稍微加宽——滑过时形成波浪波纹）。
4. 点击某个胶囊：会话滚动到该轮起点，目标行短暂高亮。
5. 更早的历史会自动加载——胶囊条先填充自身可视高度，**滚动胶囊条到顶部继续加载更早轮次**。无需手动点击"加载更早"。

## 原理

插件只注册**一个加法 slot**——**不修改 DSH 源码**：

| Slot | 作用域 | 职责 |
|------|--------|------|
| `conversation.session.header.utilities` | session | 悬浮轮次胶囊条；直接通过 `useSession` 读取 |

因为胶囊条是 session 作用域，它直接从框架 `useSession` kit 读取实时 `ConversationSnapshot`，并以 `position: fixed` 渲染（不占据 header 的 flex 行）。

- **轮次提取**：`chat.timeline.turnOrder` + `turns` map 得到轮次边界；`chat.locations.getTurn(turn)` 取该轮 node keys；首个 `kind === 'user'` 节点的首个 text block 作摘要；`turnTimings` 取时间戳。无用户消息的轮次降级显示其首个节点的 kind。
- **跳转定位**：取该轮第一个 chat-node key，通过 `data-chat-anchor-key="<key>"` 找到 DOM 行，在 `[data-conversation-scroll]` 滚动容器中精确计算并设置 `scrollTop`（比 `scrollIntoView` 更可控）。若目标行尚未渲染（更早页面未加载），自动点击"加载更早"按钮并重试直到行出现——无需先滚动一下。
- **自动加载（不卡顿）**：会话历史是分页的，每页 prepend 都会重渲染整个会话流，一次性全加载会卡住界面。胶囊条改为：(a) 打开后以缓慢节奏（背压 + 页数上限）先填充自身可视高度；(b) 之后**滚动胶囊条到顶部时继续加载更早轮次**（滚动驱动，与会话自身加载方式一致）。点击胶囊跳转时也会按需加载到目标轮。自动加载与滚动加载通过共享 busy 锁互斥，绝不并发点击分页按钮。

## 兼容性

- DeepSeek Harness (dsh) Web 客户端（`dsh web`）。
- 需要 `conversation.session.header.utilities` slot 声明（当前 DSH 已包含）。

## 许可证

MIT
