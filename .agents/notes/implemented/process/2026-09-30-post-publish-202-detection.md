# Agent Note: post-publish-202-detection

Status: implemented

## Problem

0.4.7 发布时 npm 打印 `+ dsh-turn-navigator@0.4.7` 并 exit 0，但当时（发布后 ~20 分钟）注册表上什么都查不到：版本文档与 tarball 双双 404、packument 仍停在 0.4.6。npm 自己的 debug 日志显示 `PUT … 401`（触发网页 2FA）之后 `PUT … 202 Accepted`，而 `npm-registry-fetch` 只对 >= 400 抛错，202 因此被当成成功；注册表那句 "Your package is being processed and may take a few minutes to become available" 实际可能意味着数小时。**后续复核推翻了当时的结论**：该版本稍后自行可见（`latest` 已更新、tarball 可取、发布物校验和与本仓库一致），不需要重发。仓库里的 `post-publish-check.mjs` 原先在这种状态下输出 "the package document is live … **the upload landed**, the index is still catching up" —— 一句会让人安心等待、却被事件证明当时无据的结论；而修复的第一版又反向断言"该版本不在注册表上、请重发"，同样是把"此刻不可见"当成"已丢弃"。真正的缺陷是：把"注册表是否在服务该版本"当成"发布是否落地"的判据，并给出单向结论。

## Decision

`scripts/post-publish-check.mjs` 在"版本文档 404 而包文档可读"时不再断言"上传已落地"，改用**确定性 tarball URL**（`{registry}/{escapedName}/-/{basename}-{version}.tgz`；作用域包取 basename，非作用域包用整名——首版在此处写错成 `slice(2)`，被夹具当场抓出）做存在性探测（HEAD，405/501 退回 ranged GET，配置了 npm 代理时退回 curl），三态 `present`/`absent`/`unknown`：`present` 报告"tarball 已在服务，上传确实落地，索引在追"；`absent` 报告**歧义**——"注册表尚未服务该版本（版本文档与 tarball 双 404），npm 因 202 Accepted 而报成功；这可能是长达数小时的发布流水线延迟（本仓库实测：20 分钟仍 404、稍后自行可见且 `latest` 已更新），也可能是真的被丢弃；请稍后重跑本脚本，**不要在仅仅'未服务'时就重发**，若很久之后仍缺失再 `npm publish`（重复发布会以 EPUBLISHCONFLICT 安全失败）"；`unknown` 保持保守措辞。三种情形都仍然 exit 0（postpublish 撤不回上传，假失败正是 0.1.0 的教训）。脚本头部分级规则同步写明该判据与"202 是 <400 所以 npm 报成功"的机制；`scripts/test-post-publish.mjs` 新增 'accepted-but-not-visible-yet' 夹具并把原 'index lag' 夹具改成"tarball 已在服务"，该夹具脚本首次接入 `npm test`/`verify:all`；`CONTRIBUTING.md` 用三态表格给出处置与恢复配方；负向对照新增变异（把 absent 判成 present）证明判据可失败。
## Alternatives considered

**按技能原文（"包文档存在 = 上传已落地、勿重发 → exit 0"）保留原样**：0.4.7 事件证明这条判据在 202 场景下会给出"已落地"的错误安心感（当时 tarball 也 404）；**把"tarball 404"直接判为"发布丢弃、请重发"**（我第一版就是这么写的）：实测该版本在两小时内自行可见，重发会撞 EPUBLISHCONFLICT——这与"误导用户重发"是同一类错误，只是方向相反；**无限轮询直到可见**：postpublish 是发布命令的一部分，把人工等待拖到小时级不可接受；**解析 npm debug 日志里的 `PUT … 202`**：日志路径/格式随版本与平台变化，跨进程不可靠。
## Consequences

代价：多一次 HEAD（仅在"版本文档 404 且包文档可读"时发生），探测被代理/网络挡住时结论退化为"不确定"（沿用保守措辞，不误报）；措辞变长，需要在警告里同时承载"可能延迟也可能丢弃"的歧义，不能给出一句话的结论。收益：三种状态各有明确处置（已在服务=真延迟，什么都不用做；未服务=歧义，等而不是重发；版本与包文档双 404=上传未确认，查日志后重发），并且不再出现任一种方向上的假结论；5 分钟轮询预算保持不变（postpublish 不能阻塞小时级），把"晚点再看"交给可重复运行的脚本。义务：技能 `dsh-plugin-development` §6 的"超时语义"原规则（包文档存在→已落地勿重发）已被本事件证伪，必须回写；CHANGELOG 的 0.4.7 条目在发布后修正（已标注"发布后修正，已发布 tarball 保留旧措辞，并入下一版本"）；`scripts/test-post-publish.mjs` 的 'accepted-but-not-visible-yet' 夹具断言新措辞，负向对照的变异仍能把它变红。已知边界：判据只能证明"注册表此刻是否在服务这个版本"，不能证明上游是否已受理；"多久算太晚"没有硬阈值，实测 >20 分钟仍不可见、<2 小时可见。

