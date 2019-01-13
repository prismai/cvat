
# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

from .base import *

DEBUG = False

INSTALLED_APPS += [
    'mod_wsgi.server',
]

for key in RQ_QUEUES:
    RQ_QUEUES[key]['HOST'] = 'cvat_redis'

CACHEOPS_REDIS['host'] = 'cvat_redis'

# Django-sendfile:
# https://github.com/johnsensible/django-sendfile
SENDFILE_BACKEND = 'sendfile.backends.xsendfile'

# Database
# https://docs.djangoproject.com/en/2.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'HOST': 'cvat_db',
        'NAME': 'cvat',
        'USER': 'root',
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''),
    }
}

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

sentry_sdk.init(
    dsn=os.getenv('SENTRY_DSN'),
    integrations=[DjangoIntegration()],
    environment=os.getenv('DJANGO_CONFIGURATION')
)
