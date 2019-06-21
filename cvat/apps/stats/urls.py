from django.urls import path
from . import views

urlpatterns = [
    path('', views.stats_index_view),
    path('api/get_stats/', views.get_operators_stats_view),
    path('api/get_stats/<int:operator_id>/', views.get_operators_stats_view),
]
