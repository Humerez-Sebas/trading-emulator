# -*- coding: utf-8 -*-
"""Tests de r2_uploader.py con cliente boto3 simulado (sin red real).

El cliente boto3 es inyectable; aqui se usa un stub ligero que registra
las llamadas a put_object y devuelve ETags falsos.
"""

import json
import os
import sys
from datetime import timezone
from unittest.mock import MagicMock, patch

import pytest

boto3 = pytest.importorskip("boto3")

# r2_uploader y manifest viven como modulos planos en backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import r2_uploader  # noqa: E402


# ---------------------------------------------------------------------------
# Stub de cliente S3/R2
# ---------------------------------------------------------------------------


class FakeS3Client:
    """Stub ligero que registra llamadas a put_object y devuelve ETags falsos.

    Body puede ser bytes o un file-like object. Se almacena tal cual para que
    los tests de manifest puedan leer el JSON (que llega como bytes), mientras
    que los tests de Parquet pasan un file handle que no necesita inspeccion.
    """

    def __init__(self):
        self.calls: list[dict] = []
        self._etag_counter = 0

    def put_object(self, Bucket: str, Key: str, Body, **kwargs) -> dict:
        self._etag_counter += 1
        etag = f'"fake-etag-{self._etag_counter:04d}"'
        # Body se guarda sin leer: si es bytes se puede usar directamente;
        # si es file handle los tests de Parquet no lo inspeccionan (solo Key/Bucket).
        self.calls.append({"Bucket": Bucket, "Key": Key, "Body": Body, "ETag": etag})
        return {"ETag": etag, "ResponseMetadata": {"HTTPStatusCode": 200}}

    def get_call(self, key: str) -> dict | None:
        """Devuelve la primera llamada cuya Key coincida con key, o None."""
        for c in self.calls:
            if c["Key"] == key:
                return c
        return None

    def keys(self) -> list[str]:
        return [c["Key"] for c in self.calls]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def parquet_tree(tmp_path):
    """Crea un arbol de Parquets sinteticos en disco que imita la salida de write_anchors."""
    # m1: dos anios
    for year in ["2024", "2025"]:
        d = tmp_path / "XAUUSD" / "m1"
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{year}.parquet").write_bytes(b"fake-parquet-m1-" + year.encode())
    # h1
    d_h1 = tmp_path / "XAUUSD" / "h1"
    d_h1.mkdir(parents=True, exist_ok=True)
    (d_h1 / "all.parquet").write_bytes(b"fake-parquet-h1")
    # d1
    d_d1 = tmp_path / "XAUUSD" / "d1"
    d_d1.mkdir(parents=True, exist_ok=True)
    (d_d1 / "all.parquet").write_bytes(b"fake-parquet-d1")
    return tmp_path


@pytest.fixture
def fake_client():
    return FakeS3Client()


# ---------------------------------------------------------------------------
# Tests de upload_parquet_tree
# ---------------------------------------------------------------------------


class TestUploadParquetTree:
    """r2_uploader.upload_parquet_tree(out_dir, bucket, client) sube todos los parquets."""

    def test_sube_exactamente_cuatro_archivos(self, parquet_tree, fake_client):
        r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        # 2 m1 + 1 h1 + 1 d1 = 4 archivos parquet
        parquet_calls = [k for k in fake_client.keys() if k.endswith(".parquet")]
        assert len(parquet_calls) == 4

    def test_claves_m1_siguen_layout(self, parquet_tree, fake_client):
        """Las claves R2 para m1 deben ser market-data/v1/XAUUSD/m1/<year>.parquet."""
        r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        assert "market-data/v1/XAUUSD/m1/2024.parquet" in fake_client.keys()
        assert "market-data/v1/XAUUSD/m1/2025.parquet" in fake_client.keys()

    def test_claves_h1_siguen_layout(self, parquet_tree, fake_client):
        r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        assert "market-data/v1/XAUUSD/h1/all.parquet" in fake_client.keys()

    def test_claves_d1_siguen_layout(self, parquet_tree, fake_client):
        r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        assert "market-data/v1/XAUUSD/d1/all.parquet" in fake_client.keys()

    def test_bucket_correcto_en_cada_llamada(self, parquet_tree, fake_client):
        r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for call in fake_client.calls:
            if call["Key"].endswith(".parquet"):
                assert call["Bucket"] == "mi-bucket"

    def test_devuelve_registros_con_campos_requeridos(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        assert len(records) == 4
        for rec in records:
            assert "symbol" in rec
            assert "tf" in rec
            assert "partition" in rec
            assert "size" in rec
            assert "etag" in rec
            assert "updated_at" in rec

    def test_etag_sin_comillas_en_registros(self, parquet_tree, fake_client):
        """Los ETags en los registros deben tener las comillas dobles eliminadas."""
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            assert '"' not in rec["etag"], f"ETag con comillas: {rec['etag']}"

    def test_size_refleja_tamano_real_del_archivo(self, parquet_tree, fake_client):
        """size debe ser el tamano real del archivo en bytes (os.path.getsize)."""
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            assert rec["size"] > 0
            assert isinstance(rec["size"], int)

    def test_symbol_en_mayusculas(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            assert rec["symbol"] == rec["symbol"].upper()

    def test_tf_en_minusculas(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            assert rec["tf"] == rec["tf"].lower()
            assert rec["tf"] in ("m1", "h1", "d1")

    def test_particion_m1_es_anio_string(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        m1_records = [r for r in records if r["tf"] == "m1"]
        partitions = {r["partition"] for r in m1_records}
        assert partitions == {"2024", "2025"}

    def test_particion_h1_d1_es_all(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            if rec["tf"] in ("h1", "d1"):
                assert rec["partition"] == "all"

    def test_updated_at_es_datetime_utc(self, parquet_tree, fake_client):
        from datetime import datetime

        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        for rec in records:
            assert isinstance(rec["updated_at"], datetime)
            assert rec["updated_at"].tzinfo == timezone.utc

    def test_lanza_error_si_out_dir_no_existe(self, tmp_path, fake_client):
        """Debe lanzar FileNotFoundError si out_dir no existe."""
        inexistente = str(tmp_path / "no_existe")
        with pytest.raises(FileNotFoundError):
            r2_uploader.upload_parquet_tree(inexistente, "mi-bucket", fake_client)

    def test_lanza_error_si_out_dir_vacio(self, tmp_path, fake_client):
        """Debe lanzar ValueError si out_dir existe pero no hay archivos .parquet."""
        with pytest.raises(ValueError):
            r2_uploader.upload_parquet_tree(str(tmp_path), "mi-bucket", fake_client)


# ---------------------------------------------------------------------------
# Tests de upload_manifest
# ---------------------------------------------------------------------------


class TestUploadManifest:
    """r2_uploader.upload_manifest(records, bucket, client) sube manifest.json a la raiz."""

    def test_sube_manifest_a_raiz(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        assert "manifest.json" in fake_client.keys()

    def test_manifest_no_bajo_market_data(self, parquet_tree, fake_client):
        """manifest.json debe estar en la raiz, NO bajo market-data/."""
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        assert "market-data/manifest.json" not in fake_client.keys()

    def test_manifest_json_valido(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        call = fake_client.get_call("manifest.json")
        assert call is not None
        # upload_manifest sube bytes (no file handle), por lo que Body es decodificable
        data = json.loads(call["Body"])
        assert data["version"] == 1
        assert "symbols" in data

    def test_manifest_bucket_correcto(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        call = fake_client.get_call("manifest.json")
        assert call["Bucket"] == "mi-bucket"

    def test_manifest_contiene_todos_los_simbolos(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        call = fake_client.get_call("manifest.json")
        data = json.loads(call["Body"])
        assert "XAUUSD" in data["symbols"]

    def test_manifest_m1_tiene_particiones_por_anio(self, parquet_tree, fake_client):
        records = r2_uploader.upload_parquet_tree(str(parquet_tree), "mi-bucket", fake_client)
        r2_uploader.upload_manifest(records, "mi-bucket", fake_client)
        call = fake_client.get_call("manifest.json")
        data = json.loads(call["Body"])
        m1 = data["symbols"]["XAUUSD"]["m1"]
        assert "2024" in m1
        assert "2025" in m1


# ---------------------------------------------------------------------------
# Tests de build_r2_client (configuracion desde env vars)
# ---------------------------------------------------------------------------


class TestBuildR2Client:
    """r2_uploader.build_r2_client() construye el cliente con las env vars correctas."""

    def test_falla_si_faltan_vars_requeridas(self, monkeypatch):
        """Debe lanzar ValueError listando las variables faltantes."""
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
        with pytest.raises((ValueError, EnvironmentError)):
            r2_uploader.build_r2_client()

    def test_usa_endpoint_r2_si_esta_definida(self, monkeypatch):
        """Si R2_ENDPOINT esta definida, se usa como endpoint_url."""
        monkeypatch.setenv("R2_ACCOUNT_ID", "test-account")
        monkeypatch.setenv("R2_BUCKET_NAME", "test-bucket")
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "test-key")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "test-secret")
        monkeypatch.setenv("R2_ENDPOINT", "https://custom.endpoint.example.com")

        capturado = {}

        def fake_boto3_client(service, **kwargs):
            capturado.update(kwargs)
            return MagicMock()

        with patch("boto3.client", side_effect=fake_boto3_client):
            r2_uploader.build_r2_client()

        assert capturado.get("endpoint_url") == "https://custom.endpoint.example.com"

    def test_construye_endpoint_de_account_id_si_no_hay_r2_endpoint(self, monkeypatch):
        """Si R2_ENDPOINT no esta definida, se construye desde R2_ACCOUNT_ID."""
        monkeypatch.setenv("R2_ACCOUNT_ID", "mi-cuenta-123")
        monkeypatch.setenv("R2_BUCKET_NAME", "test-bucket")
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "test-key")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "test-secret")
        monkeypatch.delenv("R2_ENDPOINT", raising=False)

        capturado = {}

        def fake_boto3_client(service, **kwargs):
            capturado.update(kwargs)
            return MagicMock()

        with patch("boto3.client", side_effect=fake_boto3_client):
            r2_uploader.build_r2_client()

        assert capturado.get("endpoint_url") == "https://mi-cuenta-123.r2.cloudflarestorage.com"

    def test_region_name_auto(self, monkeypatch):
        monkeypatch.setenv("R2_ACCOUNT_ID", "test-account")
        monkeypatch.setenv("R2_BUCKET_NAME", "test-bucket")
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "test-key")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "test-secret")
        monkeypatch.delenv("R2_ENDPOINT", raising=False)

        capturado = {}

        def fake_boto3_client(service, **kwargs):
            capturado.update(kwargs)
            return MagicMock()

        with patch("boto3.client", side_effect=fake_boto3_client):
            r2_uploader.build_r2_client()

        assert capturado.get("region_name") == "auto"


# ---------------------------------------------------------------------------
# Tests de load_config
# ---------------------------------------------------------------------------


class TestLoadConfig:
    """r2_uploader.load_config() devuelve un dict con las vars de entorno requeridas."""

    def test_devuelve_todas_las_vars_si_presentes(self, monkeypatch):
        monkeypatch.setenv("R2_ACCOUNT_ID", "acc-id")
        monkeypatch.setenv("R2_BUCKET_NAME", "mi-bucket")
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "key-id")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
        monkeypatch.delenv("R2_ENDPOINT", raising=False)

        config = r2_uploader.load_config()
        assert config["R2_ACCOUNT_ID"] == "acc-id"
        assert config["R2_BUCKET_NAME"] == "mi-bucket"
        assert config["R2_ACCESS_KEY_ID"] == "key-id"
        assert config["R2_SECRET_ACCESS_KEY"] == "secret"

    def test_lanza_error_listando_vars_faltantes(self, monkeypatch):
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

        with pytest.raises((ValueError, EnvironmentError)) as exc_info:
            r2_uploader.load_config()

        mensaje = str(exc_info.value)
        # Debe mencionar al menos una variable faltante
        assert "R2_" in mensaje

    def test_r2_endpoint_es_opcional(self, monkeypatch):
        """R2_ENDPOINT es opcional; no debe fallar si no esta definida."""
        monkeypatch.setenv("R2_ACCOUNT_ID", "acc-id")
        monkeypatch.setenv("R2_BUCKET_NAME", "mi-bucket")
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "key-id")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
        monkeypatch.delenv("R2_ENDPOINT", raising=False)

        config = r2_uploader.load_config()  # no debe lanzar excepcion
        # Fix #5: la implementacion devuelve None cuando no esta definida
        assert config.get("R2_ENDPOINT") is None


# ---------------------------------------------------------------------------
# Tests de _dry_run (sin credenciales R2)
# ---------------------------------------------------------------------------


class TestDryRun:
    """_dry_run no debe requerir credenciales R2."""

    def test_dry_run_sin_credenciales(self, parquet_tree, monkeypatch, capsys):
        """_dry_run debe funcionar con variables R2 ausentes del entorno."""
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

        # No debe lanzar excepcion
        r2_uploader._dry_run(str(parquet_tree))

        capturado = capsys.readouterr()
        # Debe imprimir un manifest JSON valido
        data = json.loads(capturado.out)
        assert data["version"] == 1
        assert "XAUUSD" in data["symbols"]

    def test_dry_run_imprime_claves_r2(self, parquet_tree, monkeypatch, capsys):
        """_dry_run debe incluir las claves market-data/v1/... en la salida."""
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

        r2_uploader._dry_run(str(parquet_tree))

        capturado = capsys.readouterr()
        data = json.loads(capturado.out)
        # Verificar que el manifest tiene los timeframes esperados
        xauusd = data["symbols"]["XAUUSD"]
        assert "m1" in xauusd
        assert "h1" in xauusd
        assert "d1" in xauusd

    def test_dry_run_directorio_inexistente(self, tmp_path, monkeypatch, capsys):
        """_dry_run con directorio inexistente debe imprimir 'Nada que subir' sin crash."""
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

        r2_uploader._dry_run(str(tmp_path / "no_existe"))

        capturado = capsys.readouterr()
        assert "Nada que subir" in capturado.out or "nada" in capturado.out.lower()

    def test_dry_run_directorio_vacio(self, tmp_path, monkeypatch, capsys):
        """_dry_run con directorio sin .parquet debe imprimir mensaje apropiado."""
        monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
        monkeypatch.delenv("R2_BUCKET_NAME", raising=False)
        monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)

        r2_uploader._dry_run(str(tmp_path))

        capturado = capsys.readouterr()
        assert "Nada que subir" in capturado.out or "nada" in capturado.out.lower()
