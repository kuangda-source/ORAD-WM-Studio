from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from ml.scene_generation import generate_scene_assets


def test_dataset_sequence_and_annotation_flow() -> None:
    with TestClient(app) as client:
        datasets = client.get("/api/datasets")
        assert datasets.status_code == 200
        payload = datasets.json()
        assert payload[0]["sequence_count"] >= 1
        seq_id = payload[0]["sequences"][0]

        sequence = client.get(f"/api/sequences/{seq_id}")
        assert sequence.status_code == 200
        detail = sequence.json()
        assert detail["metadata"]["scene_id"] == seq_id
        assert detail["frames"]
        assert detail["occupancy"]
        assert detail["labels"]

        quality = client.get(f"/api/sequences/{seq_id}/quality")
        assert quality.status_code == 200
        quality_payload = quality.json()
        assert quality_payload["sequence_id"] == seq_id
        assert any(item["key"] == "images" for item in quality_payload["items"])

        dataset_quality = client.get("/api/datasets/quality")
        assert dataset_quality.status_code == 200
        assert any(item["sequence_id"] == seq_id for item in dataset_quality.json())

        source_card = client.get(f"/api/sequences/{seq_id}/source-card")
        assert source_card.status_code == 200
        assert source_card.json()["sequence_id"] == seq_id
        assert source_card.json()["importer_version"]

        source_cards = client.get("/api/datasets/source-cards")
        assert source_cards.status_code == 200
        assert any(item["sequence_id"] == seq_id for item in source_cards.json())

        catalog = client.get(f"/api/model-catalog?sequence_id={seq_id}")
        assert catalog.status_code == 200
        catalog_payload = catalog.json()
        assert any(item["id"] == "terrain_tiny_mlp" for item in catalog_payload)
        assert all("status" in item for item in catalog_payload)
        terrain_item = next(item for item in catalog_payload if item["id"] == "terrain_tiny_mlp")
        assert terrain_item["launch_actions"]
        assert terrain_item["launch_actions"][0]["endpoint"].startswith("/api/")

        annotation = client.post(
            "/api/annotations",
            json={
                "sequence_id": seq_id,
                "frame_id": "frame_0000",
                "terrain": "mountain",
                "weather": "sunny",
                "task": "trail",
                "labels": ["gravel", "rocks"],
                "note": "pytest annotation",
            },
        )
        assert annotation.status_code == 200
        assert annotation.json()["id"] > 0


def test_generation_reconstruction_training_and_replay() -> None:
    with TestClient(app) as client:
        scene = client.post(
            "/api/scenes/generate",
            json={
                "terrain": "mountain",
                "weather": "sunny",
                "task": "trail",
                "prompt": "rocky mountain trail",
                "seed": 123,
                "obstacle_density": 0.4,
                "slope": 0.5,
            },
        )
        assert scene.status_code == 200
        scene_payload = scene.json()
        assert "occupancy" in scene_payload["assets"]
        assert scene_payload["provenance"]["source"] == "synthetic"

        reconstruction = client.post("/api/reconstruction/run", json={"sequence_id": "seq_0001", "method": "mock-bev", "seed": 9})
        assert reconstruction.status_code == 200
        assert reconstruction.json()["metrics"]["obstacle_count"] > 0
        assert reconstruction.json()["provenance"]["source"] == "mock"

        training = client.post("/api/world-model/train", json={"sequence_id": "seq_0001", "model": "tiny-bev-cnn", "epochs": 2, "seed": 2})
        assert training.status_code == 200
        assert len(training.json()["metrics"]) == 2
        assert training.json()["provenance"]["source"] == "synthetic"

        prediction = client.post("/api/world-model/predict", json={"sequence_id": "seq_0001", "horizon": 3, "seed": 3})
        assert prediction.status_code == 200
        assert len(prediction.json()["ego_motion"]) == 3
        assert prediction.json()["provenance"]["source"] == "mock"

        traversability_train = client.post(
            "/api/traversability/train",
            json={"sequence_id": "seq_0001", "source_format": "orwm-demo", "trainer": "tiny-mlp", "max_samples": 6, "epochs": 2, "max_pixels": 3000},
        )
        assert traversability_train.status_code == 200
        trav_run_id = traversability_train.json()["run_id"]
        assert traversability_train.json()["sample_count"] >= 1
        assert traversability_train.json()["backend"] == "numpy"
        assert traversability_train.json()["provenance"]["source"] == "synthetic"

        traversability_predict = client.post(
            "/api/traversability/predict",
            json={"sequence_id": "seq_0001", "model_id": trav_run_id, "frame_index": 0},
        )
        assert traversability_predict.status_code == 200
        assert "traversability" in traversability_predict.json()["assets"]
        assert traversability_predict.json()["metrics"]["risk_score"] > 0
        assert traversability_predict.json()["provenance"]["source"] == "synthetic"

        pytest.importorskip("torch")
        trajectory_train = client.post(
            "/api/trajectory/train",
            json={"sequence_id": "seq_0001", "history": 2, "horizon": 2, "epochs": 2, "augment": 4, "hidden_dim": 16},
        )
        assert trajectory_train.status_code == 200
        traj_run_id = trajectory_train.json()["run_id"]
        assert trajectory_train.json()["provenance"]["source"] == "placeholder"
        trajectory_predict = client.post(
            "/api/trajectory/predict",
            json={"sequence_id": "seq_0001", "model_id": traj_run_id, "history": 2, "horizon": 2, "frame_index": 0},
        )
        assert trajectory_predict.status_code == 200
        assert trajectory_predict.json()["predicted"]
        assert "trajectory" in trajectory_predict.json()["assets"]
        assert trajectory_predict.json()["provenance"]["source"] == "placeholder"

        rl_train = client.post("/api/rl/train", json={"algorithm": "ppo-fallback", "episodes": 3, "seed": 4})
        assert rl_train.status_code == 200
        run_id = rl_train.json()["run_id"]
        assert rl_train.json()["provenance"]["source"] == "toy_env"
        replay = client.get(f"/api/rl/replay/{run_id}")
        assert replay.status_code == 200
        assert replay.json()["states"]
        assert replay.json()["provenance"]["source"] == "toy_env"

        runs = client.get("/api/runs")
        assert runs.status_code == 200
        run_payload = runs.json()
        assert any(item["run_id"] == scene_payload["scene_id"] for item in run_payload)
        assert any(item["run_id"] == run_id for item in run_payload)
        synthetic_runs = client.get("/api/runs?source=synthetic")
        assert synthetic_runs.status_code == 200
        assert all(item["source"] == "synthetic" for item in synthetic_runs.json())
        run_detail = client.get(f"/api/runs/{run_id}")
        assert run_detail.status_code == 200
        assert run_detail.json()["provenance"]["source"] == "toy_env"
        run_export = client.get(f"/api/runs/{run_id}/export")
        assert run_export.status_code == 200
        assert run_export.json()["bundle"]["run_id"] == run_id
        assert "artifacts" in run_export.json()["bundle"]
        comparison = client.get("/api/runs/compare?kind=rl_train")
        assert comparison.status_code == 200
        comparison_payload = comparison.json()
        assert "success_rate" in comparison_payload["metric_keys"]
        assert any(item["run_id"] == run_id for item in comparison_payload["rows"])

        job_launch = client.post(
            "/api/jobs/launch",
            json={
                "label": "Reconstruct",
                "endpoint": "/api/reconstruction/run",
                "method": "POST",
                "body": {"sequence_id": "seq_0001", "method": "mock-bev", "seed": 91},
            },
        )
        assert job_launch.status_code == 200
        job_payload = job_launch.json()
        assert job_payload["job"]["status"] == "completed"
        assert job_payload["job"]["kind"] == "reconstruction"
        assert job_payload["job"]["run_id"] == job_payload["result"]["run_id"]
        jobs = client.get("/api/jobs")
        assert jobs.status_code == 200
        assert any(item["job_id"] == job_payload["job"]["job_id"] for item in jobs.json())


def test_rugd_style_import_endpoint() -> None:
    source_root = Path("data/demo/sequences/seq_0001").resolve()
    with TestClient(app) as client:
        imported = client.post(
            "/api/public-datasets/rugd/import",
            json={
                "root_path": str(source_root),
                "sequence_id": "rugd_pytest",
                "max_samples": 2,
                "overwrite": True,
            },
        )
        assert imported.status_code == 200
        assert imported.json()["imported_frames"] == 2
        detail = client.get("/api/sequences/rugd_pytest")
        assert detail.status_code == 200
        assert len(detail.json()["frames"]) == 2
        assert len(detail.json()["labels"]) == 2
        source_card = client.get("/api/sequences/rugd_pytest/source-card")
        assert source_card.status_code == 200
        assert source_card.json()["source_type"] == "public"
        assert "semantic_mask" in source_card.json()["sensors"]


def test_tartandrive_style_import_endpoint(tmp_path: Path) -> None:
    source_root = tmp_path / "tartan_source"
    source_root.mkdir()
    state_rows = ["timestamp,x,y,z,yaw,pitch,roll,speed"]
    action_rows = ["timestamp,steer,throttle,brake"]
    for index in range(18):
        state_rows.append(f"{index * 0.1:.1f},{index * 0.4:.3f},{index * 0.05:.3f},0.0,{index * 0.01:.4f},0.0,0.0,4.0")
        action_rows.append(f"{index * 0.1:.1f},{0.02 * index:.3f},0.4,0.0")
    (source_root / "states.csv").write_text("\n".join(state_rows) + "\n", encoding="utf-8")
    (source_root / "actions.csv").write_text("\n".join(action_rows) + "\n", encoding="utf-8")

    with TestClient(app) as client:
        imported = client.post(
            "/api/public-datasets/tartandrive/import",
            json={
                "root_path": str(source_root),
                "sequence_id": "tartandrive_pytest",
                "max_samples": 16,
                "overwrite": True,
            },
        )
        assert imported.status_code == 200
        assert imported.json()["imported_frames"] == 16
        detail = client.get("/api/sequences/tartandrive_pytest")
        assert detail.status_code == 200
        assert len(detail.json()["frames"]) == 16
        quality = client.get("/api/sequences/tartandrive_pytest/quality")
        assert quality.status_code == 200
        quality_items = {item["key"]: item for item in quality.json()["items"]}
        assert quality_items["poses"]["status"] == "ok"
        assert quality_items["actions"]["status"] == "ok"
        catalog = client.get("/api/model-catalog?sequence_id=tartandrive_pytest")
        assert catalog.status_code == 200
        traj = next(item for item in catalog.json() if item["id"] == "trajectory_tiny_gru")
        assert traj["status"] == "ready"
        assert traj["source"] == "real_data"


def test_vehicle_crud() -> None:
    with TestClient(app) as client:
        vehicle = {
            "id": "pytest_vehicle",
            "name": "Pytest Rover",
            "wheelbase": 2.4,
            "width": 1.5,
            "length": 3.8,
            "max_steer": 32,
            "max_speed": 10,
            "mass": 980,
            "tire_type": "mud",
        }
        saved = client.post("/api/vehicles", json=vehicle)
        assert saved.status_code == 200
        vehicles = client.get("/api/vehicles")
        assert vehicles.status_code == 200
        assert any(item["id"] == "pytest_vehicle" for item in vehicles.json())


def test_scene_generation_is_seed_deterministic(tmp_path: Path) -> None:
    first = generate_scene_assets(
        tmp_path / "a",
        seed=77,
        terrain="mountain",
        weather="sunny",
        task="trail",
        prompt="deterministic",
        obstacle_density=0.3,
        slope=0.4,
    )
    second = generate_scene_assets(
        tmp_path / "b",
        seed=77,
        terrain="mountain",
        weather="sunny",
        task="trail",
        prompt="deterministic",
        obstacle_density=0.3,
        slope=0.4,
    )
    assert first["metrics"] == second["metrics"]
