# OR-WM Studio 使用说明

本文档记录当前 v0.1-v0.5 框架的标准使用方式。项目定位是“越野世界模型实验工作台”：先把数据、模型、指标、运行记录和 UI 闭环搭稳，后续替换更强的数据集和模型。

## 1. 环境准备

推荐使用 Python 3.11 conda 环境运行后端、测试和轻量模型：

```powershell
conda env create -f environment.yml
conda activate orwm311
```

如果环境已存在：

```powershell
conda env update -f environment.yml --prune
conda activate orwm311
```

安装前端依赖：

```powershell
npm --prefix frontend install
```

生成内置 demo 数据：

```powershell
npm run generate:demo
```

## 2. 启动服务

后端：

```powershell
npm run dev:backend
```

前端：

```powershell
npm run dev:frontend
```

默认地址：

```text
backend  http://127.0.0.1:8000
frontend http://127.0.0.1:5173
```

前端通过 Vite 代理访问 `/api`、`/assets` 和 `/artifacts`。

## 3. 页面结构

顶部导航现在分成四个工作区：

```text
Dashboard  主闭环视图：数据、模型目录、预测/重建/回放和可信指标
Scene Lab  合成场景视图：地形、土壤、天气、任务、Prompt 和后续视频生成入口
Dataset    数据导入视图：RUGD、TartanDrive-style、Source Card、Dataset Quality
Runs       实验记录视图：run 过滤、对比、artifact 预览和 export bundle
```

这个拆分是为了让主页第一眼更像“越野世界模型实验平台”，而不是 prompt 生成器。地形/天气/Prompt 这组控件只在 `Scene Lab` 出现，生成结果都按 synthetic provenance 记录，不和真实数据指标混在一起。

## 4. 推荐演示流程

1. 打开前端，选择 `seq_0001` 或导入后的真实数据 sequence。
2. 查看 Source Card 和 Dataset Quality，确认哪些流是 `OK`、`MISSING` 或 `PLACEHOLDER`。
3. 在 Dashboard 左侧保存当前 sequence 的标签摘要。
4. 切到 `Scene Lab`，用地形/土壤/天气/任务/Prompt 生成 synthetic BEV 或前视图。
5. 回到 Dashboard，在右侧 Model Catalog 查看当前 sequence 能跑哪些模型。
6. 展开 Model Catalog launch action 的 `params`，按需编辑 JSON 参数。
7. 对 RUGD-style sequence 运行 `Train Terrain` 和 `Segment`。
8. 对 TartanDrive-style sequence 运行 `Train Traj` 和 `Predict Traj`。
9. 打开 `Runs` 检查每个实验的 provenance、metrics、artifacts、job 状态和 export bundle。
10. 使用 Compare 面板比较同类 run 的标量指标。

## 5. Diffusion 视频生成入口

`Scene Lab` 中的 `Generate Video` 当前是 planned 状态，不会产生假视频或假 run。建议下一步新增：

```text
POST /api/video-generation/run
GET  /api/video-generation/{run_id}
```

第一版先接 image-to-video adapter，把当前 front-view frame 或 Scene Lab 生成的 keyframe 作为第一帧，生成 3-5 秒短视频。输出必须标记为 `synthetic`，并保存在 Run Registry 中。

## 6. Job Registry 和参数编辑

Model Catalog 和 Scene Lab 的启动动作现在先进入 Job Registry：

```text
queued -> running -> completed/failed
```

取消时会出现：

```text
queued -> cancelled
running -> cancel_requested -> completed/failed
```

说明：当前 adapters 大多还是单段同步函数，运行中任务可以记录 cancel request，但真正立即中断需要后续每个重型 adapter 增加 cooperative checkpoint。

API：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/jobs
Invoke-RestMethod http://127.0.0.1:8000/api/jobs/{job_id}
Invoke-RestMethod http://127.0.0.1:8000/api/jobs/{job_id}/cancel -Method Post
```

通过 job 统一启动动作：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/jobs/launch `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"label":"Reconstruct","endpoint":"/api/reconstruction/run","method":"POST","body":{"sequence_id":"seq_0001","method":"mock-bev","seed":17}}'
```

当前实现已经是轻量后台线程执行，`/api/jobs/launch` 会先返回 job，前端轮询直到完成。后续 diffusion、LiDAR 重建和更重的 PyTorch 训练可以继续复用同一个 job API。

前端：

- Dashboard 右侧显示 `Jobs` 面板。
- Runs 页面也显示最近 jobs。
- 每个 Model Catalog launch action 都有 `params` JSON 编辑器。
- JSON 非法时按钮禁用，不会提交半坏参数。
- Job 面板显示状态、进度条、最近日志和 Cancel 按钮。

## 7. 导入 RUGD-style 数据

RUGD-style 导入适合做地形语义和 traversability 训练。

UI：

```text
RUGD root path -> Import RUGD
```

API：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/public-datasets/rugd/import `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"root_path":"D:\\datasets\\RUGD","sequence_id":"rugd_mini","max_samples":24,"overwrite":true}'
```

CLI：

```powershell
python ml/import_rugd_dataset.py D:\datasets\RUGD --sequence-id rugd_mini --max-samples 24
```

导入后重点检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/sequences/rugd_mini/quality
Invoke-RestMethod "http://127.0.0.1:8000/api/model-catalog?sequence_id=rugd_mini"
```

预期：

- `images` 和 `labels` 为 `OK`
- terrain 模型为 `READY / real_data`
- 轨迹相关模型通常是 `PLACEHOLDER`，因为 RUGD adapter 没有真实轨迹

## 8. 导入 TartanDrive-style 数据

TartanDrive-style 导入适合做真实 ego pose/action 和轨迹预测。

支持的 mini-subset 形式：

```text
source_root/
  states.csv | poses.csv | odometry.csv | trajectory.csv
  actions.csv | controls.csv | commands.csv
  images/ | rgb/ | camera/ | frames/ | front/
```

UI：

```text
TartanDrive mini root path -> Import TartanDrive
```

API：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/public-datasets/tartandrive/import `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"root_path":"D:\\datasets\\TartanDriveMini","sequence_id":"tartandrive_mini","max_samples":64,"overwrite":true}'
```

CLI：

```powershell
python ml/import_tartandrive_dataset.py D:\datasets\TartanDriveMini --sequence-id tartandrive_mini --max-samples 64
```

导入后重点检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/sequences/tartandrive_mini/quality
Invoke-RestMethod "http://127.0.0.1:8000/api/model-catalog?sequence_id=tartandrive_mini"
```

预期：

- `poses` 和 `actions` 为 `OK`
- `TinyTrajGRU` 为 `READY / real_data`
- action-conditioned BEV/world model 仍可能因为缺少真实 occupancy/BEV 而保持 `BLOCKED`

## 9. 指标可信度规则

UI 不把 mock 数值伪装成真实结果：

- 没接上的指标显示 `NaN` 或为空。
- 每个模型/训练/预测接口返回 `provenance`。
- `real_data` 表示来自真实导入数据。
- `synthetic` 表示程序化生成或内置 demo。
- `mock` 表示为了跑通 UI 的占位算法。
- `toy_env` 表示 toy RL 环境，不代表真实越野自动驾驶性能。
- `placeholder` 表示数据流是占位，例如 RUGD 的伪 pose。

导师汇报时建议直接展示 Source Card、Dataset Quality 和 Run Drawer，这三处能说明“哪些是真的、哪些还只是框架占位”。

## 10. 常用验证命令

后端测试：

```powershell
C:\Users\kuangda\.conda\envs\orwm311\python.exe -m pytest backend/tests
```

前端构建：

```powershell
npm --prefix frontend run build
```

运行记录：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/runs
Invoke-RestMethod "http://127.0.0.1:8000/api/runs/compare?source=real_data"
Invoke-RestMethod http://127.0.0.1:8000/api/jobs
```

导出单个 run：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/runs/{run_id}/export
```

## 11. 后续接模型和数据的原则

优先新增 adapter，而不是改 UI：

1. 新 importer 写入 `metadata.json`、`manifest.json` 和 `source_card.json`。
2. Dataset Quality 先暴露缺失项。
3. Model Catalog 根据质量状态决定 `ready/blocked/placeholder/mock`。
4. Launch Action 调现有 API 或新增 API。
5. Run Registry 记录 provenance、metrics、artifacts 和 config。

这样后续切换 RELLIS-3D、ORFD、完整 TartanDrive 或更强轨迹模型时，前端和汇报逻辑不用大改。
