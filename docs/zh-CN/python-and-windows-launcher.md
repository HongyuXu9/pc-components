# Python 服务器与 Windows 启动器

[English](../en/python-and-windows-launcher.md) · [Italiano](../it/python-and-windows-launcher.md) · **简体中文**

本文说明从 Partly 图标到本地服务器的完整启动过程，并介绍维护应用时需要
了解或修改的配置。

## 启动流程：从图标到服务器

`Partly.lnk` 和 `scripts/run_app.bat` 会启动同一条流程。`.lnk` 快捷方式直接指向
`wscript.exe`，并将 `scripts/run_app.vbs` 作为参数传入。

```text
Partly.lnk ─┐
            ├─> scripts/run_app.vbs ─> 隐藏的 PowerShell ─> scripts/run_app.ps1 ─> python backend/server.py
scripts/run_app.bat ┘
```

1. **`scripts/run_app.bat`** 启动 Windows Script Host（`wscript.exe`），并传入
   `scripts/run_app.vbs` 的路径。它使用 `%~dp0` 获取脚本所在目录，因此移动项目目录
   后仍然可用。批处理会立即退出；实际提供网页的不是它。
2. **`scripts/run_app.vbs`** 通过 `-NoProfile`、`-WindowStyle Hidden` 和
   `-ExecutionPolicy Bypass` 组合出 Windows PowerShell 命令，然后在后台启动。
   `-NoProfile` 可避免个人 PowerShell 配置造成干扰；`-ExecutionPolicy Bypass`
   仅对这次启动的进程生效，不会永久更改 Windows 策略。
3. **`scripts/run_app.ps1`** 根据脚本位置确定应用目录，检查端口、查找 Python、在后台
   启动 `backend/server.py`，等待服务器响应，然后在 Chrome 或 Edge 应用窗口中打开
   Partly。
4. Partly 页面运行期间，启动器会保持运行。关闭窗口时，浏览器发送
   `/api/close`，启动器随后终止它启动的 Python 进程。如果浏览器关闭时未能
   发出此信号，周期性 heartbeat 会作为后备检测方式。

因此，在任务管理器中，提供应用服务的进程是 `python.exe`；`scripts/run_app.bat` 和
`wscript.exe` 都不是服务器。PowerShell 保持隐藏，用于协调启动和关闭。

如果启动器在预设位置找不到 Chrome 或 Edge，`scripts/run_app.ps1` 会使用 Windows
默认浏览器打开应用地址。

## Python 配置

设置位于 `backend/partly_server/config.py`：

| 常量 | 用途 |
| --- | --- |
| `FRONTEND_ROOT` | `ROOT / "frontend"` |
| `ROOT` | 项目根目录，根据 Python 包的位置计算 |
| `DATA_FILE` | `data/data.json` 路径，用于保存 Build、Da valutare 和 Cestino |
| `LOG_FILE` | `logs/partly.log` 路径 |
| `ENV_FILE` | 本地 `.env` 路径，用于读取 Gemini 密钥 |
| `HOST` | 服务器监听的网络接口；`127.0.0.1` 限定为本机访问 |
| `PORT` | 本地 HTTP 端口，目前为 `8766` |
| `APP_VERSION` | `/api/version` 返回的应用版本 |
| `GEMINI_MODEL` | AI 图片识别使用的模型 |
| `HEARTBEAT_TIMEOUT_SECONDS` | 超过此时间没有 heartbeat 后，启动器会认为应用已不活跃 |

如果修改 `PORT`，还要同步修改 `scripts/run_app.ps1` 中的 `$appUrl`。前端使用相对 API
路径，因此无需修改端口。服务器绑定到本机回环地址，不会向网络中的其他设备
提供服务。

## 服务器文件

- **`backend/server.py`** 是启动器使用的稳定入口。文件缺失时会创建 `data/data.json`，然后
  创建 HTTP 服务器、记录启动信息并运行 `serve_forever()`。
- **`backend/partly_server/config.py`** 保存路径和设置。
- **`backend/partly_server/handler.py`** 实现 HTTP 接口并提供静态应用文件。
- **`backend/partly_server/runtime_state.py`** 保存数据访问锁、最近一次 heartbeat 和
  关闭请求。锁用于避免并发请求同时读写共享状态。
- **`backend/partly_server/logging_config.py`** 配置 `partly` logger，同时输出到日志
  文件和控制台流。

服务器仅使用 Python 自带的模块，不需要执行 `pip install`。

## 主要接口

| 方法和路径 | 用途 |
| --- | --- |
| `GET /api/status` | 返回服务器 host、端口和 PID |
| `GET /api/version` | 返回配置的应用版本 |
| `GET /api/data` | 读取已保存的 JSON 文件 |
| `PUT /api/data` | 原子保存三个列表 |
| `POST /api/log` | 将浏览器活动和错误追加到日志 |
| `POST /api/heartbeat` 和 `GET /api/heartbeat` | 更新并检查 Partly 页面是否活跃 |
| `POST /api/close` 和 `GET /api/close` | 向启动器发送主动关闭应用窗口的信号 |
| `POST /api/extract-image` | 启用 AI assist 时将截图发送给 Gemini |

保存数据时，服务器先将 JSON 写入同一目录中的临时文件，再将其重命名为
`data/data.json`。这种原子替换方式可降低写入途中进程中断而留下不完整文件的风险。
`data_lock` 用于串行处理本地服务器进程中的并发访问。

## 日志与 Gemini 密钥

`backend/partly_server/logging_config.py` 使用 `RotatingFileHandler`：`logs/partly.log` 达到
1 MB 后会轮换，并最多保留三个旧文件。日志包含 HTTP 请求和浏览器 Activity
log 发送的事件。如果服务器尚未就绪，启动器会暂存日志消息；启动失败时会将其
写入 `logs/partly.log`，如果该文件被占用，则写入 `logs/partly-launcher.log`。

要启用 Gemini，请在项目根目录创建 `.env`，写入一行个人密钥：

```dotenv
GEMINI_API_KEY=在此粘贴你的密钥
```

`.env` 已加入 Git 忽略规则。服务器优先检查环境变量 `GEMINI_API_KEY`；如果未
设置，再从 `.env` 读取该配置。不要把密钥写入 `config.py`、文档或 Git 提交。
修改后请重启 Partly。关闭 AI assist 时，识别仍使用本地 OCR。

## 手动启动：学习或排查问题

在项目目录打开 PowerShell 并运行：

```powershell
py -3 backend/server.py
```

如果没有 `py` 启动器但安装了 `python`，可以运行 `python backend/server.py`。服务器会
在当前终端窗口中运行；按 `Ctrl+C` 停止。要打开界面，请在浏览器访问
`http://127.0.0.1:8766`。

手动启动时没有 `scripts/run_app.ps1` 负责监控生命周期，所以关闭浏览器页面不会自动
停止 Python。日常使用时请启动 `Partly.lnk` 或 `scripts/run_app.bat`，由启动器一起管理
浏览器、日志和服务器关闭。

启动前，启动器会检查端口 `8766`。如果发现有进程正在监听该端口，它会终止该
进程并启动新实例。启动 Partly 时，请避免让其他服务占用这个端口。

静态文件从 `FRONTEND_ROOT`（`frontend/`）提供，不依赖工作目录。浏览器 URL 仍为 `/js/`、`/styles/` 和 `/assets/`。

## 使用 Tavily 搜索报价

在 Build 配件上点击 **Find offers**，搜索 Amazon.it、eBay.it 和
AliExpress.com。在本地 `.env` 中设置 `TAVILY_API_KEY=你的密钥` 后重启。
每次点击最多发送三次 basic 搜索，返回的积分用量记录在日志中。
Gemini 用于可选的截图识别和候选筛选。

搜索会添加新链接，包括需要人工确认的结果。已有报价的价格、链接和历史
永远不会被覆盖。同一商品链接不会重复添加，每个商店可添加多条报价。
已验证结果需要页面确认型号、新品、库存及欧元价格；其他结果显示可用价格，无价格时显示 `undefined`。
无法确认价格时，保存无价格的链接，历史为空，不参与 Build 最低价计算。
打开链接检查后，使用 **Log price** 手动输入价格。

搜索可能返回不同型号或无关商品，请确认型号、版本、成色、库存和最终价格。
不包含运费，也不能保证找到整个互联网的最低价。

## Debug

快捷方式隐藏启动服务器。关闭 Partly，在 VS Code 打开项目，按 F5 选择 **Partly: debug server**。设置断点后打开 http://127.0.0.1:8766。启动器优先使用 `.venv`，否则使用系统 Python。不需要额外 Python 包。

```powershell
python -m unittest discover -s tests -v
node --test tests/offer-search.test.mjs
```

搜索保留同一商店的多个商品，按商品链接标识和成色去重。已有报价保持不变。已验证价格优先于摘要价格；缺失价格保持 null，不计入最低价。新品、二手和翻新保持区分。最多评估 maxCandidates（默认20）个候选，返回 maxOffers（默认8）条报价。最多检查六个不同商品页面。摘要价格需要人工核实。结果窗口显示验证状态和成色。Tavily 来源使用 uri/title，旧的建议 HTML 字段已移除。共享规则和限制位于 frontend/assets/search-stores.json。无需新增依赖或启动设置。

界面以搜索添加或手动添加区分报价。缺失价格显示 `undefined`。结果窗口底部有关闭按钮，显示验证状态和成色。

搜索先根据标题和摘要筛选品牌或型号合理匹配的候选，再由已配置的 Gemini 筛选 Tavily 候选，不调用 Google Search。链接和价格必须来自来源。Gemini 失败时使用本地过滤结果。Amazon 摘要缺少价格时仍显示 undefined。

价格图将最近价格延续至今天。无记录日期沿用前值，价格变化显示为阶梯。圆点只表示真实记录，可点击编辑；不会添加虚构历史。

Build 和愿望清单均可搜索报价，不要求完整型号。结果保存至原列表。愿望清单图表也将价格延续至今天。

搜索先使用带引号的准确型号。如果有效商品少于五个（或配置的报价/候选上限），再尝试不带引号并包含配件类型的查询，最后搜索二手和翻新。每次点击最多发送三次 Tavily basic 请求，每次单独消耗额度。所有查询都保留容量、速度及型号后缀。通用标题可使用摘要中的型号证据；标题明确指向错误型号的商品会被排除。后续请求失败时保留已有结果。无需新增配置或依赖。

Gemini 通过一次请求检查所有候选的型号和价格。标题不完整但品牌或型号合理匹配的候选仍交给 Gemini。页面验证及无 Gemini 时的回退保留严格型号检查。价格解析检查与所选金额直接关联的标签，其他位置提到折扣或免费配送不会使售价失效。Gemini 区分当前商品全价、折扣金额、优惠券、分期、运费及原价。后端仅接受来源原文中包含单个欧元金额的引用，并始终优先采用商品页面验证的价格。Gemini 无法确定价格时保留 null；未配置 Gemini 或请求失败时，仅页面验证可提供价格。摘要价格保持 verified=false，结果窗口显示需要验证。已有报价保持不变。API 密钥和启动配置保持不变。

使用配件列表上方的 **查找全部报价** 搜索当前 Build 或待评估列表中的所有配件，包括被筛选条件隐藏的配件。队列显示已完成/总数及错误数量。**停止剩余搜索** 会让当前请求完成并保存，然后跳过后续配件。界面保持可用。队列逐个复用现有 Tavily + Gemini 接口和保存逻辑。重复配件 ID 被跳过；同一次运行中相同名称和类别共享搜索结果。已修改或删除的配件被跳过，单个商品失败不会中断队列。队列空闲时仍可单独搜索；重叠启动会被忽略。已有报价保持不变。无需新增依赖、后端接口、密钥或启动配置。
