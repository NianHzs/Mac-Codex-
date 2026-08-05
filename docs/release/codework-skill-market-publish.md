# Skill 市场发布说明

运行 `powershell -ExecutionPolicy Bypass -File scripts/build-official-skills.ps1` 生成 `release-assets/codework-skills/`。

将其中全部 ZIP 和 `index.json` 上传到服务器容器 `xiaoshuai-lottery:/app/data/downloads/codework-skills/`，设置文件权限为 `0644`。先访问 `http://115.190.199.191:20080/downloads/codework-skills/index.json` 验证清单，再在客户端刷新 Skill 市场确认安装状态。
