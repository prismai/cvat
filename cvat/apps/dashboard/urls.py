
# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT

from django.urls import path
from . import views

urlpatterns = [
    path('get_share_nodes', views.JsTreeView),
    path('', views.DashboardView),

    path('jobs/<int:job_id>/update/', views.task_job_update_view),
]

