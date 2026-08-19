# dsh-turn-nav

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 外部插件，为会话界面增加**轮次定位抽屉**——让你一眼纵览整场会话有哪几轮，跳转到任意轮次起始点，并知道当前滚动位置在哪一轮。

## 为什么需要

DSH Web UI 中，在长会话里找某一轮只能靠滚动——没有轮次概览，不知道有几轮、每轮说了什么、当前滚到哪里。`dsh-turn-nav` 解决这个问题：

- 会话头部右侧的**触发胶囊**显示轮次总数。
- 点击打开**右侧抽屉**，列出每一轮的序号、用户消息摘要和时间戳。
- 点击某轮**滚动会话**到该轮起点并短暂高亮。
- **当前轮跟随**：滚动会话时，抽屉里对应的轮次项自动高亮。

## 安装

```sh
dsh plugin --profile web add dsh-turn-nav
```

然后重启 `dsh web`：

```sh
dsh web
```

## 使用

1. 打开任意有至少一轮完成的会话。
2. 会话头部右侧出现"轮次"胶囊，带轮次计数。
3. 点击打开抽屉。点击任意轮次跳转。滚动会话时抽屉高亮当前轮。
4. 再次点击胶囊或点击抽屉关闭按钮可收起抽屉。

## 原理

插件注册两个加法 slot——**不修改 DSH 源码**：

| Slot | 作用域 | 职责 |
|------|--------|------|
| `conversation.session.header.utilities` | session | 触发胶囊；通过 `useSession` 提取轮次 |
| `shell.overlay` | root | 右侧抽屉；通过模块级 relay 读取轮次 |

Session 作用域的触发器能拿到 `useSession`（实时 `ConversationSnapshot`），从 `chat.timeline.turnOrder` + `turnTimings` 提取轮次列表并发布到模块级 observable store。Root 作用域的抽屉通过 `useSyncExternalStore` 读取该 store 并渲染列表。

跳转定位：通过 `chat.locations.getTurn(turn)` 取该轮第一个 chat-node key，找到 DOM 中 `data-chat-anchor-key="<key>"` 的元素，调用 `scrollIntoView`。跟随高亮：监听滚动，找到视口顶部第一个可见的 `[data-chat-anchor-key]` 行，反查其所属轮次。

## 兼容性

- DeepSeek Harness (dsh) Web 客户端（`dsh web`）。
- 需要 `conversation.session.header.utilities` 和 `shell.overlay` slot 声明（当前 DSH 已包含）。

## 许可证

MIT
