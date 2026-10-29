# dsh-plugins

DeepSeek Harness（DSH）Web GUI 插件的 monorepo。每个 `packages/*` 是一个可独立安装的插件包，遵循 DSH 的「Node 半边 + `dsh.client` 浏览器半边」结构。

## 包

| 包 | 作用 |
|---|---|
| [`dsh-workspace-open-in-editor`](packages/workspace-open-in-editor/README.md) | 在侧栏每个**工作区行**的「…」与「+」之间加一个按钮，点击直接用 VS Code / Cursor 打开该项目目录 |

## 结构

```
dsh-plugins/
├── package.json              # 私有根包；esbuild 作为共享 devDependency
├── pnpm-workspace.yaml
└── packages/
    └── workspace-open-in-editor/
        ├── index.js          # Node 半边（cordis 插件入口）
        ├── src/client/       # 浏览器半边源码
        ├── scripts/build.mjs # esbuild → lib/client.js（包进 __ModuleLoader__ 信封）
        └── lib/client.js     # 构建产物（DSH 直接加载这个文件）
```

## 开发

```bash
pnpm install
pnpm build                 # 构建全部包
pnpm --filter dsh-workspace-open-in-editor watch   # 改源码即时重建
```

## 安装到某个 profile

以 `web` profile 为例（本机 DSH 装在 npx 缓存，命令里的 `dsh` 指 `@deepseek-ai/dsh` 的 `bin`）：

```bash
# 1) 把包作为依赖链进 profile
dsh plugin --profile web add link:$PWD/packages/workspace-open-in-editor

# 2) 让 profile 组合树挂载它（编辑 ~/.dsh/profiles/web/cordis.patch.yml）
- insert:
    - id: workspace-open-in-editor
      name: dsh-workspace-open-in-editor
```

`dsh-hmr` 会监视 profile 的 manifest 与 patch 文件，保存后自动重组，无需重启 `dsh web`；客户端插件也会经 HMR 通道进入已打开的页面。

卸载：删掉 `cordis.patch.yml` 里的 `insert` 条目，再执行
`dsh plugin --profile web remove dsh-workspace-open-in-editor`。

## 许可

MIT。
