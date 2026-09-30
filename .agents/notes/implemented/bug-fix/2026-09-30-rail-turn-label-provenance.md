# Agent Note: rail-turn-label-provenance

Status: implemented

## Problem

胶囊 hover 提示有时显示 `(no user message)`。该字符串只在 dsh-turn-navigator 里存在（官方 dsh 全仓没有），触发条件是"该轮没有人类提示词"：宿主的 `turn/start` 契约本身允许一轮无 step 关闭（拒绝/空输入/取消/失败），而每一次机器唤醒（goal 续跑、plugin 唤醒、后台子代理回报、runtime-context 注入、compaction 检查点）都会开出一个没有人类提示词的轮次。本机 303 份会话日志、2168 轮里实测 108 轮（5%）无人类消息，27 份会话的这类轮次落在已加载窗口内。旧实现有两条同时错的路径：数据层（`turns.ts` 的窗口路径与 `history.ts` 的 journal 折叠）在无提示词时伪造英文占位符，使本地化文案 `noSummary` 成为死代码（中文界面显示英文）；journal 折叠又不看 `user/message` 的 `source.kind`，于是把注入正文（`<goal_round> Objective: …`、runtime context、子代理通知）当成"用户消息摘要"显示（实测某会话 24 个胶囊里 12 个）。

## Decision

标签来源固定为四级回退，且**只有人类提示词可以成为正文**：`src/client/history.ts` 的折叠只接受 `source.kind === 'user'` 且 surfaceOp 为 append（缺字段的老日志视为 append）的消息，其余情况保留**空标签**（`buildTurns` 已导出供测试）；`src/client/turns.ts` 的窗口路径只用宿主 `prompt` 投影（官方已按人类节点判定），并在旧的 timeline 回退路径上删掉了 `peekNodeText`/`kindLabel` 自造标签。渲染层由 `src/client/label.ts` 的 `tooltipText` 决定正文：`fullText || summary || t('turnLabel', {n})`，即无提示词时显示本地化轮次号（zh `第 N 轮` / en `Turn N`）——与官方 `TurnNavigator.tsx` 的 `preview.prompt || t('chat.turnNavigation.turn', { turn })` 同语义；`noSummary` 词条已删除。第三个来源是宿主整日志投影 `useProjection('turnOutline')`（会话标准套件，已真机验证确实到达本插件：目标会话 24 个投影条目 = 24 轮），`src/client/merge.ts` 的 `mergeRailTurns` 按官方 `mergeTurnRailItems` 的口径合并：窗口/journal 任一通道有内容即用，都空才用 outline 的 prompt，全部为空才留空交给渲染层；轮次集合是三通道并集，因此 outline 能为两条读通道都够不到的轮次（窗口头切在轮中、steering 节点、compaction 检查点、journal 分页预算耗尽）保留胶囊。负向保证：数据层任何路径都不再产出可显示的自造文案；注入正文永不进入标签；空通道永不遮蔽有内容的通道。
## Alternatives considered

**只把英文占位符换成本地化字符串**：语义仍然错——官方在无提示词时显示的是轮次号而不是"无用户消息"，这会与官方胶囊条分叉，并继续遮蔽 outline 兜底。**只改渲染层、不接 turnOutline**：steering 节点、compaction 检查点、窗口头切中这几类轮次会永远只显示轮次号，而官方能显示真实提示词，等于没对齐也没修彻底。**自己重读全量日志补齐人类提示词**：宿主已把整日志折叠成投影推给客户端，重读会再引入一遍分页/窗口边界这类脆弱逻辑（本次缺陷正出在这里）。**给注入轮次自造一个 (goal continuation) 之类的新标签**：需要为每种注入来源枚举文案，且官方没有这个概念，属于二次分叉。
## Consequences

代价：胶囊列表的轮次集合现在包含投影独有的轮次，因此"胶囊数"可能大于"两条读通道读到的轮次并集"（对用户是补全，对实现是新的不变量：不能再用列表长度推断读通道的成功率）；journal 折叠丢弃非人类消息后，滚动跟随/jump 之外没有任何消费者受影响，但若将来想显示"这轮是谁唤醒的"必须新建字段而不是复用 summary。收益：提示词口径与官方一致（人类消息 → 宿主投影 → 轮次号），注入正文不再泄漏，中文界面不再出现英文占位符，且 journal 读失败时投影仍能给出全部轮次。义务：新增两条门禁——`scripts/test-turn-labels.mjs`（纯行为，Node 类型剥离直接 import `src/client/*.ts`，进 `npm test` 与 `verify:all`，钉为 docs/guarantees.md 的 G8–G11，并由 test-negative-controls 的两条变异证明可失败）与 `scripts/verify-turn-labels.mjs`（真机 Playwright：扫侧栏可达会话、断言无占位符/无注入正文/被服务 bundle 不含占位符字符串；需要本机 dsh web，故不进离线 verify:all）。已知覆盖缺口：本机日志里没有"首条消息为注入、其后才有人类消息"的轮次，所以 outline 独占救回的那一类只做了投影连通性验证，未做端到端样本验证；真机门禁同样依赖本机会话数据，候选会话被删除后其覆盖面会下降（脚本本身仍会跑完并如实报告扫了多少会话/胶囊）。相关：`.agents/notes/implemented/bug-fix/2026-09-03-rail-true-turn-labels.md`（轮次号来源，本次不动）。

