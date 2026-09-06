# Agent Note: brand-naming-standardization-043

Status: implemented

## Problem

插件此前品牌名为 "DSH Smoothly Turn Nav (DSH STN)"，用户给出新的统一品牌体系（品牌英文 Smoothly、品牌中文 思磨力、英文名 Smoothly Turn Nav 简称 Smoothly TN、中文名 思磨力轮次胶囊条），要求整体规范化；同时必须避免破坏已安装 profile 与持久化偏好。

## Decision

0.4.3 起所有用户可见品牌命名统一为：英文 Smoothly Turn Nav（简称 Smoothly TN）、中文 思磨力轮次胶囊条、品牌 Smoothly / 思磨力。已落盘的文件：README.md / README.zh.md（标题、品牌行、特性表、对比表、版本对照表、使用、兼容性）、package.json description 与 keywords（新增 smoothly / 思磨力 / smoothly-tn，删除 stn）、src/client/locales.ts（modeSTN 英 "Smoothly TN"、中 "思磨力轮次胶囊条"；modeRowDesc 同步）、src/client 四文件注释、scripts/verify-mode.mjs 断言（改查 "Smoothly TN" 或 "思磨力轮次胶囊条"）、CHANGELOG 新增 [0.4.3] 条目。技术标识符层刻意解耦不动：npm 包名 dsh-turn-navigator、插件/slot ID、locale 命名空间、CSS 前缀 tn-*、localStorage key dsh-turn-navigator.mode、内部 mode id 'stn' 全部保持原样——已装 profile 的 bundle URL、持久化模式选择、verify 脚本的 KEY 常量不受影响。历史文档（docs/official-vs-ours.md、CHANGELOG 0.4.2/0.4.0 条目）保留原始命名不改写。发布准备已完成：commit 0373804、tag v0.4.3、release:check 通过（README 双语章节数一致、CHANGELOG 最新条目、tag 指 HEAD、工作树干净、lib 新鲜、0.4.3 未发布）；npm publish 留给用户人工 2FA。
## Alternatives considered

**改 npm 包名**（如 smoothly-turn-nav）：被用户否决——已发布 0.4.2，改名需重新发布新包、迁移已装 profile，收益仅是包名更贴品牌。**改插件运行时 ID / slot ID / locale NS / CSS 前缀 / localStorage key**：破坏性最大，已装 profile 必须重装且 localStorage 偏好丢失，用户确认不选。**连历史文档一起改写**：否决——docs/official-vs-ours.md 与 CHANGELOG 历史条目是 2026-08 当时的真实记录，改写会篡改历史，改为只在新条目记录本次改名。
## Consequences

代价：品牌名与 npm 包名长期不一致（用户可见 "Smoothly Turn Nav / 思磨力轮次胶囊条"，安装命令仍是 `dsh plugin add dsh-turn-navigator`），README 安装章节需继续写明这一点；verify-mode 断言依赖精确文案（"Smoothly TN" / "思磨力轮次胶囊条"），未来再改名需同步。收益：用户可见命名全面统一到新品牌体系，零破坏升级；0.4.3 处于"一条命令可发布"状态（用户 npm login + publish 即完成）。遗留：board 上 dsh 0.1.3 兼容复测卡仍在 todo（其 rationale/rejected 原文曾在本次 board 误操作中被覆盖，已按仓库背景重建并在卡内注明）。

