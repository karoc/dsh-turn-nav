# Agent Note: tooltip-response-preview

Status: implemented

## Problem

桌面壳内一个 49 轮会话里，用户对比同一轮（turn 46）的两个胶囊条：官方 tooltip 能显示内容，我们的只显示"Turn 46"。日志实证：turn 46 **完全没有人类提示词**（唯一的 `user/message` 是 `tool-jobs` 后台作业回报），所以两边的 prompt 行都是空的——官方显示的那点"内容"其实是它的**回复预览行**（`turnOutline.response`，该轮 119 字）。0.4.7 修好了"不伪造标签"，但我们的 tooltip 从来没有 response 行，于是在这类机器唤醒轮次上看起来是空的。真机对照（web GUI，session-c852547f）：官方 `["Turn 46", "## linux-smoke 修复闭环…"]`，我们 `Turn 46 — 21:09 — Turn 46`。

## Decision

胶囊 tooltip 的内容行改为可选两行，全部取自宿主投影：提示词行（journal 完整首条人类消息 → 窗口有界 prompt → `turnOutline.prompt`）与**回复预览行**（窗口自身 `response` 优先 → `turnOutline.response` 兜底）。渲染规则在 `src/client/label.ts` 的 `tooltipText`：`[轮次标签, 时间?, 提示词?, 回复预览?]`——提示词为空时**省略该行**（首行已经是轮次号，不重复）；回复预览为空时省略该行。数据结构上 `RailSourceTurn`（merge.ts）、`TurnEntry`（turns.ts）、`LabelEntry`（label.ts）新增 `response` 字段，`HistoryTurn`（history.ts）恒为 `''`（journal 只读提示词），合并顺序与官方 `mergeTurnRailItems` 一致（窗口优先、outline 兜底）。插件**不**自行解析助手正文。真机门禁 `scripts/verify-turn-labels.mjs` 改为：任何行都不得是占位符；tooltip 必须以轮次标签开头；注入正文只在**无界行**（≥200 字）上判红——宿主 response 预览有 120 字上限，因此 bounded 的 payload 形文本视为正文内容而非泄漏标签。
## Alternatives considered

**插件自己从会话流/日志摘取助手正文**：host 已把 response 折叠进 `turnOutline`（120 字上限、`turn/end` 提交），自己解析等于重复实现并再次引入分页/窗口边界脆弱性（0.4.7 的教训）。**照抄官方两行结构**（prompt 为空时回退成轮次号）：我们的首行本来就是轮次号，会得到"Turn 46 / 21:09 / Turn 46 / 回复"这种重复行；改为 prompt 行在空时**省略**。**把 response 也塞进一个独立视觉层**：当前 tooltip 是纯文本多行，两行内容已达到官方信息量，不值得为它引入新的 DOM/样式。**真机门禁继续对任意行判 payload**：会把助手正文里引用的 `<goal_round>` 误判为泄漏（本轮自己的会话里就有这种正文），改为只对**无界**行（≥200 字）判红，并新增"tooltip 必须以轮次标签开头"的断言。
## Consequences

代价：tooltip 变长（最多 4 行），aria-label 也变长；`RailSourceTurn`/`TurnEntry`/`LabelEntry`/`HistoryTurn` 四个结构都新增必填 `response` 字段（journal 通道恒为 `''`，因为持久化日志只用于读提示词）；真机门禁的 payload 判据从"任意行"收窄为"无界行"，是一个**有意的覆盖收窄**（bounded 预览可能引用 payload 文本作内容），由"必须以轮次标签开头"+占位符禁止两条断言补位。收益：与官方信息量对齐（机器唤醒轮次不再只剩轮次号），且 response 仍只来自宿主投影。义务：G12 负向保证、行为测试 5 条新断言、真机门禁改判据、负向对照新增"删掉 response 行"变异（另有一条旧变异因 0.4.8 重写而失锚，已按新代码形状重建并复核）；`docs/guarantees.md`、README 双语、CHANGELOG 0.4.8 同批更新。已知边界：outline 的 response 对**仍运行的轮次**为空（宿主在 `turn/end` 才提交 draft），此时由窗口自身的 response 补——两者都空就只显示提示词/轮次号，这是与官方一致的行为，不是缺陷。

