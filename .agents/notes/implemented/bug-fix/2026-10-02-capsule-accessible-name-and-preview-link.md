# Agent Note: capsule-accessible-name-and-preview-link

Status: implemented

## Problem

用户要求审计"当前实现是否符合 DSH 官方的要求与设计"。逐条对照官方源码后发现一处真实的设计不符（a11y）：官方 mark 的可访问**名称**是动作（`TurnNavigator.tsx` 的 `aria-label={t('chat.turnNavigation.jump' | 'jumpLoad', {turn})}`，zh 为"跳转到第 N 轮 / 加载并跳转到第 N 轮"），内容（prompt/response）通过 `aria-describedby` 指向 `role="tooltip"` 节点（`id={previewId}`），并带 `aria-current`/`aria-busy`，且**focus 时也出预览**。我们的实现把整条 tooltip 文本塞进 `aria-label`（`Turn N — time — prompt — response`），没有 `aria-describedby` 链接、没有 `aria-current`/`aria-busy`、预览只在 hover 出现——屏幕阅读器用户听到的是内容播报而非动作，键盘用户永远看不到预览。

## Decision

胶囊的可访问**名称**改为动作本身，内容改为**描述**：`locales.ts` 新增 `jumpToTurn` / `jumpToTurnLoad`（文案与官方 `chat.turnNavigation.jump` / `jumpLoad` 逐字对齐：en `Jump to turn {n}` / `Load and jump to turn {n}`，zh `跳转到第 {n} 轮` / `加载并跳转到第 {n} 轮`）；`merge.ts` 的 `RailSourceTurn` 新增 `loaded`（= 官方 `anchor.kind`：窗口内为 true，journal/outline-only 为 false），由 `label.ts` 的纯函数 `markLabel(entry, t)` 选键；`TurnNavRail.tsx` 用 `aria-label={markLabel(...)}`、`aria-current`（阅读线轮次）、`aria-busy`（跳转翻页中）、`aria-describedby={previewId}`（`useId()`）指向 tooltip 节点（加 `id`），并新增 `onFocus`/`onBlur` 让**键盘聚焦也出预览**（与官方一致，此前只有 hover）。行为测试钉住四态文案与"名称永不复述内容"，真机门禁改为逐胶囊 focus → 解析 `aria-describedby` → 读 `role="tooltip"` 节点，并断言名称匹配动作模式。
## Alternatives considered

**保留 `aria-label` = 整条 tooltip 文本**（现状）：屏幕阅读器用户听到的是内容播报，无法知道这个按钮是"跳转"，而且预览节点没有 id 无法被 `aria-describedby` 引用——这是与官方设计分叉，不是取舍。**name 里同时塞动作与内容**（如"跳转到第 46 轮 — 提示词…"）：name 会随内容变化而抖动，且官方明确把内容放在 description。**只在 hover 出预览、键盘用户按 Enter 直接跳**：官方在 focus 时也出预览，键盘用户需要先知道目标轮次的内容——照抄官方。**为 loaded/unloaded 只用一个动作文案**：官方用两个键（jump / jumpLoad）是因为未加载轮次要先翻页，用户需要预期到"会有加载"，单文案会丢失这个信息。
## Consequences

代价：多两个 locale 词条与一个 `loaded` 字段（`RailSourceTurn`/`TurnEntry`/`HistoryTurn` 全量带上；journal 恒为 false、窗口恒为 true）；真机门禁改为逐胶囊 focus + 解析 `aria-describedby`，单次扫描的 DOM 往返变多（32 会话 / 279 胶囊仍在可接受范围内）。收益：与官方 a11y 设计一致（动作名 + 描述链接 + `aria-current`/`aria-busy` + 键盘出预览），屏幕阅读器不再把预览当作按钮名，且"未加载轮次会先翻页"这一行为对辅助技术用户可见。义务：G13 负向保证、`markLabel` 的行为测试（中英 + loaded/unloaded 四态）、真机门禁改走键盘路径、负向对照新增"名称退回纯标签"变异、README 双语对比表与特性表同步。已知边界：`aria-describedby` 指向的节点只在有预览时存在（官方同样如此，悬空引用按规范被忽略）；`loaded` 只区分"在已加载窗口内/外"，不区分"点击后需要翻几页"。

