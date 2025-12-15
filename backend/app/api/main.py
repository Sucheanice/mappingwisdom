from fastapi import APIRouter

from app.api.routes import items, login, private, users, utils, weather, mysql_users, mysql_locations, mysql_store_locations, dify, map_ws, map, location, simulation, sms, map_agent, map_agent_v2
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(weather.router)
api_router.include_router(mysql_users.router)
api_router.include_router(mysql_locations.router)
api_router.include_router(mysql_store_locations.router)
api_router.include_router(dify.router)
api_router.include_router(map_ws.router)
api_router.include_router(map.router)
api_router.include_router(map_agent.router)
api_router.include_router(map_agent_v2.router)
api_router.include_router(location.router)
api_router.include_router(simulation.router)
api_router.include_router(sms.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
