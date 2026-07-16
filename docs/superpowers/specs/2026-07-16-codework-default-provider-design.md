# Codework 默认供应商预设设计

新安装不再显示通用的「默认中转」。系统默认创建一个 ID 为 `codework-ai` 的 Codework AI 官方中转：纯 API、Responses API、`https://gptproxy.site/v1`，默认模型为 `gpt-5.6-sol`，模型列表包含 sol、terra、luna 和 gpt-5.5。

这仅改变缺少设置时的出厂默认值。已保存的供应商列表和活动供应商 ID 不迁移、不覆盖；老用户原来的 `default` 供应商仍按原配置工作。

验证覆盖 Rust 默认设置、管理器初始设置和源码回归测试；前端 TypeScript 与相关 Rust 测试必须通过。
