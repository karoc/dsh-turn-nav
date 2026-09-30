# Agent Note: post-publish-202-detection

Status: implemented

## Problem

0.4.7 发布时 npm 打印 `+ dsh-turn-navigator@0.4.7` 并 exit 0，但注册表上什么都没有：版本文档与 tarball 双双 404、packument 仍停在 0.4.6，二十分钟后依然如此。npm 的 own debug 日志显示 `PUT … 401`（触发网页 2FA）之后 `PUT … 202 Accepted`，而 `npm-registry-fetch` 只对 >= 400 抛错，202 因此被当成成功。仓库里的 `post-publish-check.mjs` 在这种状态下输出了 "the package document is live … **the upload landed**, the index is still catching up" —— 一句会让人安心等待、而不是去重发的错误结论。这正是用户全局纪律里说的"文档/提示语与行为不一致"同类缺陷：提示语把一个失败说成了延迟。

## Decision

`scripts/post-publish-check.mjs` 在"版本文档 404 而包文档可读"时不再断言"上传已落地"，而是用**确定性 tarball URL**（`{registry}/{escapedName}/-/{basename}-{version}.tgz`，作用域包取 basename）做存在性探测（HEAD，405/501 退回 ranged GET，配置了 npm 代理时退回 curl），三态 `present`/`absent`/`unknown`：`present` 保留旧措辞（索引在追，已落地）；`absent` 报警告说"该版本**不在**注册表上"，写明 npm 对 `202 Accepted` 也按成功处理（`npm-registry-fetch` 只对 >= 400 抛错）、给出 tarball URL 坐标与重发配方（重发已接受的版本会以 `EPUBLISHCONFLICT` 安全失败）；`unknown` 保持旧的保守措辞。两种情况都仍然 exit 0——postpublish 不能撤销已发生的上传，把它变成失败会重演 0.1.0 的假失败。脚本头部的分级规则同步写明该判据；`scripts/test-post-publish.mjs` 新增 'accepted-but-not-created' 夹具并把原 'index lag' 夹具改成"tarball 已在服务"（原来那条夹具的 stub 对合成 URL 一律 404，正好就是真实事故现场）；`CONTRIBUTING.md` 增加"发布了但注册表没有"的恢复配方；该夹具脚本此前**不在** `npm test`/`verify:all` 里，本次一并接入。负向对照新增一条变异（把 absent 判成 present）证明判据可失败。
## Alternatives considered

**用 npm 的 debug 日志判断**（`~/.npm/_logs/*-debug-0.log` 里有 `http fetch PUT 202 …`）：日志目录/文件名随 npm 版本与平台变化，且 postpublish 只在自己的进程里运行，跨进程依赖日志不可靠；**把 202 当作 FATAL**：会重演 0.1.0 的教训（上传成功但索引未到，却被报成失败，让一次好发布看起来坏了），而 postpublish 无法撤销上传，假失败会误导人重发；**无限期轮询直到可见**：postpublish 是发布命令的一部分，把人工等待拖到 10 分钟以上只是把问题推给下一个人，判据（tarball 在不在）已经能给出结论。
## Consequences

代价：多一次 HEAD（仅在"版本文档 404 且包文档可读"时发生），并且当 tarball 探测本身被代理/网络挡住时结论退化为"不确定"（沿用旧措辞，不误报）。收益：一条真实的发布失败不再被包装成"索引还在追"——0.4.7 事件里那句措辞直接掩盖了必须重发的事实；现在脚本会点出 202 机制、给出坐标 URL 与重发配方，且失败仍然 exit 0（不误伤已上传的发布）。义务：CHANGELOG 记录事件与行为变化；CONTRIBUTING 增加"发布了但注册表没有"的排查与恢复步骤（含"不要因为重发而 bump 版本"——未落地的发布不算已发布）；`scripts/test-post-publish.mjs` 补 'accepted-but-not-created' 夹具并被接入 `npm test`/`verify:all`（此前该脚本没有任何门禁覆盖，是本次修出来的覆盖缺口）；负向对照新增一条变异证明该判据可失败。已知边界：判据假定"tarball 与版本文档同源可见"——若注册表存在"先服务 tarball 后建版本文档"的中间态，本判据会在该窗口内说"已落地"（偏保守，不会误报失败）。

