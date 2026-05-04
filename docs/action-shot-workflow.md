# Action Shot Workflow | 动作照工作流

This workflow is the fast preview path for lineup portraits. It generates photorealistic action-shot cutouts on a flat chroma-key background, then converts that key color to alpha for transparent PNG assets. It does **not** fetch licensed editorial photos by itself. / 这套流程是阵容头像的快速预览方案：先生成带纯色抠图底的拟真动作照，再把底色转换为透明 PNG。它**不会**自行抓取有授权的真实编辑照片。

## Goal | 目标

- Quickly test whether action-shot cutouts feel better than static media-day headshots. / 快速验证动作照 cutout 是否比静态定妆照更适合当前 UI。
- Keep the output format consistent with the existing frontend asset path strategy. / 保持输出格式与现有前端资源路径一致。
- Avoid one-by-one manual background removal work. / 避免逐张手工抠图。

## Outputs | 输出

- Final transparent assets go to `frontend/public/nba/action-shots/`. / 最终透明资源输出到 `frontend/public/nba/action-shots/`。
- Copied chroma-key source files go to `tmp/action-shots/raw/`. / 复制后的纯色底原图放在 `tmp/action-shots/raw/`。

## Workflow | 流程

1. Prepare a manifest JSON based on `docs/action-shot-manifest.sample.json`. / 基于 `docs/action-shot-manifest.sample.json` 准备一个 manifest JSON。
2. Print one prompt per player:

```powershell
C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\action_shot_pipeline.py print-prompts --manifest docs\action-shot-manifest.sample.json
```

3. Use each printed prompt with the built-in image generation tool so the background is a totally flat `#00ff00` chroma key. / 用每条 prompt 调内建图像生成工具，确保背景是完全纯色的 `#00ff00` 抠图底。
4. Fill each player's `source` field with the generated image path. / 把每位球员的 `source` 字段填成生成图片路径。
5. Batch-convert those source images to transparent PNGs:

```powershell
C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\action_shot_pipeline.py postprocess --manifest tmp\action-shots\trial-manifest.json --python-exe C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

## Notes | 说明

- The current helper tries to remove only the flat chroma-key background. Subject edges remain best when the generation prompt forbids shadows, floors, gradients, and crowd detail. / 当前 helper 只针对纯色抠图底做透明化，因此 prompt 里越明确禁止阴影、地面、渐变和观众席，主体边缘就越干净。
- If you later decide to switch from generated action shots to real licensed game photos, keep the same manifest/output structure and only replace the image-source layer. / 如果后续决定从生成式动作照切换到真实授权赛场照片，可以保留同样的 manifest/输出结构，只替换图源层。
- `tmp/` is gitignored on purpose so raw intermediate files do not pollute the repo. / `tmp/` 已加入 gitignore，避免中间原图污染仓库。
