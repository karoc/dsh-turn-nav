# Negative guarantees

Two sections, deliberately: **pinned** promises (an assertion fails when they
break) and **unpinned** ones (true today by construction, but with no automated
pin — they must not be read as if a test guards them).

## Pinned (assertion labels in `scripts/test-client-dispose.mjs` and `scripts/test-turn-labels.mjs`)

| id | guarantee | pinned by |
|---|---|---|
| G1 | bundle 必须**以插件 id `dsh-turn-navigator` 注册**（注册到别的 id 会让整条胶囊条消失） | `the bundle registers under its plugin id` |
| G2 | bundle 必须**暴露 `apply()`**（cordis 插件契约） | `the plugin exposes apply()` |
| G3 | `apply()` **至少注册一个可 dispose 的 cordis effect**（否则热更新会泄漏） | `apply() registered at least one cordis effect to dispose` |
| G4 | 默认模式（`stn`）下 `apply()` **用 body class 隐藏官方 rail**，而不是靠删 DOM | `apply() hides the OFFICIAL rail through the body class (default mode is stn)` |
| G5 | `apply()` **注册会话头 rail 槽位**（`conversation.session.header.utilities`） | `apply() still registers the session-header rail` |
| G6 | `apply()` **注册设置页偏好行**（`settings.general.item`） | `apply() still registers the settings preference row` |
| G7 | **`dispose()` 必须移除 body class，让官方 rail 回来**——这是 HMR / 实时禁用的核心契约，漏了它用户会以为胶囊条"关不掉" | `dispose() removes the body class so the OFFICIAL rail comes back (HMR/live-disable contract)` |
| G8 | **任何数据层都不伪造占位符**：无人类提示词的轮次（机器唤醒的 goal/plugin/subagent-settled/compaction 轮、空输入/取消轮）在 journal 与窗口两条路径上都只产出**空标签**，绝不产出 `(no user message)` 之类的自造文案 | `no data-layer path fabricates a "(no user message)" placeholder` |
| G9 | 空标签在**渲染层**回退到**本地化轮次标签**（zh `第 N 轮` / en `Turn N`），与官方 `TurnNavigator` 的 `preview.prompt \|\| t('chat.turnNavigation.turn')` 同语义 | `the tooltip body falls back to the localized turn label (en)` |
| G10 | journal 折叠**只**用人类来源（`source.kind === 'user'`）的**追加**（surfaceOp append）消息标注轮次：注入文本（`<goal_round>`、runtime-context、compaction checkpoint…）永不进入标签 | `the journal fold never copies injected payload text into a turn label` |
| G11 | 多通道合并时**空 channel 不遮蔽有内容的 channel**，且宿主 `turnOutline` 投影可单独为两条读通道都够不到的轮次提供标签 | `a blank journal entry never shadows a labelled window entry` |

## 未钉住（由构造/审阅保证，**没有**自动化测试）

- **不向任何地方发送数据**：`src/` 内没有 `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon`（grep 级证据，非测试）。
- **不写会话状态**：插件不调用任何会话写入 API；host 半区是空 `apply()`（`src/index.ts`），只读 DOM。
- **三档模式持久化**：模式存于 `localStorage` 的 `dsh-turn-navigator.mode`；键名与默认值没有测试钉住（改动需人工确认）。
- **样式上限**：胶囊条约 3px、容器 ≤30vh 且滚动条隐藏——纯 CSS，无测试。
- **真机标签口径**：`scripts/verify-turn-labels.mjs` 会在真实 GUI 里扫侧栏可达会话，断言"无占位符 / 无注入文本 / 被服务的 bundle 不含占位符字符串"——它需要本机 dsh web 与 Playwright，因此**不进** `verify:all`（离线门禁），按需手动跑并把坐标写进 CHANGELOG。

若要把其中任一条转成"已钉住"，办法是补一个断言并把该行移进上表；**不要**只在文档里换个说法。
