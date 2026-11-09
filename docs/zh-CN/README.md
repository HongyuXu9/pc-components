# Partly

[English](../../README.md) · [Italiano](../it/README.md) · **简体中文**

Partly 是一款本地 PC 配件和价格追踪应用。数据以可读的 `data/data.json` 文件
保存在应用目录中；应用不使用数据库，也不把数据保存在浏览器里。如果发现
旧版本留在浏览器中的数据，Partly 会先将其迁移到 `data/data.json`，并且只有在
文件保存成功后才清除旧数据。

## 启动应用

1. 在 Windows 上双击 `Partly.lnk`，即可在 Chrome 或 Edge 的应用窗口中打开
   Partly。它会在没有控制台窗口的情况下启动本地服务器，并在关闭 Partly
   窗口时停止服务器。
2. 可以将 `Partly.lnk` 复制到桌面，作为桌面快捷方式。
3. 也可以使用 `scripts/run_app.bat` 启动服务器和应用。

需要安装 Python 3。服务器只监听本机连接。请备份 `data/data.json`，以保留配件和
价格历史。

## 项目结构

前端使用原生 JavaScript 模块，因此不需要 Node.js 构建步骤。`frontend/js/app.js` 负责
协调界面；`frontend/js/` 下的模块分别处理产品规则、图片识别、价格历史、活动日志和
已保存列表的渲染。`frontend/styles/style.css` 是入口样式表，并导入按功能整理的 `frontend/styles/`
文件。

`backend/server.py` 是 Python 服务入口。HTTP 路由、配置、日志和共享运行状态位于
`backend/partly_server/` 包中。模块边界和 API 说明请参阅[架构指南](architecture.md)
（[English](../en/architecture.md)，[Italiano](../it/architecture.md)）。

有关 Python 配置、`.env` 以及 Windows 启动链（`.lnk` / `.bat` → `.vbs` →
PowerShell → Python），请参阅[服务器和启动器指南](python-and-windows-launcher.md)
（[English](../en/python-and-windows-launcher.md)，[Italiano](../it/python-and-windows-launcher.md)）。

添加或编辑配件时，可以通过图片 URL 设置产品图片。示例配件中也包含一些由
对应商家网站托管的产品图片。

配件页面分为 Build、**Da valutare（待考虑）** 和 **Cestino（回收站）**。
待考虑列表不会计入装机总价；你可以将其中的配件加入 Build，或用它替换当前
配件。替换或删除的配件会进入回收站，可以恢复或永久删除。

要从截图中批量添加产品，请打开 **Add component**，按 **Ctrl+V** 粘贴图片或
选择图片，检查识别出的商品，然后添加。保存前可以修改 OCR 识别结果。

默认情况下，截图识别由本机的 Tesseract 完成。如需可选的 Gemini AI 识别，
请在 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建 API 密钥，
并在 项目根目录的 `.env` 中设置 `GEMINI_API_KEY=你的密钥`，然后重启
Partly。在粘贴截图前启用 **AI assist**。启用后，截图会发送给 Google；关闭
该选项即可只在本机识别。Google 免费 API 有使用限制，提交的内容也可能被用于
改进其产品；启用前请查看 Google 当前条款。

保存失败时，请查看 `logs/partly.log`。如果服务器拒绝保存，
**Save component** 对话框会保持打开。浏览器错误和保存活动也会显示在应用的
Activity log 中。

共享图片位于 `frontend/assets/images/`；请参阅[资源约定](../en/assets.md)。

## 使用 Tavily 搜索报价

在 Build 配件上点击 **Find offers**，搜索 Amazon.it、eBay.it 和
AliExpress.com。在本地 `.env` 中设置 `TAVILY_API_KEY=你的密钥` 后重启。
每次点击发送一次 basic 搜索，返回的积分用量记录在日志中。
Gemini 仅用于可选的截图识别。

搜索会添加新链接，包括需要人工确认的结果。已有报价的价格、链接和历史
永远不会被覆盖。同一商品链接不会重复添加，每个商店只添加一条报价。
已验证结果需要页面确认型号、新品、库存及欧元价格；其他结果显示可用价格，无价格时显示 `undefined`。
无法确认价格时，保存无价格的链接，历史为空，不参与 Build 最低价计算。
打开链接检查后，使用 **Log price** 手动输入价格。

搜索可能返回不同型号或无关商品，请确认型号、版本、成色、库存和最终价格。
不包含运费，也不能保证找到整个互联网的最低价。

搜索从返回结果中为每个商店选择最低欧元价格，也读取 Tavily 摘要中的价格。摘要价格可能过时或有条件，需要人工确认。已有搜索报价的商店跳过，不修改价格或链接。没有价格时，每个缺失商店仍可添加一个无价格链接。

界面以搜索添加或手动添加区分报价。缺失价格显示 `undefined`。结果窗口底部有关闭按钮，不显示验证标签。

报价来源使用彩色标签：搜索为蓝色，手动为灰色，同时保留文字和圆点。

来源标签位于商店名称左侧，间距紧凑并与文字对齐。

搜索先按型号过滤标题，再由已配置的 Gemini 筛选 Tavily 候选，不调用 Google Search。链接和价格必须来自来源。Gemini 失败时使用本地过滤结果。Amazon 摘要缺少价格时仍显示 undefined。

价格图将最近价格延续至今天。无记录日期沿用前值，价格变化显示为阶梯。圆点只表示真实记录，可点击编辑；不会添加虚构历史。

Build 和愿望清单均可搜索报价，不要求完整型号。结果保存至原列表。愿望清单图表也将价格延续至今天。

来源包括 Amazon、AliExpress、eBay、PcComponentes、BPM Power、Alternate、LDLC、MediaWorld、Unieuro 和 Subito，包含二手及翻新。最多评估20个候选，返回8个商店报价，每站一条，按价格排序，无价格排后。成色来自标题。最多直接检查6个页面，其他使用摘要。

商店配置位于 `frontend/assets/search-stores.json`，前后端共享。每项包含 domain、name 和 productPattern（商品链接识别表达式）。maxCandidates 和 maxOffers 可配置，上限20。修改后重启并刷新。API 密钥仍在 .env。每个商店可同时保留手动及搜索报价，即使搜索价格更高；不覆盖已有报价。
