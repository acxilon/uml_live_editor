# UML Live v1.0.0 Release Notes

**发布日期：** 2026-10-28  
**平台：** Windows 10 / 11（x64）  
**许可证：** MIT  
**版本：** 初始正式版

## 概览

UML Live 是一款面向 Windows 的 PlantUML / Mermaid 实时预览工具：左侧编辑代码，右侧即时出图，全程在本地用 JavaScript 渲染，**无需安装 Java、Graphviz 或任何渲染服务器**。

## 主要功能

- **双引擎实时渲染**：PlantUML 使用官方 `@plantuml/core` TeaVM JavaScript 引擎；Mermaid 12.2 本地渲染。
- **面向开发的编辑器**：CodeMirror 6、语法高亮、独立语言源码、12 个内置模板与源码自动保存。
- **灵活的预览控制**：滚轮缩放、拖拽平移、恢复 100% 并居中、双击适应窗口。
- **平面图表样式**：预览与导出不添加外阴影，并关闭 Mermaid 12 neo 样式内置的图形阴影。
- **全屏预览**：点击预览工具栏按钮或按 `F11` 收起代码区，让图表占满工作区；`Esc` 可退出。
- **导出与分享**：导出 SVG 矢量图、PNG（1× / 2× / 3×，默认纯白背景，可选透明背景），复制图片到 Windows 剪贴板，并支持复制 SVG 矢量源码。
- **文件与效率功能**：打开 / 保存源码、拖拽 `.puml` / `.mmd` 文件、窗口位置记忆、浅色 / 深色主题和完整快捷键面板。
- **系统托盘**：关闭窗口时弹出与应用同主题的确认对话框，询问“最小化到托盘（默认）/ 退出”；托盘菜单可重新打开窗口或退出应用。
- **本地与安全**：启用 `sandbox`、`contextIsolation` 和 CSP；源码仅保存在本机，不上传、无遥测。

## 安装

从 Release Assets 下载：

- `UML Live-Setup-1.0.0.exe` — NSIS 安装包，可选择安装目录并创建桌面 / 开始菜单快捷方式。
- `UML Live-Portable-1.0.0.exe` — 免安装便携版，双击运行。
- `SHA256SUMS.txt` — 安装包 SHA-256 校验值。

运行安装版或便携版都不需要 Java、Node.js 或其他渲染服务。

> 当前发行包未做代码签名。首次运行时 Windows SmartScreen 可能提示
> “Windows 已保护你的电脑”，选择“更多信息 → 仍要运行”即可。正式分发建议配置自己的代码签名证书。

## 已知限制

- PlantUML 标准库重型资源（C4、AWS、Azure、Kubernetes 等图标）未随包提供，本地 `!include` 文件也不支持；`!theme` 可正常使用。
- Mermaid 部分依赖远程 Iconify 图标的图形在离线环境下可能缺少图标。
- 仅提供 Windows x64 构建；预览使用系统字体，不内嵌字体文件。
- 超大图表导出 PNG 时会自动限制到约 80MP / 16384px 单边，防止 Canvas 崩溃。

## 升级说明

这是首个正式版本，无需从旧版本升级。

## 链接

- [项目说明](README.md)
- [第三方组件与许可证](THIRD-PARTY-NOTICES.md)

**Full Changelog:** Initial release.
