# Thunderbit 深度研究与 KeyLens 产品取舍

研究时间：2026-10-28

研究对象：Thunderbit Agentic Web Scraper 浏览器扩展

方法：官方产品站、官方定价页、Chrome Web Store 详情与近期中英文评价公开页面。样本用于发现重复出现的问题，不代表完整用户调研。

## 1. 当前功能全景

Thunderbit 已经从“网页转表格”扩展扩展成 AI 数据代理，核心能力包括：

- One Click Extract：AI 自动建议字段并生成结构化结果。
- 自然语言字段：用普通语言描述需要的数据，不需要 CSS selector。
- 预置模板：Amazon、eBay、Google Maps、Zillow、LinkedIn 等站点可直接运行，模板不消耗 AI credits。
- 子页面抓取：访问列表中的详情页，把详情字段补充回主表。
- 翻页、批量页面和无限滚动自动化。
- 定时抓取与网页变更监控。
- AI 后处理：摘要、分类、翻译、格式化和计算。
- 联系方式、PDF、图片 OCR 与文章/Transcript 提取。
- 导出到 Excel、Google Sheets、CSV、Airtable、Notion。
- 独立 Web App、API、CLI 与 MCP Server。

官方首页强调“two clicks / 1 click”“sales & ops teams”“200,000+ users”。Chrome Web Store 页面显示 100,000 用户、55 种语言、4.69 MiB、版本 4.6.6，最近更新日期为 2026-08-10。

来源：

- https://thunderbit.com/
- https://thunderbit.com/web-scraper-chrome-extension
- https://chromewebstore.google.com/detail/hbkblmodhbmcakopmmfbaopfckopccgp

## 2. 当前定价结构

2026-10-28 官方定价页可见：

| 方案 | 价格 | 页面/额度 | 关键功能 |
| --- | --- | --- | --- |
| Free | $0 | 6 页/月，每页最多 30 credits | 数据导出、基础提取工具 |
| Starter | 年付 $9/月；页面内月付数据为 $15/月 | 年付 5,000 credits/年；月付 500 credits/月 | 子页面、预置模板、批量、翻页、数据增强、5 个定时任务 |
| Pro | 月付 $38；年付 $24/月（页面促销价 $16.5/月） | 年付 30,000 credits/年；月付 3,000 credits/月 | 无限 scraper、25 个定时任务、最短 5 分钟监控 |
| Business | 定制 | 定制 credits | 更高限额、优先支持、客户管理 |

注：官方页面同一页的 FAQ 与计划卡存在“5 页/月”和“6 页/月”两种说法；这也说明复杂额度模型会直接造成认知摩擦。

Credit 规则：

- 普通网页抓取：1 条输出行 = 1 credit。
- 子页面抓取：1 条输出行 = 2 credits。
- Advanced Model 消息：1 条 = 1 credit。
- Personal Data Enrichment：成功查询 = 30 credits。

来源：https://thunderbit.com/pricing

## 3. 用户评价信号

Chrome Web Store 在主页面研究时显示 3.7/5，共 219 个评分；官方站点展示的 Chrome Web Store 评分更高，说明不同时间、地区和统计口径存在差异。

### 正面信号

- “打开页面，告诉它要 title、email、price，它自己把列建好。”
- “两分钟上手”“不需要代码”“省去反复复制粘贴”。
- 适合销售线索、电商商品、房地产列表和文章资料整理。
- 预置模板降低常见站点的首次使用成本。

### 负面信号

近期中英文评价中反复出现以下问题：

| 问题 | 评价中的典型表达 | 产品含义 |
| --- | --- | --- |
| 配额不透明 | “付费使用后还是只能抓几页”“没有通知就产生意外费用” | 计划、credit 消耗和扣费时机必须在操作前可见 |
| 空结果仍消耗额度 | “子页面返回空内容”“重复数据浪费 credits” | 空结果、重复结果不应计费 |
| 子页面/翻页不稳定 | “抓不到东西”“子页面获取不了”“多页刚开始不好上手” | 自动化流程需要进度、失败原因和可恢复点 |
| 价格预期落差 | “注意，不是免费的”“退款和支持没有响应” | 免费版边界和升级入口必须诚实、克制 |
| 数据与隐私担忧 | “个人数据使用未经充分透明说明” | 默认本地处理，明确权限与数据流向 |

来源：

- https://chromewebstore.google.com/detail/thunderbit-ai-web-scraper/hbkblmodhbmcakopmmfbaopfckopccgp/reviews?hl=en
- https://chromewebstore.google.com/detail/thunderbit-ai-web-scraper/hbkblmodhbmcakopmmfbaopfckopccgp/reviews?hl=zh-CN

## 4. 真正需要修正的产品矛盾

### 4.1 AI 能力越强，结果越难预测

自然语言降低了输入门槛，却把不确定性转移到执行阶段。用户不知道 AI 会识别哪些字段、需要访问多少子页面、会扣多少 credits。KeyLens 因此优先提供可解释的本地规则、字段预览和置信度，而不是把“AI 自动完成”当作唯一卖点。

### 4.2 免费版是漏斗，不应该是陷阱

Thunderbit 的免费版每月只有 6 页，且高级模板、批量、翻页、子页面、数据增强被锁定。对于首次验证用户，这足够看到界面，却不足以完成一次真实任务。KeyLens 的免费版保留两个完整场景：页面摘要和联系方式，并允许 CSV 导出，每天 12 次。

### 4.3 Credit 模型把“数据量”与“功能使用”混在一起

普通行、子页面、AI 消息、数据增强都以 credits 表达，用户很难在点击前估算成本。KeyLens 当前版本不引入 credit，仅限制页面次数与单页行数；Pro 不按 AI 调用另计费。正式接入远程 AI 或第三方数据源时，应继续在按钮旁显示独立成本。

### 4.4 多页流程缺少“可检查的中间状态”

用户经常在子页面返回空、重复行或抓取不全后才发现流程有问题。KeyLens 先做当前页预览，Pro 的批量标签页逐页汇总，并显示成功/失败页面；不把大量不可见的浏览器操作藏在一次点击后面。

## 5. KeyLens 的设计原则

1. **Free must finish a job**：免费版不是演示壳，页面摘要和联系方式可以完成真实任务。
2. **No hidden usage**：每日次数、单页行数、重复页面免计次、空结果免计次均在操作前显示。
3. **Local first**：当前版本不发送页面内容到远端，不依赖 AI 额度，不建立遥测。
4. **Preview before export**：先展示字段、表格、来源和置信度，再复制、保存或导出。
5. **Pro sells throughput, not basic access**：Pro 卖结构化模式、批量、自定义字段、JSON 和历史，不卖“能否使用”。
6. **Fail visibly**：空结果、受限页面、无权限页面、排除域名都返回明确原因。

## 6. 免费版与 Pro 的最终边界

| 能力 | Free | Pro |
| --- | --- | --- |
| 页面摘要 | 是 | 是 |
| 联系方式 | 是 | 是 |
| 每日提取 | 12 次 | 不限 |
| 单页列表行数 | 30 行 | 300 行 |
| CSV | 是 | 是 |
| 文章结构 | 否 | 是 |
| 商品信息 | 否 | 是 |
| 列表表格 | 否 | 是 |
| 自定义字段 | 否 | 是 |
| 选中文本摘要 | 否 | 是 |
| 批量当前标签页 | 否 | 是，最多 8 页 |
| JSON | 否 | 是 |
| 历史记录 | 否 | 50 条 |
| 7 天试用 | 可开启一次 | 已在 Pro 中 |

建议正式商业价格：月付 ¥29-39，年付 ¥199-249；企业版另行报价。最终价格应由支付渠道、税费和客服成本验证后确定。仓库当前不绑定支付平台，也不包含服务端许可证校验。

## 7. 当前实现明确不做的功能

- 不绕过登录、付费墙、验证码或网站访问限制。
- 不在后台自动翻页、爬取子页面或定时访问网站。
- 不上传网页内容到远端 AI。
- 不把本地演示激活码当作正式授权机制。
- 不承诺对任意动态站点 100% 结构化；应通过真实站点回归持续改规则。

## 8. 后续最有价值的增量

1. 服务端许可证与 Stripe / Dodo / Paddle 等支付渠道对接。
2. 可选用户自带 Key 的 AI 字段映射，并在 UI 中单独显示调用成本。
3. 用户点击选择器（visual picker）替代自然语言字段。
4. 批量 URL 导入与失败重试，不默认抓取全部标签页。
5. 规则模板市场与站点级回归测试。
6. 可选的 Google Sheets / Notion 导出 OAuth 集成。
