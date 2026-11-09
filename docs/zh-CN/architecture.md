# 架构

[English](../en/architecture.md) · [Italiano](../it/architecture.md) · **简体中文**

Partly 是一款本地优先、具有桌面应用风格的 Web 应用。界面由浏览器提供，
本地 HTTP API 使用 Python 标准库，`data/data.json` 是可读的数据存储。项目无需
构建步骤，也无需安装运行时软件包。

## 前端

`frontend/index.html` 是页面骨架，加载 CSS 入口 `frontend/styles/style.css` 和原生 JavaScript 模块
入口 `frontend/js/app.js`。

| 模块 | 职责 |
| --- | --- |
| `frontend/js/domain.js` | 产品规范化、商店识别、数据迁移和 OCR 文本解析 |
| `frontend/js/activity-log.js` | 浏览器活动上报、日志窗口行为和生命周期信号 |
| `frontend/js/image-recognition.js` | 截图预览、Gemini 请求和本地 OCR 协调 |
| `frontend/js/price-chart.js` | 价格图表渲染和价格历史编辑 |
| `frontend/js/saved-collections.js` | 待考虑列表和回收站卡片渲染 |
| `frontend/js/app.js` | 应用状态、页面渲染、表单提交和事件协调 |

样式按职责放在 `frontend/styles/` 中。`frontend/styles/style.css` 中的导入顺序是有意安排的：响应式
规则和功能覆盖样式放在它们所调整的基础规则之后。

## 本地服务器

`backend/server.py` 是启动器调用的入口。`backend/partly_server` 包包含 HTTP 请求处理器、
路径和端口配置、日志设置，以及请求处理器共享的少量线程安全运行状态。它
仅使用 Python 标准库。

服务器绑定到 `127.0.0.1`。`/api/data` 读写三个已保存列表；写入时先写临时
文件，再原子替换目标文件。`/api/log` 接收浏览器活动，`/api/heartbeat` 用于
生命周期恢复，`/api/close` 表示用户主动关闭应用窗口。只有启用 AI assist 时，
截图识别才会调用 `/api/extract-image`。

Python 配置、API、`.env` 和 Windows 启动流程的详细说明见
[Python 服务器和 Windows 启动器指南](python-and-windows-launcher.md)
（[English](../en/python-and-windows-launcher.md)，[Italiano](../it/python-and-windows-launcher.md)）。

## 修改边界

- 修改持久化数据结构时，确保与 `migrate()` 兼容并记录变更。
- 浏览器状态和 API 响应保持为普通 JSON，方便检查和备份 `data/data.json`。
- 不配置 Gemini 时，应用仍应可用；默认使用本地 OCR。
- 前端模块不引入运行时依赖，模块之间使用显式导入。
- `backend/server.py` 保持为 Windows 启动器使用的稳定入口。

## 使用 Tavily 搜索报价

在 Build 配件上点击 **Find offers**，搜索 Amazon.it、eBay.it 和
AliExpress.com。在本地 `.env` 中设置 `TAVILY_API_KEY=你的密钥` 后重启。
每次点击最多发送三次 basic 搜索，返回的积分用量记录在日志中。
Gemini 用于可选的截图识别和候选筛选。

搜索添加新链接，包括需要人工确认的结果。手动标签保持不变。同一商店/域名的搜索标签仅更新更低价格或补全缺失价格，同时更新商品链接和成色并保留历史。
已验证结果需要页面确认型号、新品、库存及欧元价格；其他结果显示可用价格，无价格时显示 `undefined`。
无法确认价格时，保存无价格的链接，历史为空，不参与 Build 最低价计算。
打开链接检查后，使用 **Log price** 手动输入价格。

搜索可能返回不同型号或无关商品，请确认型号、版本、成色、库存和最终价格。
不包含运费，也不能保证找到整个互联网的最低价。

`frontend/js/offer-search.js` → `POST /api/search-offers` → `backend/partly_server/offer_search.py` → Tavily Search.

服务器检查商品页面，浏览器添加报价并通过 `/api/data` 保存。缺失价格使用 JSON null，历史为空。不使用 Google Search 或 Live API。

搜索可返回同一商店的多个商品，按商品标识和成色去重；保存时与该商店的搜索标签比较价格。手动报价保持不变；搜索标签仅更新更低价格或补全缺失价格。已验证价格优先于摘要价格；缺失价格保持 null，不计入最低价。新品、二手和翻新保持区分。最多评估 maxCandidates（默认20）个候选，返回 maxOffers（默认8）条报价。最多检查六个不同商品页面。摘要价格需要人工核实。结果窗口显示验证状态和成色。Tavily 来源使用 uri/title，旧的建议 HTML 字段已移除。共享规则和限制位于 frontend/assets/search-stores.json。无需新增依赖或启动设置。

界面以搜索添加或手动添加区分报价。缺失价格显示 `undefined`。结果窗口底部有关闭按钮，显示验证状态和成色。

搜索先根据标题和摘要筛选品牌或型号合理匹配的候选，再由已配置的 Gemini 筛选 Tavily 候选，不调用 Google Search。链接和价格必须来自来源。Gemini 失败时使用本地过滤结果。Amazon 摘要缺少价格时仍显示 undefined。

价格图将最近价格延续至今天。无记录日期沿用前值，价格变化显示为阶梯。圆点只表示真实记录，可点击编辑；不会添加虚构历史。

Build 和愿望清单均可搜索报价，不要求完整型号。结果保存至原列表。愿望清单图表也将价格延续至今天。

搜索先使用带引号的准确型号。如果有效商品少于五个（或配置的报价/候选上限），再尝试不带引号并包含配件类型的查询，最后搜索二手和翻新。每次点击最多发送三次 Tavily basic 请求，每次单独消耗额度。所有查询都保留容量、速度及型号后缀。通用标题可使用摘要中的型号证据；标题明确指向错误型号的商品会被排除。后续请求失败时保留已有结果。无需新增配置或依赖。

Gemini 通过一次请求检查所有候选的型号和价格。标题不完整但品牌或型号合理匹配的候选仍交给 Gemini。页面验证及无 Gemini 时的回退保留严格型号检查。价格解析检查与所选金额直接关联的标签，其他位置提到折扣或免费配送不会使售价失效。Gemini 区分当前商品全价、折扣金额、优惠券、分期、运费及原价。后端仅接受来源原文中包含单个欧元金额的引用，并始终优先采用商品页面验证的价格。Gemini 无法确定价格时保留 null；未配置 Gemini 或请求失败时，仅页面验证可提供价格。摘要价格保持 verified=false，结果窗口显示需要验证。手动报价保持不变；搜索标签仅更新更低价格或补全缺失价格。API 密钥和启动配置保持不变。

使用配件列表上方的 **查找全部报价** 搜索当前 Build 或待评估列表中的所有配件，包括被筛选条件隐藏的配件。队列显示已完成/总数及错误数量。**停止剩余搜索** 会让当前请求完成并保存，然后跳过后续配件。界面保持可用。队列逐个复用现有 Tavily + Gemini 接口和保存逻辑。重复配件 ID 被跳过；同一次运行中相同名称和类别共享搜索结果。已修改或删除的配件被跳过，单个商品失败不会中断队列。队列空闲时仍可单独搜索；重叠启动会被忽略。手动报价保持不变；搜索标签仅更新更低价格或补全缺失价格。无需新增依赖、后端接口、密钥或启动配置。

单独搜索和批量搜索共用保存规则。相同、更高或未知价格不会替换已有价格。手动标签不参与更新。摘要明确缺货、商品页面对应的库存状态以及 HTTP 404/410 会排除该商品，即使摘要包含价格。Gemini 也在现有批量调用中排除不可购买的商品。未知库存不表示已确认有货。商店规则、API 调用上限、配置及启动保持不变。
