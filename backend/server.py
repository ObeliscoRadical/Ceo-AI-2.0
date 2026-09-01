from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timezone

from core import db, client, hash_password, verify_password, init_storage, send_daily_briefings, send_monthly_value_alerts, send_goal_alerts, logger, UPLOAD_DIR
from routers import auth, companies, finance, ceo, documents, billing, misc, voice, founders, goals, council, crm, marketing, marketing_autonomous, social, prospecting, notifications, grants, erp_integrations, site_publishing, growth_agent, obelisco_sync, marketing_pipeline

app = FastAPI()
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
api_router = APIRouter(prefix="/api")
for _m in (auth, companies, finance, ceo, documents, billing, misc, voice, founders, goals, council, crm, marketing, marketing_autonomous, social, prospecting, notifications, grants, erp_integrations, site_publishing, growth_agent, obelisco_sync, marketing_pipeline):
    api_router.include_router(_m.router)
app.include_router(api_router)

cors_env = os.environ.get("CORS_ORIGINS", "*").strip()
if cors_env == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in cors_env.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("stripe_subscription_id")
    await db.users.create_index("stripe_customer_id")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.social_oauth_states.create_index("expires_at", expireAfterSeconds=0)
    await db.social_connections.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.social_jobs.create_index([("user_id", 1), ("company_id", 1), ("run_at", 1)])
    await db.social_posts.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_post_metrics.create_index([("user_id", 1), ("company_id", 1), ("social_post_id", 1)], unique=True)
    await db.marketing_post_metrics.create_index([("user_id", 1), ("company_id", 1), ("published_at", -1)])
    await db.marketing_campaigns.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_briefings.create_index([("user_id", 1), ("company_id", 1), ("date", 1)], unique=True)
    await db.marketing_briefings.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_organic_agents.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.marketing_organic_agents.create_index([("status", 1), ("next_run_at", 1)])
    await db.marketing_organic_actions.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_organic_actions.create_index([("user_id", 1), ("company_id", 1), ("status", 1)])
    await db.marketing_organic_reports.create_index([("user_id", 1), ("company_id", 1), ("period", 1), ("reference_key", 1)], unique=True)
    await db.marketing_organic_reports.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.site_publication_settings.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.site_content_entries.create_index([("user_id", 1), ("company_id", 1), ("kind", 1), ("slug", 1)])
    await db.site_content_entries.create_index([("kind", 1), ("status", 1), ("published_at", -1)])
    await db.site_content_entries.create_index([("kind", 1), ("slot_key", 1)])
    await db.site_content_versions.create_index([("user_id", 1), ("company_id", 1), ("entry_id", 1), ("created_at", -1)])
    await db.site_publication_logs.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.growth_internal_page_daily.create_index([("user_id", 1), ("company_id", 1), ("date", 1), ("page_key", 1)], unique=True)
    await db.growth_page_snapshots.create_index([("user_id", 1), ("company_id", 1), ("source", 1), ("window", 1), ("page_path", 1)], unique=True)
    await db.growth_query_snapshots.create_index([("user_id", 1), ("company_id", 1), ("page_path", 1), ("query", 1)], unique=True)
    await db.growth_sync_runs.create_index([("user_id", 1), ("company_id", 1), ("started_at", -1)])
    await db.growth_agent_actions.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.growth_agent_reports.create_index([("user_id", 1), ("company_id", 1), ("period", 1), ("reference_key", 1)], unique=True)
    await db.erp_integrations.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.erp_integrations.create_index("endpoint_id", unique=True)
    await db.erp_events.create_index([("endpoint_id", 1), ("event_key", 1)], unique=True)
    await db.erp_events.create_index([("user_id", 1), ("company_id", 1), ("received_at", -1)])
    await db.erp_financial_contexts.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.marketing_products.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_content_pool.create_index([("user_id", 1), ("company_id", 1), ("status", 1)])
    await db.marketing_content_pool.create_index([("user_id", 1), ("company_id", 1), ("product_id", 1)])
    await db.marketing_content_pool.create_index([("user_id", 1), ("company_id", 1), ("campaign_id", 1)])
    await db.marketing_schedule_slots.create_index([("user_id", 1), ("company_id", 1), ("scheduled_at", 1)])
    await db.marketing_posting_plans.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.marketing_experiments.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_autopilot_config.create_index([("user_id", 1), ("company_id", 1)], unique=True)
    await db.marketing_autopilot_logs.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.marketing_growth_insights.create_index([("user_id", 1), ("company_id", 1), ("created_at", -1)])
    await db.counters.update_one({"_id": "founder"}, {"$setOnInsert": {"seq": 0}}, upsert=True)
    await db.app_config.update_one({"_id": "founder_campaign"},
                                   {"$setOnInsert": {"active": True, "milestones_sent": []}}, upsert=True)
    default_accounts = [
        {"email": os.environ.get("ADMIN_EMAIL", "ceo@empresa.com").lower(), "password": os.environ.get("ADMIN_PASSWORD", "password123"), "name": "CEO AI 2.0 (Admin)", "role": "admin"},
        {"email": "d.oliveira1986@gmail.com", "password": "A24d22r04", "name": "Diego Oliveira", "role": "admin"}
    ]
    for acc in default_accounts:
        if acc["email"] and acc["password"]:
            existing = await db.users.find_one({"email": acc["email"]})
            if not existing:
                ins_res = await db.users.insert_one({
                    "email": acc["email"], "password_hash": hash_password(acc["password"]),
                    "name": acc["name"], "role": acc["role"], "auth_provider": "email", "picture": "",
                    "is_premium": True, "created_at": datetime.now(timezone.utc).isoformat()
                })
                u_id = str(ins_res.inserted_id)
            else:
                u_id = str(existing["_id"])
                upd = {"role": acc["role"], "is_premium": True, "password_hash": hash_password(acc["password"])}
                await db.users.update_one({"_id": existing["_id"]}, {"$set": upd})
            
            # Ensure company exists
            if not await db.companies.find_one({"user_id": u_id}):
                await db.companies.insert_one({
                    "user_id": u_id, "name": f"{acc['name']} Obelisco",
                    "region": "PT", "currency": "EUR", "sector": "Instalações e Serviços", "employees_count": 5,
                    "clients_count": 12, "bank_balance": 25000, "monthly_tax_estimate": 1200,
                    "profile": {}, "created_at": datetime.now(timezone.utc).isoformat()
                })
            # Ensure CEO DNA exists
            if not await db.ceo_dna.find_one({"user_id": u_id}):
                await db.ceo_dna.insert_one({
                    "user_id": u_id, "completed": True, "answers": {},
                    "dream": "Construir empresa de excelência 360", "target_revenue": 500000, "work_hours": "40h", "exit_plan": "",
                    "five_year_vision": "Liderança de mercado", "ceo_mode": "crescimento",
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        scheduler = AsyncIOScheduler(timezone="UTC")
        scheduler.add_job(send_daily_briefings, CronTrigger(hour=7, minute=0), id="daily_briefings", replace_existing=True)
        scheduler.add_job(marketing.send_daily_marketing_briefings, CronTrigger(hour=7, minute=15), id="daily_marketing_briefings", replace_existing=True)
        scheduler.add_job(marketing_autonomous.run_all_organic_growth_agents, "interval", minutes=30, id="organic_growth_agents", replace_existing=True, max_instances=1)
        scheduler.add_job(growth_agent.run_all_growth_agent_cycles, "interval", hours=6, id="growth_agent_cycles", replace_existing=True, max_instances=1)
        scheduler.add_job(send_monthly_value_alerts, CronTrigger(day=1, hour=8, minute=0), id="monthly_value_alerts", replace_existing=True)
        scheduler.add_job(send_goal_alerts, CronTrigger(hour=8, minute=30), id="goal_alerts", replace_existing=True)
        from routers.social import run_due_social_jobs, run_all_social_media_agent_cycles
        scheduler.add_job(run_all_social_media_agent_cycles, "interval", minutes=30, id="social_media_agent_cycles", replace_existing=True, max_instances=1)
        scheduler.add_job(run_due_social_jobs, "interval", seconds=60, id="social_publisher", replace_existing=True, max_instances=1)
        from routers.notifications import evaluate_crm_alerts
        scheduler.add_job(evaluate_crm_alerts, "interval", hours=6, id="crm_alerts", replace_existing=True, max_instances=1)
        from routers.grants import evaluate_grant_alerts
        scheduler.add_job(evaluate_grant_alerts, CronTrigger(hour=9, minute=0), id="grant_alerts", replace_existing=True, max_instances=1)
        from obelisco_connector import sync_obelisco_to_ceo_ai
        async def run_all_obelisco_syncs():
            try:
                users = await db.users.find({}).to_list(200)
                for u in users:
                    try:
                        await sync_obelisco_to_ceo_ai(str(u["_id"]))
                    except Exception as ex:
                        logger.warning(f"Obelisco scheduled sync failed for user {u.get('_id')}: {ex}")
            except Exception as e:
                logger.error(f"Error in run_all_obelisco_syncs: {e}")
        scheduler.add_job(run_all_obelisco_syncs, CronTrigger(hour=6, minute=30), id="obelisco_360_daily_sync", replace_existing=True)
        scheduler.add_job(run_all_obelisco_syncs, "interval", hours=4, id="obelisco_360_interval_sync", replace_existing=True, max_instances=1)
        scheduler.start()
        logger.info("Briefing scheduler started with Obelisco 360 Sync active")
    except Exception as e:
        logger.error(f"Scheduler start failed: {e}")
    try:
        if (os.environ.get("STRIPE_MODE") == "live") and (os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_live")):
            import asyncio as _asyncio, setup_stripe
            _asyncio.create_task(_asyncio.to_thread(setup_stripe.main))
            logger.info("Stripe LIVE catalog ensure scheduled")
    except Exception as e:
        logger.error(f"Stripe catalog ensure failed: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"
if FRONTEND_BUILD_DIR.exists():
    static_dir = FRONTEND_BUILD_DIR / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("uploads"):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = FRONTEND_BUILD_DIR / full_path
        if full_path and target_file.is_file():
            return FileResponse(str(target_file))
        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Frontend build not found")

