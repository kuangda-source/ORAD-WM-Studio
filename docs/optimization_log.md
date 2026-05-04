# OR-WM Studio 优化记录

本记录用于后续汇报和迭代复盘：重点不是说“已经做成完整越野世界模型”，而是说明框架怎样一步步从 demo 壳子变成可替换数据和模型的实验工作台。

## 2026-05-01：v0.1 闭环工作台

完成内容：

- 建立 `frontend/ backend/ ml/ data/demo/ artifacts/` monorepo。
- 前端采用左侧控制、中间多视图、右侧指标/算法、底部状态栏的科研 dashboard。
- 后端采用 FastAPI + SQLite + 本地 artifact 存储。
- 内置 demo sequence，支持前视图、metadata、标注、场景生成、BEV 重建、world model mock 训练/预测、toy RL 回放、车辆 JSON 配置。

优化点：

- 先保证导师能看到“数据导入 -> 标注 -> 生成 -> 重建 -> 预测/训练 -> 回放 -> 指标”的闭环。
- 不把第一版定位成 BeamNG/CARLA 或完整游戏引擎，避免目标失真。

## 2026-05-02：可信显示和 provenance

完成内容：

- UI 中未接入的指标统一显示 `NaN` 或空状态。
- 模型类 API 增加 `provenance` 字段。
- 区分 `real_data`、`synthetic`、`mock`、`toy_env`、`placeholder`。

优化点：

- 避免 dashboard 中的假 leaderboard 误导导师或后续读者。
- 每个结果都能说明来源和局限。

## 2026-05-02：RUGD-style 公开数据接入

完成内容：

- 增加 RUGD-style importer。
- 支持从 RGB frame 和 semantic mask 导入到 OR-WM sequence。
- 增加轻量 TinyMLP terrain/traversability 模型。
- 训练和预测输出 semantic、traversability、risk、overlay artifacts。

优化点：

- 真实公开数据先接语义/可通行性任务，避免用没有轨迹的 RUGD 硬做轨迹预测。
- RUGD 导入的 pose 明确标记为 placeholder。

## 2026-05-03：Run Registry 和对比

完成内容：

- 增加 SQLite run registry。
- 记录 run id、kind、status、sequence、source、provenance、metrics、artifacts、config、created_at。
- 增加 `/api/runs`、`/api/runs/{run_id}`、`/api/runs/{run_id}/export`。
- 增加 `/api/runs/compare`，前端可按 kind/source 比较标量指标。
- Run Drawer 支持 artifact 预览、metric summary、raw metrics、config 和 export bundle。

优化点：

- 把一次 demo 点击变成可追溯 experiment record。
- 后续接强模型时不需要重写实验记录逻辑。

## 2026-05-03：Dataset Quality 和 Source Card

完成内容：

- 增加 dataset quality API。
- 检查 images、labels、occupancy、calibration、poses、actions、lidar、depth、vehicle link。
- 增加 sequence source card API。
- 为 importer 定义 `metadata.json + manifest.json + source_card.json` 合同。
- 编写 `docs/importer_contract.md`。

优化点：

- 缺什么数据在 UI 里直接暴露，避免模型被错误启动。
- 每个 sequence 都能说明来自 demo、public dataset、synthetic 还是临时导入。

## 2026-05-03：Model Catalog

完成内容：

- 增加 `/api/model-catalog?sequence_id=...`。
- 每个模型声明 task、adapter、status、source、required streams、optional streams、outputs、blockers、recommended next、launch actions。
- 前端移除假算法分数的主导地位，改为 Model Catalog capability matrix。
- Launch Action 从后端下发默认 API body，前端直接执行并刷新 runs、quality、catalog。

优化点：

- UI 不再硬编码“按钮就是模型”，而是由数据可用性决定能跑什么。
- 后续接入新模型时只需新增 catalog entry 和 endpoint。

## 2026-05-04：TartanDrive-style 轨迹/动作接入

完成内容：

- 增加 `ml/tartandrive_adapter.py`。
- 增加 `ml/import_tartandrive_dataset.py` CLI。
- 增加 `POST /api/public-datasets/tartandrive/import`。
- 支持 CSV/flat mini subset：
  - `states.csv` / `poses.csv` / `odometry.csv` / `trajectory.csv`
  - `actions.csv` / `controls.csv` / `commands.csv`
  - optional image folders
- 导入时写入 `poses.csv`、`actions.csv`、`metadata.json`、`manifest.json`、`source_card.json`。
- 如果缺 images，生成 deterministic preview frames，保证 dashboard 能浏览。
- API 测试覆盖导入、quality、model catalog readiness。

优化点：

- 轨迹预测不再依赖 RUGD placeholder pose。
- 只要用户导入含 pose/action 的 TartanDrive-style mini subset，`TinyTrajGRU` 会变成 `READY / real_data`。
- action-conditioned BEV/world model 仍保持 blocked，直到真实 BEV/occupancy 接上。

## 2026-05-04：Scene Lab 页面拆分

完成内容：

- 顶部导航增加 `Dashboard / Scene Lab / Dataset / Runs`。
- Dashboard 左侧从场景生成按钮改成数据工作区和当前标签摘要。
- 地形、土壤、天气、任务、Prompt 迁移到独立 `Scene Lab`。
- `Scene Lab` 增加 `Generate Image`、`Generate BEV` 和 `Generate Video` planned 入口。
- Dataset 页面集中放置 RUGD、TartanDrive-style 导入、Source Card 和 Dataset Quality。
- Runs 页面集中放置 run registry 和 compare 面板。
- Prompt 与结构化天气存在冲突时，在 Scene Lab 显示 warning，并保持 synthetic provenance。

优化点：

- 主页第一眼更像越野世界模型实验平台，不再像单纯 prompt 生成器。
- 视频 diffusion 被放在合成数据支路，不污染真实数据评估和模型指标。
- 后续接 `POST /api/video-generation/run` 时，不需要再次重构主页信息架构。

## 当前状态

已打通：

- demo 数据闭环
- RUGD-style 语义/可通行性
- TartanDrive-style pose/action 导入
- TinyMLP terrain baseline
- TinyTrajGRU trajectory baseline
- mock BEV reconstruction
- tiny BEV world model baseline
- toy RL replay
- vehicle JSON CRUD
- run registry / compare / export
- source cards / quality cards / model catalog
- Scene Lab 独立合成数据工作区

仍是占位或待增强：

- diffusion / image-to-video generation adapter
- 真实 LiDAR/depth BEV 重建
- 完整 TartanDrive 原始格式解析
- RELLIS-3D LiDAR/camera/calibration adapter
- ORFD traversability adapter
- action-conditioned learned BEV dynamics
- 真实 simulator 或 offline control evaluator
- 长任务队列状态 `queued -> running -> completed/failed`
- 前端专门的标注 mask review 页面

## 下一阶段建议

优先级 1：完善 TartanDrive

- 支持完整原始发布格式转换。
- 增加 constant-velocity 和 bicycle-model baseline。
- 在 trajectory run 中记录 train/val/test split。

优先级 2：接 RELLIS-3D

- 导入 camera、semantic label、LiDAR、pose、calibration。
- 做 point-cloud-to-heightmap 和 point-cloud-to-occupancy。
- 让 BEV reconstruction 从 `mock` 升级为 `real_data`。

优先级 3：增强 UI 标注

- RGB/mask/overlay 三层查看。
- 类别 remap preset。
- 标注导出和 split 管理。

优先级 4：world model 替换

- 先训练 action-conditioned BEV predictor。
- 再把 predicted risk 接到 planner。
- RL 继续保持 toy，直到有 simulator 或真实 offline evaluator。
