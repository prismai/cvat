from django.urls import path
from . import views

urlpatterns = [
    path('', views.stats_index_view),
    path('api/save/', views.save_interval_stats),
    path('api/get/', views.get_operators_stats_view),
]
