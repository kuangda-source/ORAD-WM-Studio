from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from ..schemas import (
    JobLaunchRequest,
    JobLaunchResponse,
    JobRecord,
    ReconstructionRequest,
    RlTrainRequest,
    SceneGenerateRequest,
    TrajectoryPredictRequest,
    TrajectoryTrainRequest,
    TraversabilityPredictRequest,
    TraversabilityTrainRequest,
    WorldModelPredictRequest,
    WorldModelTrainRequest,
)
from ..storage import get_job as storage_get_job
from ..storage import list_jobs as storage_list_jobs
from ..storage import put_job, utc_now
from .reconstruction import run_reconstruction
from .rl import train_rl
from .scenes import generate_scene
from .trajectory import predict_trajectory, train_trajectory
from .traversability import predict_sequence_traversability, train_traversability
from .world_model import predict_world_model, train_world_model


JobHandler = Callable[[dict[str, Any]], BaseModel]


def _call_scene(body: dict[str, Any]) -> BaseModel:
    return generate_scene(SceneGenerateRequest.model_validate(body))


def _call_reconstruction(body: dict[str, Any]) -> BaseModel:
    return run_reconstruction(ReconstructionRequest.model_validate(body))


def _call_world_model_train(body: dict[str, Any]) -> BaseModel:
    return train_world_model(WorldModelTrainRequest.model_validate(body))


def _call_world_model_predict(body: dict[str, Any]) -> BaseModel:
    return predict_world_model(WorldModelPredictRequest.model_validate(body))


def _call_traversability_train(body: dict[str, Any]) -> BaseModel:
    return train_traversability(TraversabilityTrainRequest.model_validate(body))


def _call_traversability_predict(body: dict[str, Any]) -> BaseModel:
    return predict_sequence_traversability(TraversabilityPredictRequest.model_validate(body))


def _call_trajectory_train(body: dict[str, Any]) -> BaseModel:
    return train_trajectory(TrajectoryTrainRequest.model_validate(body))


def _call_trajectory_predict(body: dict[str, Any]) -> BaseModel:
    return predict_trajectory(TrajectoryPredictRequest.model_validate(body))


def _call_rl_train(body: dict[str, Any]) -> BaseModel:
    return train_rl(RlTrainRequest.model_validate(body))


JOB_HANDLERS: dict[str, tuple[str, JobHandler]] = {
    "/api/scenes/generate": ("scene_generation", _call_scene),
    "/api/reconstruction/run": ("reconstruction", _call_reconstruction),
    "/api/world-model/train": ("world_model_train", _call_world_model_train),
    "/api/world-model/predict": ("world_model_predict", _call_world_model_predict),
    "/api/traversability/train": ("traversability_train", _call_traversability_train),
    "/api/traversability/predict": ("traversability_predict", _call_traversability_predict),
    "/api/trajectory/train": ("trajectory_train", _call_trajectory_train),
    "/api/trajectory/predict": ("trajectory_predict", _call_trajectory_predict),
    "/api/rl/train": ("rl_train", _call_rl_train),
}

JOB_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="orwm-job")


def _job_id(label: str, endpoint: str, body: dict[str, Any]) -> str:
    now = utc_now()
    digest = hashlib.sha1(json.dumps({"label": label, "endpoint": endpoint, "body": body, "now": now}, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return f"job_{digest}"


def _extract_sequence_id(body: dict[str, Any], result: dict[str, Any] | None = None) -> str | None:
    if isinstance(body.get("sequence_id"), str):
        return body["sequence_id"]
    if result and isinstance(result.get("sequence_id"), str):
        return result["sequence_id"]
    return None


def _extract_run_id(result: dict[str, Any]) -> str | None:
    for key in ("run_id", "scene_id", "prediction_id"):
        value = result.get(key)
        if isinstance(value, str):
            return value
    return None


def _extract_source(result: dict[str, Any]) -> str | None:
    provenance = result.get("provenance")
    if isinstance(provenance, dict) and isinstance(provenance.get("source"), str):
        return provenance["source"]
    return None


def _update_job(job: JobRecord, **updates: Any) -> JobRecord:
    payload = job.model_dump()
    payload.update(updates)
    payload["updated_at"] = utc_now()
    updated = JobRecord(**payload)
    return put_job(updated)


def _append_log(job: JobRecord, message: str, **updates: Any) -> JobRecord:
    logs = [*job.logs, f"{utc_now()} {message}"]
    return _update_job(job, logs=logs[-80:], **updates)


def _execute_job(job_id: str) -> JobRecord:
    job = get_job_record(job_id)
    if job.status == "cancelled":
        return job
    mapped = JOB_HANDLERS.get(job.endpoint)
    if mapped is None:
        return _append_log(job, f"Endpoint is not job-launchable: {job.endpoint}", status="failed", progress=1.0, error=f"Endpoint is not job-launchable: {job.endpoint}")
    _, handler = mapped
    job = _append_log(job, "Job started.", status="running", progress=0.1)
    try:
        time.sleep(0.05)
        latest = get_job_record(job.job_id)
        if latest.status == "cancelled":
            return latest
        result_model = handler(job.request)
        result = result_model.model_dump()
        latest = get_job_record(job.job_id)
        logs = latest.logs
        if latest.status == "cancel_requested":
            logs = [*logs, f"{utc_now()} Cancel was requested after this adapter started; completed because no cooperative checkpoint stopped it."]
        completed = _update_job(
            latest,
            status="completed",
            progress=1.0,
            result=result,
            run_id=_extract_run_id(result),
            sequence_id=_extract_sequence_id(latest.request, result),
            source=_extract_source(result),
            logs=[*logs, f"{utc_now()} Job completed."][-80:],
        )
        return completed
    except Exception as exc:
        latest = get_job_record(job.job_id)
        return _append_log(latest, f"Job failed: {exc}", status="failed", progress=1.0, error=str(exc))


def launch_job(payload: JobLaunchRequest) -> JobLaunchResponse:
    if payload.method != "POST":
        raise HTTPException(status_code=400, detail="Job launch currently supports POST actions only.")
    mapped = JOB_HANDLERS.get(payload.endpoint)
    if mapped is None:
        raise HTTPException(status_code=400, detail=f"Endpoint is not job-launchable: {payload.endpoint}")
    kind, handler = mapped
    now = utc_now()
    job = JobRecord(
        job_id=_job_id(payload.label, payload.endpoint, payload.body),
        kind=kind,
        label=payload.label,
        endpoint=payload.endpoint,
        method=payload.method,
        status="queued",
        progress=0.0,
        sequence_id=_extract_sequence_id(payload.body),
        request=payload.body,
        logs=[f"{now} Job queued."],
        created_at=now,
        updated_at=now,
    )
    job = put_job(job)
    if payload.run_async:
        JOB_EXECUTOR.submit(_execute_job, job.job_id)
        return JobLaunchResponse(job=job, result=None)
    completed = _execute_job(job.job_id)
    if completed.status == "failed":
        raise HTTPException(status_code=400, detail={"job": completed.model_dump(), "error": completed.error})
    return JobLaunchResponse(job=completed, result=completed.result)


def list_job_records(status: str | None = None, kind: str | None = None, limit: int = 50) -> list[JobRecord]:
    return storage_list_jobs(status=status, kind=kind, limit=limit)


def get_job_record(job_id: str) -> JobRecord:
    job = storage_get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


def cancel_job_record(job_id: str) -> JobRecord:
    job = get_job_record(job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        return _append_log(job, f"Cancel ignored because job is already {job.status}.")
    if job.status == "queued":
        return _append_log(job, "Job cancelled before execution.", status="cancelled", progress=1.0)
    return _append_log(job, "Cancel requested. Running adapters stop only at cooperative checkpoints.", status="cancel_requested")
