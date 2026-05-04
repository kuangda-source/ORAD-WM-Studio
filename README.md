# OR-WM Studio v0.1

OR-WM Studio is a compact off-road world model demo platform. It turns the research idea into a runnable closed loop:

`data import -> scene browsing/annotation -> procedural scene generation -> BEV reconstruction -> world-model prediction/training -> toy RL replay -> vehicle configuration`

The first version is deliberately modest. It is not BeamNG, CARLA, NeRF, or a video-generation world model. It is a credible experiment workbench with mock-safe endpoints and lightweight algorithms that can be replaced module by module.

## Workspace Layout

```text
frontend/          React + Vite + TypeScript + Tailwind dashboard
backend/           FastAPI API, SQLite annotations/vehicles, local artifact service
ml/                Lightweight procedural generation, reconstruction, world model, RL helpers
data/demo/         Generated demo dataset in the target sequence format
artifacts/         Runtime outputs: generated scenes, reconstructions, checkpoints, replays
```

## Quick Start

Generate the built-in demo dataset:

```powershell
npm run generate:demo
```

Install backend dependencies:

```powershell
python -m pip install -r backend/requirements.txt
```

Recommended conda environment for ML/RL work:

```powershell
conda env create -f environment.yml
conda activate orwm311
```

If the environment already exists:

```powershell
conda env update -f environment.yml --prune
conda activate orwm311
```

On Windows, if several `conda run` commands are launched in parallel, conda may collide on a temporary activation file. Run them sequentially, or use the environment Python directly:

```powershell
C:\Users\kuangda\.conda\envs\orwm311\python.exe -m pytest backend/tests
```

Convenience scripts:

```powershell
.\scripts\test_backend_conda.ps1
.\scripts\dev_backend_conda.ps1
```

Install frontend dependencies:

```powershell
npm --prefix frontend install
```

Run the backend:

```powershell
npm run dev:backend
```

Run the frontend in another terminal:

```powershell
npm run dev:frontend
```

Open the Vite URL shown in the frontend terminal. The app expects the API on `http://localhost:8000`; Vite proxies `/api`, `/assets`, and `/artifacts` to that backend.

## Demo Acceptance Flow

1. Select the built-in demo sequence.
2. Browse front camera and BEV/occupancy panels.
3. Save terrain/weather/task annotations.
4. Generate a prompted off-road scene.
5. Run reconstruction to produce BEV, heightmap, traversability, and risk maps.
6. Start world-model training and request a prediction.
7. Run toy RL training and replay the generated policy trajectory.
8. Import or edit a vehicle JSON configuration.

## v0.2 Terrain Perception Path

The demo now includes a lightweight, dependency-light traversability model:

```text
front-view RGB + RUGD-style semantic mask
-> color prototype training
-> semantic group prediction
-> traversability map + risk map + overlay
```

Use the `Model Catalog` launch buttons `Train Terrain` and `Segment`, or call the API directly:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/traversability/train `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sequence_id":"seq_0001","source_format":"orwm-demo","max_samples":6}'
```

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/traversability/predict `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sequence_id":"seq_0001","frame_index":0}'
```

For a real RUGD-style import, point `dataset_root` at a folder containing RGB images and semantic label/mask images. The adapter first supports the OR-WM sequence layout, then searches common `image/frame/rgb` and `label/mask/annotation` folders recursively.

## v0.3 Public Data + Tiny Model Path

RUGD is the recommended first public dataset for this project because it focuses on semantic understanding of unstructured outdoor/off-road environments and provides 24 semantic categories with raw frames and annotations.

Import a downloaded RUGD-style folder through the UI by filling `RUGD root path` and clicking `Import RUGD`, or use the API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/public-datasets/rugd/import `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"root_path":"D:\\datasets\\RUGD","sequence_id":"rugd_mini","max_samples":24,"overwrite":true}'
```

The same operation is available as a local CLI:

```powershell
python ml/import_rugd_dataset.py D:\datasets\RUGD --sequence-id rugd_mini --max-samples 24
```

The terrain model is now a real lightweight NumPy model by default:

```text
RGB image + RUGD semantic mask
-> sample labeled pixels
-> train TinyMLP classifier
-> predict traversable / caution / obstacle / ignore
-> export semantic, traversability, risk, and overlay images
```

Train it through the `Model Catalog` launch action `Train Terrain`, or call:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/traversability/train `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sequence_id":"rugd_mini","source_format":"rugd-style","trainer":"tiny-mlp","max_samples":24,"epochs":12,"max_pixels":24000}'
```

## v0.4 Tiny Trajectory Prediction

The trajectory branch adds a small PyTorch GRU baseline for ego trajectory prediction:

```text
history poses: x, y, yaw, speed, pitch, roll
-> TinyTrajGRU encoder
-> future poses
-> trajectory image + ADE/FDE metrics
```

Train and predict through the `Model Catalog` launch actions `Train Traj` and `Predict Traj`, or call:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/trajectory/train `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sequence_id":"rugd_mini","model":"tiny-traj-gru","history":6,"horizon":8,"epochs":60,"augment":96}'
```

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/trajectory/predict `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sequence_id":"rugd_mini","history":6,"horizon":8,"frame_index":8}'
```

This is a compact GRU baseline using PyTorch. It is meant to verify the data and UI loop before replacing it with a stronger open-source trajectory framework such as Trajectron++/UniTraj-style models.

## v0.5 TartanDrive-Style Trajectory Import

The project now includes a TartanDrive-style mini importer for real off-road pose/action streams. It is intentionally conservative: it supports local CSV or flat mini subsets first, then normalizes them into the OR-WM sequence contract.

Expected source files:

```text
source_root/
  states.csv | poses.csv | odometry.csv | trajectory.csv
  actions.csv | controls.csv | commands.csv        optional but recommended
  images/ | rgb/ | camera/ | frames/ | front/      optional
```

The pose/state CSV should contain compatible columns such as `timestamp`, `x`, `y`, `z`, `yaw`, `pitch`, `roll`, and `speed`. The action CSV should contain compatible columns such as `timestamp`, `steer`, `throttle`, and `brake`. If images are absent, the importer creates deterministic preview frames so the dashboard can still browse the sequence.

Import through the UI by filling `TartanDrive mini root path` and clicking `Import TartanDrive`, or use the API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/public-datasets/tartandrive/import `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"root_path":"D:\\datasets\\TartanDriveMini","sequence_id":"tartandrive_mini","max_samples":64,"overwrite":true}'
```

The same operation is available as a local CLI:

```powershell
python ml/import_tartandrive_dataset.py D:\datasets\TartanDriveMini --sequence-id tartandrive_mini --max-samples 64
```

After import, open `GET /api/sequences/tartandrive_mini/quality` or select the sequence in the UI. If pose and action streams are present, `TinyTrajGRU` becomes `READY / real_data` in the Model Catalog. Action-conditioned BEV/world-model entries will remain blocked until a real BEV or occupancy stream is connected.

## Display Truthfulness Policy

The dashboard should not show hard-coded performance numbers as if they were experiment results.

- Connected metrics may show values only after the corresponding API has produced them.
- Unconnected, cosmetic, or placeholder metrics must show `NaN` or stay empty.
- Current `NaN` fields include algorithm leaderboard scores, live vehicle telemetry, LiDAR point count, battery, camera resolution, frame rate, and default event logs.
- Terrain perception metrics are considered connected only after the `Train Terrain` and `Segment` launch actions produce runs.
- Trajectory metrics are considered connected only after the `Train Traj` and `Predict Traj` launch actions produce runs.
- Toy RL metrics are considered toy-environment metrics only after `Run Policy`; they should not be reported as real off-road autonomy results.

API responses for model-like or metric-producing endpoints now include:

```json
{
  "provenance": {
    "source": "real_data | synthetic | mock | toy_env | placeholder",
    "label": "human-readable source summary",
    "notes": ["limitations and interpretation warnings"],
    "components": {"model": "TinyTrajGRU"},
    "data_sources": ["RUGD-style RGB frames"]
  }
}
```

Current source labels:

- `real_data`: derived from imported public dataset frames or labels, for example RUGD-style terrain segmentation.
- `synthetic`: generated by OR-WM procedural/demo scripts.
- `mock`: placeholder algorithm path that keeps the UI loop runnable.
- `toy_env`: toy RL environment output, useful for interface validation only.
- `placeholder`: required real stream is absent, for example trajectory prediction over RUGD placeholder poses.

## Run Registry

The first run registry is implemented in SQLite and exposed in the dashboard.

Recorded run types include:

- `scene_generation`
- `reconstruction`
- `world_model_train`
- `world_model_predict`
- `traversability_train`
- `traversability_predict`
- `trajectory_train`
- `trajectory_predict`
- `rl_train`

Each record stores:

```text
run_id, kind, name, status, sequence_id, source,
provenance, metrics, artifacts, config, created_at
```

API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/runs
Invoke-RestMethod "http://127.0.0.1:8000/api/runs?source=real_data"
Invoke-RestMethod http://127.0.0.1:8000/api/runs/{run_id}
```

Frontend:

- The right panel includes a `Runs` section.
- Source filters: `All`, `Real`, `Synth`, `Mock`, `Toy`, `Placeholder`.
- Every completed model-like action refreshes the list.
- Mock and placeholder results remain visible instead of being hidden, so the demo stays honest.
- Clicking a run opens a detail drawer with provenance notes, artifact previews, metric summary, raw metrics, config, and export bundle JSON.

Comparison API:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/runs/compare?kind=trajectory_predict"
Invoke-RestMethod "http://127.0.0.1:8000/api/runs/compare?source=real_data"
```

The comparison view extracts scalar metrics from compatible run records and shows them in the right panel. Nested curves and artifact blobs stay in the run detail drawer.

Export API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/runs/{run_id}/export
```

## Job Registry

Model Catalog launch actions and Scene Lab generation now go through a lightweight job layer:

```text
queued -> running -> completed/failed
```

API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/jobs
Invoke-RestMethod http://127.0.0.1:8000/api/jobs/{job_id}
```

Launch through the job API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/jobs/launch `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"label":"Reconstruct","endpoint":"/api/reconstruction/run","method":"POST","body":{"sequence_id":"seq_0001","method":"mock-bev","seed":17}}'
```

The current implementation executes synchronously while recording lifecycle state. That keeps the demo responsive and gives future long-running adapters a stable API shape. The frontend shows recent jobs and exposes editable JSON params for every Model Catalog launch action.

## Dataset Quality

Dataset quality checks are implemented as a lightweight adapter-facing contract. They do not make the dataset "good" or "bad"; they make missing streams explicit before a model consumes them.

API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/datasets/quality
Invoke-RestMethod http://127.0.0.1:8000/api/sequences/{sequence_id}/quality
```

Current checks:

- RGB frame count
- Semantic mask count and frame/mask alignment
- Occupancy/BEV map count
- Calibration file
- Pose stream, with RUGD imports marked as placeholder poses
- Control action stream
- LiDAR files
- Depth files
- Vehicle configuration link

Frontend:

- The dataset selector shows the current sequence quality card.
- Missing fields stay visible as `MISSING`; placeholder pose streams stay visible as `PLACEHOLDER`.
- This is the place to add future TartanDrive, RELLIS-3D, ORFD, and custom dataset checks.

## Dataset Source Cards

Source cards are implemented per sequence. This is intentional: the local demo root can contain mixed sources such as `seq_0001`, `rugd_mini`, and temporary test imports.

API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/datasets/source-cards
Invoke-RestMethod http://127.0.0.1:8000/api/sequences/{sequence_id}/source-card
```

Each card stores:

```text
sequence_id, dataset_name, source_type, license, citation, homepage,
importer, importer_version, source_root, target_root, manifest_path,
sensors, tags, known_limitations, recommended_next
```

Current behavior:

- `seq_0001` is reported as an OR-WM synthetic demo sequence.
- `rugd_*` sequences are reported as RUGD-style public semantic dataset imports.
- The RUGD importer now writes `source_card.json` for new imports.
- Existing imports without `source_card.json` are inferred from `metadata.json` and `manifest.json`.
- The frontend shows the current sequence source card above the quality card.

This becomes the standard adapter contract: every future importer should emit `metadata.json`, `manifest.json`, and `source_card.json`. The full importer contract lives in `docs/importer_contract.md`.

## Model Catalog

The dashboard includes a model capability matrix for the current sequence. This is the first step toward swapping datasets and models without rewriting the UI.

API:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/model-catalog?sequence_id=rugd_mini"
```

Each model entry declares:

```text
id, name, task, adapter, status, source,
required_streams, optional_streams, outputs,
blockers, recommended_next, launch_actions
```

Current entries:

- `terrain_tiny_mlp`
- `trajectory_tiny_gru`
- `mock_bev_reconstruction`
- `tiny_bev_world_model`
- `toy_rl_policy`
- `rellis_lidar_bev`
- `action_conditioned_bev_model`

Statuses:

- `ready`: required streams exist and are usable.
- `blocked`: required streams are missing.
- `placeholder`: the pipeline can run, but the relevant stream is synthetic/placeholder.
- `mock`: intentionally mock/toy path for UI or closed-loop smoke testing.

Frontend:

- The right panel now shows `Model Catalog` instead of a fake numeric leaderboard.
- Each row shows status, provenance source, required streams, and the first blocker.
- Each row can expose launch buttons generated from backend `launch_actions`.
- Launch actions go through `/api/jobs/launch` with backend-provided default request bodies, then refresh jobs, runs, quality, and catalog state.
- Each launch action exposes an editable JSON parameter form in the frontend.
- Legacy hard-coded model buttons are no longer the primary path; the left panel is kept for data import, annotation, and prompt scene generation.
- This makes it clear why RUGD can run terrain segmentation but not real trajectory or action-conditioned world modeling.

Launch action example:

```json
{
  "id": "train",
  "label": "Train Terrain",
  "endpoint": "/api/traversability/train",
  "method": "POST",
  "body": {
    "sequence_id": "rugd_mini",
    "source_format": "rugd-style",
    "trainer": "tiny-mlp"
  },
  "enabled": true,
  "disabled_reason": null
}
```

## Missing Function Roadmap

Phase 1: data truth and run registry

- Basic run registry, run detail drawer, run export JSON, dataset quality cards, and source cards are implemented.
- Turn source cards into a formal importer contract for TartanDrive, RELLIS-3D, ORFD, and custom datasets.
- Extend the run registry with richer artifact previews and experiment comparison.

Implementation steps:

1. Define importer interface docs: required files, optional sensor streams, source card schema, and quality checker hooks.
2. Add adapter-specific editable launch forms instead of fixed default bodies.
3. Add richer experiment comparison, including selected metric columns and chart previews.
4. Add status lifecycle support for long-running jobs: `queued -> running -> completed/failed`.

Phase 2: annotation and dataset management

- Add mask overlay review for RUGD-style labels.
- Add class remapping from RUGD/RELLIS/ORFD categories into `traversable / caution / obstacle / ignore`.
- Add train/val/test split management and per-sequence quality checks.
- Add annotation export/import so manual labels are reusable outside the UI.

Implementation steps:

1. Build a label-review view with RGB/mask/overlay opacity controls.
2. Store class remap presets per dataset.
3. Add split files under each sequence or dataset root.
4. Add quality checks for missing masks, frame-count mismatch, empty classes, and placeholder poses.

Phase 3: real reconstruction and BEV

- Replace mock reconstruction with adapters for real depth/LiDAR when the dataset provides them.
- Add RELLIS-3D support for camera/LiDAR/calibration driven BEV projection.
- Add confidence maps for BEV, heightmap, occupancy, and traversability.
- Keep procedural scene generation as a separate synthetic-data tool, not as real reconstruction.

Implementation steps:

1. Add RELLIS-3D importer for image, semantic labels, LiDAR, poses, and calibration.
2. Implement point-cloud-to-heightmap and point-cloud-to-occupancy projection.
3. Add BEV confidence output based on point density and calibration coverage.
4. Compare mock BEV, semantic BEV, and LiDAR BEV side by side in the UI.

Phase 4: real trajectory prediction data

- TartanDrive-style mini import is implemented for CSV/flat subsets because it provides off-road vehicle state and action information that RUGD does not.
- Replace placeholder straight-line RUGD poses with real pose/action streams when a TartanDrive-style sequence is selected.
- Evaluate ADE/FDE on held-out real trajectories and show the dataset split next to the score.
- Add baseline comparisons such as constant velocity, bicycle model, and TinyTrajGRU.

Implementation steps:

1. Extend the current TartanDrive-style importer from CSV/flat mini subsets to the full released format if needed.
2. Add IMU and wheel odometry normalization next to existing `poses.csv` plus `actions.csv`.
3. Add constant-velocity and bicycle-model baselines before stronger neural models.
4. Mark ADE/FDE as `real_data` only when ground-truth future poses come from a non-placeholder sequence.

Phase 5: stronger world model and policy loop

- Replace rule-based world-model prediction with a small learned BEV dynamics model trained on real or simulated sequences.
- Add action-conditioned prediction with steering/throttle/brake history.
- Add planner integration that consumes predicted risk/traversability rather than only drawing replay paths.
- Keep RL as toy until a valid simulator or logged-control offline evaluation setup is available.

Implementation steps:

1. Train a compact action-conditioned BEV predictor on generated scenes plus real BEV where available.
2. Add uncertainty calibration from prediction error on a validation split.
3. Feed predicted risk into a simple planner and report path cost provenance.
4. Upgrade RL only after a simulator or offline logged-control evaluator is connected.

## Dataset Format

```text
dataset_root/
  sequences/
    seq_0001/
      images/
      lidar/                 optional
      labels/
      occupancy/
      poses.csv
      calibration.json
      metadata.json
```

`metadata.json` contains at least:

```json
{
  "scene_id": "seq_0001",
  "terrain": "mountain",
  "weather": "sunny",
  "time_of_day": "day",
  "difficulty": "medium",
  "tags": ["trail", "rocks", "slope"],
  "has_lidar": false,
  "has_occupancy": true,
  "vehicle_id": "ugv_default"
}
```

## Usage and Optimization Notes

Detailed operating instructions live in `docs/usage.md`.

The implementation and optimization record lives in `docs/optimization_log.md`.

## Notes

- The backend runs on Python 3.13 for the API path, but serious PyTorch/RL work should use a separate Python 3.11 conda environment.
- PyTorch and PPO are optional. The included fallback world-model and RL implementations always produce deterministic demo artifacts.
- Public data adapters are intentionally documented as extension points for RELLIS-3D, RUGD, TartanDrive, and ORFD; large datasets are not vendored.
