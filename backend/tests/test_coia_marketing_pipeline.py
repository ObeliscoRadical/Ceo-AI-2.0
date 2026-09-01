import pytest
import asyncio
from datetime import datetime, timezone
from bson import ObjectId
from httpx import AsyncClient, ASGITransport
from server import app
from core import db, hash_password

@pytest.mark.asyncio
async def test_coia_basic_and_full_pipeline():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # -------------------------------------------------------------
        # 1. TEST BASIC (Non-premium Entitlement Gate)
        # -------------------------------------------------------------
        basic_email = "test_basic_user@coia.test"
        await db.users.delete_many({"email": basic_email})
        basic_user_res = await ac.post("/api/auth/register", json={
            "name": "Basic User",
            "email": basic_email,
            "password": "Password123!"
        })
        basic_token = basic_user_res.json().get("token")
        
        # Demote to non-premium
        await db.users.update_one({"email": basic_email}, {"$set": {"is_premium": False, "role": "user"}})
        
        # Accessing marketing endpoints should be gated
        res_gated = await ac.get("/api/marketing/products", headers={"Authorization": f"Bearer {basic_token}"})
        assert res_gated.status_code in [402, 403], f"Basic user should be gated, got {res_gated.status_code}"

        # -------------------------------------------------------------
        # 2. TEST FULL (Premium User End-to-End Loop)
        # -------------------------------------------------------------
        full_email = "test_full_ceo@coia.test"
        await db.users.delete_many({"email": full_email})
        full_user_res = await ac.post("/api/auth/register", json={
            "name": "CEO Premium",
            "email": full_email,
            "password": "Password123!"
        })
        full_token = full_user_res.json().get("token")
        full_uid = full_user_res.json().get("user", {}).get("id")
        
        # Promote to premium
        await db.users.update_one({"email": full_email}, {"$set": {"is_premium": True, "role": "user"}})
        headers = {"Authorization": f"Bearer {full_token}"}

        # Create active company
        company_res = await ac.post("/api/companies", json={
            "name": "Obelisco Tech & Soluções",
            "sector": "Instalações Elétricas e Eficiência Energética",
            "region": "PT",
            "currency": "EUR"
        }, headers=headers)
        
        # -------------------------------------------------------------
        # A. VITRINE & PRODUTOS
        # -------------------------------------------------------------
        prod_payload = {
            "name": "Auditoria de Eficiência Energética",
            "category": "Serviço",
            "price": 1250.0,
            "pricing_model": "Fixo",
            "description": "Inspeção termográfica e redução comprovada de até 30% na fatura de energia.",
            "target_audience": "Fábricas, condomínios e empresas de médio porte",
            "main_pain": "Contas de luz excessivas e risco de sobrecarga elétrica",
            "value_prop": "Poupança garantida com relatório técnico certificado",
            "offer": "Auditoria preliminar com proposta detalhada em 48h",
            "cta": "Pedir Auditoria Gratuita",
            "positioning": "Especialista em Eficiência Industrial",
            "channels": ["Instagram", "Facebook", "LinkedIn"]
        }
        create_prod_res = await ac.post("/api/marketing/products", json=prod_payload, headers=headers)
        assert create_prod_res.status_code == 200, f"Error creating product: {create_prod_res.text}"
        prod_id = create_prod_res.json().get("product", {}).get("id")
        assert prod_id is not None
        
        # List products
        list_prods_res = await ac.get("/api/marketing/products", headers=headers)
        assert list_prods_res.status_code == 200
        assert len(list_prods_res.json().get("products", [])) >= 1

        # -------------------------------------------------------------
        # B. CAMPANHAS (WIZARD)
        # -------------------------------------------------------------
        # Wizard step suggestion test
        wizard_step_res = await ac.post("/api/marketing/campaigns/wizard-step", json={
            "step": 2,
            "product_id": prod_id,
            "objective": "leads"
        }, headers=headers)
        assert wizard_step_res.status_code == 200
        
        # Create campaign
        camp_payload = {
            "name": "Campanha Inverno · Redução de Fatura",
            "product_id": prod_id,
            "objective": "leads",
            "target_audience": "Gestores de manutenção e diretores financeiros",
            "market_region": "PT",
            "language": "pt",
            "offer": "Diagnóstico de 15 minutos sem compromisso",
            "cta": "Enviar Mensagem Direta",
            "channels": ["Instagram", "Facebook"],
            "strategy": "Educativo",
            "target_volume": 14,
            "daily_frequency": 4,
            "priority": "alta",
            "weight_percentage": 60,
            "budget": 200.0,
            "status": "active"
        }
        create_camp_res = await ac.post("/api/marketing/campaigns", json=camp_payload, headers=headers)
        assert create_camp_res.status_code == 200
        camp_id = create_camp_res.json().get("campaign", {}).get("id")
        assert camp_id is not None

        # -------------------------------------------------------------
        # C. CRIADOR DE MARKETING (STRATEGY & ANGLES)
        # -------------------------------------------------------------
        strategy_res = await ac.post("/api/marketing/creator/generate-strategy", json={
            "product_id": prod_id,
            "campaign_id": camp_id,
            "objective": "leads",
            "strategy": "Educativo"
        }, headers=headers)
        assert strategy_res.status_code == 200
        strat_data = strategy_res.json().get("strategy", {})
        assert "angles" in strat_data
        assert "high_converting_hooks" in strat_data

        # -------------------------------------------------------------
        # D. STUDIO & NOVO POST (VARIANTES A & B)
        # -------------------------------------------------------------
        # Generate post in Studio
        studio_res = await ac.post("/api/marketing/studio/generate-post", json={
            "product_id": prod_id,
            "campaign_id": camp_id,
            "format": "Post",
            "network": "Instagram",
            "strategy": "Educativo",
            "goal": "leads",
            "generate_image": False
        }, headers=headers)
        assert studio_res.status_code == 200
        post_a = studio_res.json().get("post", {})
        
        # Send Variant A to Content Pool
        post_a["product_id"] = prod_id
        post_a["campaign_id"] = camp_id
        post_a["status"] = "READY"
        post_a["variant_type"] = "A"
        pool_a_res = await ac.post("/api/marketing/studio/send-to-pool", json=post_a, headers=headers)
        assert pool_a_res.status_code == 200
        content_a_id = pool_a_res.json().get("content", {}).get("id")

        # Generate Variant B
        variants_res = await ac.post("/api/marketing/studio/generate-variants", json={
            "post": post_a
        }, headers=headers)
        assert variants_res.status_code == 200
        var_b = variants_res.json().get("variants", {}).get("variant_b", {})
        
        # Send Variant B to Content Pool
        post_b_payload = {
            "product_id": prod_id,
            "campaign_id": camp_id,
            "title": var_b.get("title", "Post Variant B"),
            "format": "Post",
            "network": "Instagram",
            "strategy": "Educativo",
            "goal": "leads",
            "hook": var_b.get("hook", "Gancho B"),
            "caption": var_b.get("caption", "Legenda B"),
            "cta": var_b.get("cta", "CTA B"),
            "variant_type": "B",
            "status": "READY"
        }
        pool_b_res = await ac.post("/api/marketing/studio/send-to-pool", json=post_b_payload, headers=headers)
        assert pool_b_res.status_code == 200
        content_b_id = pool_b_res.json().get("content", {}).get("id")

        # -------------------------------------------------------------
        # E. CONTENT POOL & CONTENT RUNWAY
        # -------------------------------------------------------------
        pool_list_res = await ac.get("/api/marketing/pool", headers=headers)
        assert pool_list_res.status_code == 200
        pdata = pool_list_res.json()
        assert len(pdata.get("items", [])) >= 2
        assert "runway" in pdata
        assert pdata["runway"]["available_stock"] >= 2
        assert pdata["runway"]["runway_days"] > 0

        # -------------------------------------------------------------
        # F. POSTING PLAN & SCHEDULER (ANTI-CANIBALIZAÇÃO)
        # -------------------------------------------------------------
        plan_save_res = await ac.post("/api/marketing/posting-plan", json={
            "daily_posts": 4,
            "mode": "UNIFORME",
            "window_start": "08:00",
            "window_end": "22:00",
            "anti_cannibalization": True
        }, headers=headers)
        assert plan_save_res.status_code == 200
        
        # Generate schedule slots
        sched_res = await ac.post("/api/marketing/scheduler/generate-slots", headers=headers)
        assert sched_res.status_code == 200
        assert sched_res.json().get("scheduled_count", 0) >= 2

        # -------------------------------------------------------------
        # G. CALENDÁRIO & DRAG-AND-DROP REAGENDAMENTO
        # -------------------------------------------------------------
        cal_res = await ac.get("/api/marketing/calendar?view=semana", headers=headers)
        assert cal_res.status_code == 200
        slots = cal_res.json().get("slots", [])
        assert len(slots) >= 2
        
        # Move slot A by drag-and-drop
        target_slot = slots[0]
        new_time = (datetime.now(timezone.utc)).isoformat()
        move_res = await ac.post("/api/marketing/scheduler/move-slot", json={
            "slot_id": target_slot["id"],
            "target_time": new_time
        }, headers=headers)
        assert move_res.status_code == 200
        assert move_res.json().get("moved") is True

        # -------------------------------------------------------------
        # H. EXPERIMENTOS A/B & FEEDBACK LOOP
        # -------------------------------------------------------------
        exp_res = await ac.post("/api/marketing/experiments", json={
            "name": "Teste de Hook: Pergunta vs Alerta",
            "product_id": prod_id,
            "campaign_id": camp_id,
            "variant_a_id": content_a_id,
            "variant_b_id": content_b_id,
            "hypothesis": "O gancho de alerta terá maior CTR",
            "metric_target": "engagement_rate"
        }, headers=headers)
        assert exp_res.status_code == 200
        exp_id = exp_res.json().get("experiment", {}).get("id")
        
        # Evaluate experiment
        eval_res = await ac.post(f"/api/marketing/experiments/{exp_id}/evaluate", headers=headers)
        assert eval_res.status_code == 200
        assert eval_res.json().get("status") == "COMPLETED"
        assert "insight" in eval_res.json()

        # -------------------------------------------------------------
        # I. ANALYTICS 360°
        # -------------------------------------------------------------
        analytics_res = await ac.get("/api/marketing/analytics-full", headers=headers)
        assert analytics_res.status_code == 200
        an_data = analytics_res.json()
        assert "summary" in an_data
        assert "best_formats" in an_data
        assert "product_performance" in an_data

        # -------------------------------------------------------------
        # J. GROWTH ENGINE & AUTOPILOT
        # -------------------------------------------------------------
        # Configure autopilot
        auto_cfg_res = await ac.post("/api/marketing/autopilot/config", json={
            "mode": "ASSISTIDO",
            "permissions": {
                "ajustar_horarios": True,
                "gerar_novos_conteudos": True
            }
        }, headers=headers)
        assert auto_cfg_res.status_code == 200
        
        # Trigger cycle
        trigger_res = await ac.post("/api/marketing/autopilot/trigger-cycle", headers=headers)
        assert trigger_res.status_code == 200
        
        # Check audit logs
        logs_res = await ac.get("/api/marketing/autopilot/logs", headers=headers)
        assert logs_res.status_code == 200
        assert len(logs_res.json().get("logs", [])) >= 1

        print("\n✅ COIA BASIC AND FULL PIPELINE TEST COMPLETED 100% SUCCESSFULLY!")

