# macOS 包上传到 1Panel

macOS 的 x64 和 Apple Silicon 包在 macOS runner 生成后，使用 `scripts/publish-codework-macos-to-1panel.ps1` 上传到现有的公开下载目录：

`http://115.190.199.191:20080/downloads/`

脚本使用现有的 SSH 登录：`root@115.190.199.191:2222`，并将文件暂存到服务器后进行 SHA-256 校验。校验全部通过才会发布到下载目录；默认不覆盖已有文件。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-codework-macos-to-1panel.ps1 `
  -Version 1.3.100 `
  -X64Dmg dist/macos/Codework-AI客户端-1.3.100-macos-x64.dmg `
  -Arm64Dmg dist/macos/Codework-AI客户端-1.3.100-macos-arm64.dmg `
  -X64Zip dist/macos/Codework-AI客户端-1.3.100-macos-x64.zip `
  -Arm64Zip dist/macos/Codework-AI客户端-1.3.100-macos-arm64.zip
```

发布成功后会得到：

- `Codework-AI客户端-{version}-macos-x64.dmg`
- `Codework-AI客户端-{version}-macos-arm64.dmg`
- 可选的 x64 / arm64 ZIP
- `codework-ai-client-macos.json`，其中包含下载地址、文件大小和 SHA-256

只有在确实需要替换同版本文件时，才追加 `-ReplaceExisting`。

## 自动发布

正式 GitHub Release 的工作流已经包含可选的 1Panel 发布任务。给实际发布仓库添加名为 `CODEWORK_1PANEL_SSH_PRIVATE_KEY` 的 Actions Secret 后，Release 会自动把 macOS 两个架构的 DMG/ZIP 和清单发布到同一下载目录。没有设置该 Secret 时，该任务只会跳过，不会影响 GitHub Release。
