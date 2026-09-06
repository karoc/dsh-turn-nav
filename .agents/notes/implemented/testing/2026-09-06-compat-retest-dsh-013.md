# Agent Note: compat-retest-dsh-013

Status: implemented

## Problem

看板待办：dsh 0.1.3-alpha.1 已发布，官方内置 TurnNavigator 通过宿主 turnOutline 投影恢复了全会话范围与窗口外跳转（README 对比表是按源码"reviewed"写的）；需要在该版本上实测插件兼容性，并确认差异化结论是否仍成立（尤其官方是否真的全量、我们的全量历史是否仍独占）。

## Decision

dsh 0.1.3-alpha.1 兼容复测通过并固化：新增 scripts/verify-013-compat.mjs（cookie 认证——0.1.3 不再支持 ?token= mint 流；DOM click 打开会话——Playwright actionability click 会被 overlay mask 拦截）。实测结论：fixture（浏览器合成会话）下官方 rail 因宿主 turnOutline 投影未驱动退化为窗口内 24/75，我们的 rail 仍全量 75/75；真实 42-turn 会话两个 rail 都全量 42/42（官方走宿主投影、我们走 journal）；减法接管（官方 display:none）、跳转、跟随高亮、模式开关全部通过。README en/zh 兼容性声明从"reviewed"升级为"verified against 0.1.3-alpha.1"，对比表新增"全量历史健壮性"行：官方依赖宿主 turnOutline 投影（合成会话不驱动→退化），我们不依赖（始终全量）。技术标识符、插件代码零改动——0.1.3 上无需任何兼容性补丁。
## Alternatives considered

**只在 .verify/ 留临时探针、不固化脚本**：否决——复测结论必须可重复验证（0.1.3 官方 rail 结构/投影行为可能再变），故把探针整理为 scripts/verify-013-compat.mjs 正式验收脚本并提交。**修改 verify-labels-follow.mjs 的 localStorage 直选会话方式**：否决——0.1.3 改了会话打开机制（改走 sessions.open 服务），但旧脚本仍可用于旧版 dsh，且修它不在本卡范围内，只记录失效事实。**不动 README**：否决——0.1.3 兼容性从"reviewed"升级为"verified"是本次复测的直接产出，且对比表新增"全量历史健壮性"一行是实测发现（官方依赖宿主投影、我们不依赖），应落文档。
## Consequences

代价：README 双语新增一段实测记录 + 对比表多一行，版本对照表未更新（本提交不发版，v0.4.3 仍指向 HEAD 之前的 commit——下次发版需 bump 并重打 tag）；verify-013-compat.mjs 依赖 fixture 会话存在 75 轮（fx-alpha），fixture 数据变动会需调 MIN_TURNS。收益：0.1.3 兼容性有了可重复的 Playwright 门禁（verify-013-compat.mjs），差异化结论有了实测证据（真实会话 42/42 双 rail 一致 + fixture 下官方退化我们全量），后续 dsh 升级可一键复测。

