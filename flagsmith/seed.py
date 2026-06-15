"""Idempotent Flagsmith seed run automatically when the stack comes up.

Creates the organisation, project, environment, the two feature flags the
backend reads (``timescale_enabled``, ``registration_enabled``), a
**deterministic** server-side SDK key, and (optionally) an admin user added to
the org so the flags are manageable from the dashboard.

Run as a one-shot via the flagsmith image (see the ``flagsmith-seed`` service in
docker-compose.yml):

    python manage.py shell -c "exec(open('/seed/seed.py').read())"

Re-running is safe (get_or_create). The server-side key is fixed so the backend
can be configured up front via ``FLAGSMITH_KEY`` in ``.env`` -- no manual copy
from the dashboard. This is a DEV convenience; for a real deployment generate
proper keys/credentials in the Flagsmith UI.
"""

import os

from environments.models import Environment, EnvironmentAPIKey
from features.models import Feature
from organisations.models import Organisation
from projects.models import Project


def _truthy(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "on"}


ORG_NAME = os.environ.get("FLAGSMITH_SEED_ORG", "Trading Emulator")
PROJECT_NAME = os.environ.get("FLAGSMITH_SEED_PROJECT", "trading-emulator")
ENV_NAME = os.environ.get("FLAGSMITH_SEED_ENV", "Local")
SERVER_KEY = os.environ.get("FLAGSMITH_SEED_SERVER_KEY", "ser.trading-emulator-local-seed-key")

# flag name -> default enabled (kept in sync with the backend env-var fallbacks)
FLAGS = {
    "timescale_enabled": _truthy(os.environ.get("TIMESCALE_ENABLED", "true")),
    "registration_enabled": _truthy(os.environ.get("REGISTRATION_ENABLED", "true")),
}

org, _ = Organisation.objects.get_or_create(name=ORG_NAME)
project, _ = Project.objects.get_or_create(name=PROJECT_NAME, organisation=org)
env, _ = Environment.objects.get_or_create(name=ENV_NAME, project=project)

for name, enabled in FLAGS.items():
    feature, _ = Feature.objects.get_or_create(
        name=name, project=project, defaults={"default_enabled": enabled}
    )
    # creating a Feature auto-creates a FeatureState per environment; align it
    state = (
        feature.feature_states.filter(
            environment=env, feature_segment__isnull=True, identity__isnull=True
        ).first()
    )
    if state is not None:
        state.enabled = enabled
        state.save()

EnvironmentAPIKey.objects.get_or_create(
    key=SERVER_KEY, defaults={"environment": env, "name": "seed-server-key"}
)

# optional: an admin user added to the org so the flags show up in the dashboard
email = os.environ.get("FLAGSMITH_ADMIN_EMAIL")
password = os.environ.get("FLAGSMITH_ADMIN_PASSWORD")
if email and password:
    try:
        from users.models import FFAdminUser

        user, created = FFAdminUser.objects.get_or_create(
            email=email, defaults={"is_staff": True, "is_superuser": True}
        )
        if created:
            user.set_password(password)
            user.save()
        if not user.organisations.filter(pk=org.pk).exists():
            user.add_organisation(org)
    except Exception as exc:  # never fail the seed over the optional admin user
        print("SEED admin user skipped:", repr(exc))

print(
    "SEED_OK server_key=%s client_key=%s flags=%s"
    % (SERVER_KEY, env.api_key, list(FLAGS))
)
