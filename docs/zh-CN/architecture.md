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

在 Build 配件上点击 **Find offers · beta**，搜索 Amazon.it、eBay.it 和
AliExpress.com。在本地 `.env` 中设置 `TAVILY_API_KEY=你的密钥` 后重启。
每次点击发送一次 basic 搜索，返回的积分用量记录在日志中。
Gemini 仅用于可选的截图识别。

搜索会添加新链接，包括需要人工确认的结果。已有报价的价格、链接和历史
永远不会被覆盖。同一商品链接不会重复添加，每个商店只添加一条报价。
已验证结果需要页面确认型号、新品、库存及欧元价格；其他结果需要人工确认。
无法确认价格时，保存无价格的链接，历史为空，不参与 Build 最低价计算。
打开链接检查后，使用 **Log price** 手动输入价格。

搜索可能返回不同型号或无关商品，请确认型号、版本、成色、库存和最终价格。
不包含运费，也不能保证找到整个互联网的最低价。

`frontend/js/offer-search.js` → `POST /api/search-offers` → `backend/partly_server/offer_search.py` → Tavily Search.

服务器检查商品页面，浏览器添加报价并通过 `/api/data` 保存。缺失价格使用 JSON null，历史为空。不使用 Google Search 或 Live API。

搜索从返回结果中为每个商店选择最低欧元价格，也读取 Tavily 摘要中的价格。摘要价格可能过时或有条件，需要人工确认。已有商店完全跳过，不修改价格或链接。没有价格时，每个缺失商店仍可添加一个无价格链接。

界面以搜索添加或手动添加区分报价。缺失价格显示 `undefined`。结果窗口底部有关闭按钮，不显示验证标签。
