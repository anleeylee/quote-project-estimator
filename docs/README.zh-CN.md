# bfc-estimate — 木材报价与项目估算器

> 英文原版：[English](../README.md) · 在线计算器：[https://boardfootcalc.net/lumber-cost-calculator/](https://boardfootcalc.net/lumber-cost-calculator/)

直接从切割清单估算木材报价。每一行都显示**净板尺**（成品零件）、**毛板尺**（含废料）、经销商实际会收取的**计费板尺**（按计费档位取整）以及木种价目表价格 — 整个项目再叠加加价、税、运费、杂费和折扣，汇总成一份整洁可分享的报价。

相关指南：Companion guide: [木材成本计算器](https://boardfootcalc.net/lumber-cost-calculator/) · See also [硬木厚度指南](https://boardfootcalc.net/hardwood-lumber-thickness-guide/) · and [板尺公式详解](https://boardfootcalc.net/board-foot-formula-explained/)。

## 功能

- **切割清单 → 报价** — 一份零件 CSV 直接变成完整的材料估算。
- **每行 净/毛/计费板尺** — 先按浪费系数上浮，再套用经销商的计费档位（共享引擎的全部 8 种）。
- **木种价目表** — 按木种和厚度解析 $/板尺；必要时跨厚度档回退。
- **加价与合计** — 加价百分比、税率（支持含税价，不重复计税）、运费、杂费、折扣。
- **场景对比** — 一条命令对比你的默认价目表与备选供应商的价目表。
- **项目文档** — 一个 JSON 文件保存零件、价格与设置，可随时重新生成。
- **导出** — 可分享的 HTML 报价、CSV 报价（行+合计）、完整 JSON。

## 安装

```bash
git clone https://github.com/anleeylee/quote-project-estimator 05-lumber-quote-project-estimator
cd 05-lumber-quote-project-estimator
npm install
npm run build        # 编译到 dist/
npm test             # 11 个测试
```

## 快速开始

```bash
npm run demo
bfc-estimate quote --project myjob.json --out quote.html
```

完整命令参考、输入格式与实现原理请见[英文 README](../README.md)。

## 计算引擎

本工具内置了共享的 [BoardFootCalc Desktop 木材计算引擎](https://boardfootcalc.net/lumber-cost-calculator/)
的冻结副本（位于 `src/core/`，涵盖板尺、单位、标称/实际厚度、四分之一厚度、
浪费系数、木种、计价与 CSV）。五个工具共用同一套数学逻辑，因此这里算出的数字
与网站上的在线计算器完全一致。

## 许可

MIT。估算结果仅供规划参考 — 采购前请与您的木材经销商核实尺寸、锯缝与价格。
