from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class DatasetImportRequest(BaseModel):
    name: str = "demo"
    root_path: str | None = None


class DatasetSummary(BaseModel):
    id: str
    name: str
    root: str
    sequence_count: int
    terrain_types: list[str]
    sequences: list[str]


class SequenceMetadata(BaseModel):
    scene_id: str
    terrain: str
    weather: str
    time_of_day: str
    difficulty: str
    tags: list[str]
    has_lidar: bool
    has_occupancy: bool
    vehicle_id: str


class SequenceDetail(BaseModel):
    id: str
    metadata: SequenceMetadata
    frames: list[str]
    occupancy: list[str]
    labels: list[str] = Field(default_factory=list)
    poses_url: str
    calibration_url: str


class Provenance(BaseModel):
    source: Literal["real_data", "synthetic", "mock", "toy_env", "placeholder"]
    label: str
    notes: list[str] = Field(default_factory=list)
    components: dict[str, str] = Field(default_factory=dict)
    data_sources: list[str] = Field(default_factory=list)


class RunRecord(BaseModel):
    run_id: str
    kind: str
    name: str
    status: Literal["completed", "failed", "running"] = "completed"
    sequence_id: str | None = None
    source: Literal["real_data", "synthetic", "mock", "toy_env", "placeholder"]
    provenance: Provenance
    metrics: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, str] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class RunExportResponse(BaseModel):
    run: RunRecord
    bundle: dict[str, Any]


class RunComparisonRow(BaseModel):
    run_id: str
    name: str
    kind: str
    source: Literal["real_data", "synthetic", "mock", "toy_env", "placeholder"]
    created_at: str
    metrics: dict[str, float | str | int | None] = Field(default_factory=dict)


class RunComparisonResponse(BaseModel):
    kind: str | None = None
    source: str | None = None
    metric_keys: list[str] = Field(default_factory=list)
    rows: list[RunComparisonRow] = Field(default_factory=list)


class JobRecord(BaseModel):
    job_id: str
    kind: str
    label: str
    endpoint: str
    method: Literal["POST", "GET"] = "POST"
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    sequence_id: str | None = None
    source: Literal["real_data", "synthetic", "mock", "toy_env", "placeholder"] | None = None
    run_id: str | None = None
    request: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str
    updated_at: str


class JobLaunchRequest(BaseModel):
    label: str
    endpoint: str
    method: Literal["POST", "GET"] = "POST"
    body: dict[str, Any] = Field(default_factory=dict)


class JobLaunchResponse(BaseModel):
    job: JobRecord
    result: dict[str, Any] | None = None


class QualityItem(BaseModel):
    key: str
    label: str
    status: Literal["ok", "warning", "missing", "placeholder"]
    value: str
    required_for: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SequenceQuality(BaseModel):
    sequence_id: str
    overall_status: Literal["ok", "warning", "missing", "placeholder"]
    summary: str
    items: list[QualityItem]


class DatasetSourceCard(BaseModel):
    sequence_id: str
    dataset_name: str
    source_type: Literal["public", "synthetic", "custom", "unknown"]
    license: str
    citation: str
    homepage: str | None = None
    importer: str
    importer_version: str
    source_root: str | None = None
    target_root: str
    manifest_path: str | None = None
    sensors: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    known_limitations: list[str] = Field(default_factory=list)
    recommended_next: list[str] = Field(default_factory=list)


class ModelLaunchAction(BaseModel):
    id: str
    label: str
    endpoint: str | None = None
    method: Literal["POST", "GET"] = "POST"
    body: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    disabled_reason: str | None = None


class ModelCatalogItem(BaseModel):
    id: str
    name: str
    task: str
    adapter: str
    status: Literal["ready", "blocked", "placeholder", "mock"]
    source: Literal["real_data", "synthetic", "mock", "toy_env", "placeholder"]
    required_streams: list[str] = Field(default_factory=list)
    optional_streams: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    recommended_next: list[str] = Field(default_factory=list)
    launch_actions: list[ModelLaunchAction] = Field(default_factory=list)


class AnnotationRequest(BaseModel):
    sequence_id: str
    frame_id: str | None = None
    terrain: str
    weather: str
    task: str
    labels: list[str] = Field(default_factory=list)
    note: str = ""


class AnnotationRecord(AnnotationRequest):
    id: int
    created_at: str


class SceneGenerateRequest(BaseModel):
    terrain: str = "mountain"
    weather: str = "sunny"
    task: str = "trail"
    prompt: str = "generate a rocky mountain trail"
    seed: int = 42
    obstacle_density: float = Field(default=0.35, ge=0, le=1)
    slope: float = Field(default=0.45, ge=0, le=1)


class SceneGenerateResponse(BaseModel):
    scene_id: str
    seed: int
    terrain: str
    weather: str
    task: str
    prompt: str
    assets: dict[str, str]
    metrics: dict[str, float]
    provenance: Provenance


class ReconstructionRequest(BaseModel):
    sequence_id: str
    method: Literal["mock-bev", "lidar-placeholder", "depth-placeholder"] = "mock-bev"
    seed: int = 7


class ReconstructionResponse(BaseModel):
    run_id: str
    sequence_id: str
    method: str
    assets: dict[str, str]
    metrics: dict[str, float]
    provenance: Provenance


class WorldModelTrainRequest(BaseModel):
    sequence_id: str = "seq_0001"
    model: Literal["rule-based", "tiny-bev-cnn"] = "tiny-bev-cnn"
    epochs: int = Field(default=6, ge=1, le=50)
    seed: int = 13


class WorldModelTrainResponse(BaseModel):
    run_id: str
    model: str
    checkpoint_url: str
    metrics: list[dict[str, float]]
    backend: str
    provenance: Provenance


class WorldModelPredictRequest(BaseModel):
    sequence_id: str = "seq_0001"
    checkpoint_id: str | None = None
    action: dict[str, float] = Field(default_factory=lambda: {"steer": -0.16, "throttle": 0.45, "brake": 0.0})
    horizon: int = Field(default=5, ge=1, le=20)
    seed: int = 21


class WorldModelPredictResponse(BaseModel):
    prediction_id: str
    assets: dict[str, str]
    ego_motion: list[dict[str, float]]
    uncertainty: float
    provenance: Provenance


class RlTrainRequest(BaseModel):
    scene_id: str | None = None
    algorithm: Literal["ppo-fallback", "deterministic-policy"] = "ppo-fallback"
    episodes: int = Field(default=8, ge=1, le=100)
    seed: int = 31


class RlTrainResponse(BaseModel):
    run_id: str
    algorithm: str
    metrics: dict[str, float]
    replay_url: str
    training_curve: list[dict[str, float]]
    provenance: Provenance


class ReplayResponse(BaseModel):
    run_id: str
    states: list[dict[str, float]]
    events: list[dict[str, Any]]
    metrics: dict[str, float]
    provenance: Provenance


class Vehicle(BaseModel):
    id: str
    name: str
    wheelbase: float
    width: float
    length: float
    max_steer: float
    max_speed: float
    mass: float
    tire_type: str


class EvaluationResponse(BaseModel):
    run_id: str
    success_rate: float | None
    collision_rate: float | None
    path_length_m: float | None
    terrain_risk: float | None
    uncertainty: float | None
    events: list[dict[str, Any]]
    provenance: Provenance


class TraversabilityTrainRequest(BaseModel):
    sequence_id: str = "seq_0001"
    dataset_root: str | None = None
    source_format: Literal["orwm-demo", "rugd-style"] = "orwm-demo"
    trainer: Literal["tiny-mlp", "color-prototype"] = "tiny-mlp"
    max_samples: int = Field(default=32, ge=1, le=500)
    max_pixels: int = Field(default=24000, ge=512, le=300000)
    epochs: int = Field(default=12, ge=1, le=200)
    learning_rate: float = Field(default=0.08, gt=0, le=1)


class TraversabilityTrainResponse(BaseModel):
    run_id: str
    model: str
    source_format: str
    backend: str = "numpy"
    model_url: str
    sample_count: int
    prototypes: dict[str, list[float]]
    groups: dict[str, list[str]]
    metrics: dict[str, float]
    training_curve: list[dict[str, float]] = Field(default_factory=list)
    provenance: Provenance


class TraversabilityPredictRequest(BaseModel):
    sequence_id: str = "seq_0001"
    model_id: str | None = None
    frame_index: int = Field(default=0, ge=0)


class TraversabilityPredictResponse(BaseModel):
    prediction_id: str
    model_id: str
    frame_url: str
    assets: dict[str, str]
    metrics: dict[str, float]
    counts: dict[str, int]
    provenance: Provenance


class TrajectoryTrainRequest(BaseModel):
    sequence_id: str = "rugd_mini"
    model: Literal["tiny-traj-gru"] = "tiny-traj-gru"
    history: int = Field(default=6, ge=2, le=30)
    horizon: int = Field(default=8, ge=1, le=30)
    epochs: int = Field(default=60, ge=1, le=300)
    hidden_dim: int = Field(default=48, ge=8, le=256)
    augment: int = Field(default=96, ge=0, le=1000)
    seed: int = 23


class TrajectoryTrainResponse(BaseModel):
    run_id: str
    model: str
    backend: str
    checkpoint_url: str
    history: int
    horizon: int
    sample_count: int
    training_curve: list[dict[str, float]]
    provenance: Provenance


class TrajectoryPredictRequest(BaseModel):
    sequence_id: str = "rugd_mini"
    model_id: str | None = None
    history: int | None = Field(default=None, ge=2, le=30)
    horizon: int | None = Field(default=None, ge=1, le=30)
    frame_index: int | None = Field(default=None, ge=0)


class TrajectoryPredictResponse(BaseModel):
    prediction_id: str
    model_id: str
    assets: dict[str, str]
    observed: list[dict[str, float]]
    predicted: list[dict[str, float]]
    ground_truth: list[dict[str, float]]
    metrics: dict[str, float]
    provenance: Provenance


class RUGDImportRequest(BaseModel):
    root_path: str
    sequence_id: str = "rugd_mini"
    max_samples: int = Field(default=24, ge=1, le=1000)
    overwrite: bool = True


class RUGDImportResponse(BaseModel):
    sequence_id: str
    source_root: str
    target_root: str
    imported_frames: int
    manifest: str
    dataset: DatasetSummary


class TartanDriveImportRequest(BaseModel):
    root_path: str
    sequence_id: str = "tartandrive_mini"
    max_samples: int = Field(default=64, ge=2, le=5000)
    overwrite: bool = True


class TartanDriveImportResponse(BaseModel):
    sequence_id: str
    source_root: str
    target_root: str
    imported_frames: int
    manifest: str
    dataset: DatasetSummary
