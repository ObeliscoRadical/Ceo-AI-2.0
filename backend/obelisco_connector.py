import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from core import db, invalidate_ai_cache, active_company_id

logger = logging.getLogger(__name__)

DEFAULT_OBELISCO_URL = os.environ.get("OBELISCO_URL", "https://proposal-hub-56.emergent.host")
DEFAULT_OBELISCO_EMAIL = os.environ.get("OBELISCO_EMAIL", "d.oliveira1986@gmail.com")
DEFAULT_OBELISCO_PASSWORD = os.environ.get("OBELISCO_PASSWORD", "A24d22r04")


class Obelisco360Connector:
    def __init__(self, base_url: str = DEFAULT_OBELISCO_URL, email: str = DEFAULT_OBELISCO_EMAIL, password: str = DEFAULT_OBELISCO_PASSWORD):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self._token: Optional[str] = None
        self._company_id: Optional[str] = None
        self._token_expires: float = 0

    async def authenticate(self) -> str:
        """Authenticate with Obelisco Manager and get JWT token."""
        url = f"{self.base_url}/api/auth/login"
        payload = {"email": self.email, "password": self.password}
        
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                raise Exception(f"Falha na autenticação no Obelisco Manager ({res.status_code}): {res.text[:200]}")
            data = res.json()
            self._token = data.get("access_token") or data.get("token")
            self._company_id = data.get("company_id") or data.get("active_company_id")
            if not self._token:
                raise Exception("Token de acesso não retornado pelo Obelisco Manager")
            return self._token

    async def _get(self, client: httpx.AsyncClient, path: str) -> Any:
        url = f"{self.base_url}/api{path}"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "X-Company-Id": self._company_id or ""
        }
        try:
            res = await client.get(url, headers=headers)
            if res.status_code == 200:
                return res.json()
            elif res.status_code == 404:
                return None
            else:
                logger.warning(f"Obelisco API warning on {path} ({res.status_code}): {res.text[:150]}")
                return None
        except Exception as e:
            logger.error(f"Erro ao consultar {path} no Obelisco: {e}")
            return None

    async def fetch_full_360_snapshot(self) -> Dict[str, Any]:
        """Fetch all 360-degree data from Obelisco Manager."""
        if not self._token:
            await self.authenticate()

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Financial & Overview Dashboards
            overview = await self._get(client, "/dashboard/overview") or {}
            financial = await self._get(client, "/dashboard/financial") or {}
            cashflow = await self._get(client, "/dashboard/cashflow") or {}
            stats = await self._get(client, "/dashboard/stats") or {}
            
            # 2. Expenses & Fixed Costs
            expenses = await self._get(client, "/expenses") or []
            fixed_cost_templates = await self._get(client, "/fixed-costs/templates") or []
            
            # 3. Works & Services
            works = await self._get(client, "/works") or []
            service_orders = await self._get(client, "/service-orders") or []
            
            # 4. Budgets & Sales Pipeline
            budgets = await self._get(client, "/budgets") or []
            pipeline = await self._get(client, "/pipeline") or {}
            
            # 5. Team, Payroll & Productivity
            payroll_employees = await self._get(client, "/payroll/employees") or []
            payroll_summary = await self._get(client, "/payroll/summary") or {}
            payroll_runs = await self._get(client, "/payroll/runs") or []
            labor = await self._get(client, "/labor") or []
            productivity = await self._get(client, "/productivity") or []
            debts = await self._get(client, "/cfo-virtual/debts") or []

        highlights = overview.get("highlights", {})
        cash_month = highlights.get("cash_month", {})
        to_receive = highlights.get("to_receive", {})
        to_pay = highlights.get("to_pay", {})
        cf_totals = cashflow.get("totals", {})

        cash_balance = float(cash_month.get("amount") or 0.0)
        received_this_month = float(cash_month.get("received") or 0.0)
        expenses_this_month = float(cash_month.get("expenses") or 0.0)
        
        amount_to_receive = float(to_receive.get("amount") or 0.0)
        overdue_to_receive = float(to_receive.get("overdue_amount") or 0.0)
        amount_to_pay = float(to_pay.get("amount") or 0.0)
        
        annual_emitted = float(cf_totals.get("emitted_year") or 0.0)
        annual_entries = float(cf_totals.get("entries") or 0.0)
        annual_exits = float(cf_totals.get("exits") or 0.0)
        
        fixed_costs_list = []
        for fc in fixed_cost_templates:
            if fc.get("active", True):
                fixed_costs_list.append({
                    "name": fc.get("name", "Custo Fixo"),
                    "amount": float(fc.get("expected_amount") or 0.0),
                    "category": fc.get("category", "Geral"),
                    "due_day": fc.get("due_day", 1),
                    "supplier": fc.get("supplier", ""),
                })
        total_fixed_costs = round(sum(c["amount"] for c in fixed_costs_list), 2)

        expenses_by_cat: Dict[str, float] = {}
        for exp in expenses:
            cat = exp.get("category") or "Outros"
            val = float(exp.get("value_gross") or exp.get("value_net") or 0.0)
            expenses_by_cat[cat] = round(expenses_by_cat.get(cat, 0.0) + val, 2)

        employees_list = []
        for emp in payroll_employees:
            employees_list.append({
                "name": emp.get("name"),
                "role": emp.get("role") or emp.get("category", "Técnico"),
                "base_salary": float(emp.get("base_salary") or 0.0),
                "meal_allowance": float(emp.get("meal_allowance_daily") or 0.0),
                "contract_type": emp.get("contract_type", "efetivo")
            })
        active_employees_count = len(employees_list) or int(payroll_summary.get("active_employees") or 0)
        payroll_monthly_cost = float(payroll_summary.get("recent_runs", [{}])[0].get("total_custo_empresa") or 0.0) if payroll_summary.get("recent_runs") else round(sum(e["base_salary"] * 1.2375 for e in employees_list), 2)

        active_works = [w for w in works if w.get("status") in ("em_andamento", "em_execucao", "aceite", "orcamento")]
        completed_works = [w for w in works if w.get("status") in ("finalizada", "concluida", "paga")]
        works_summary = {
            "total_count": len(works) or int(stats.get("total_obras") or 0),
            "active_count": len(active_works) or int(stats.get("obras_em_andamento") or 0),
            "completed_count": len(completed_works) or int(stats.get("obras_finalizadas") or 0),
            "estimated_profit": float(stats.get("lucro_estimado") or 0.0),
            "recent_works": [
                {
                    "title": w.get("title"),
                    "client": w.get("client_name"),
                    "status": w.get("status"),
                    "predicted_cost": float(w.get("predicted_cost") or 0.0),
                    "budget_total": float(w.get("budget_total") or 0.0)
                } for w in works[:6]
            ]
        }

        budgets_summary = {
            "total_budgets": len(budgets) or int(stats.get("total_orcamentos") or 0),
            "total_proposals": int(stats.get("total_propostas") or 0),
            "recent_budgets": [
                {
                    "title": b.get("title"),
                    "client": b.get("client_name"),
                    "items_count": len(b.get("items") or [])
                } for b in budgets[:5]
            ]
        }

        total_debt = round(sum(float(d.get("valor_total") or 0.0) for d in debts), 2)
        annual_goal = 350000.0
        progress_pct = round((annual_emitted / annual_goal) * 100, 1) if annual_goal > 0 else 0.0
        now_iso = datetime.now(timezone.utc).isoformat()

        return {
            "source": "Obelisco Manager 360 Cloud",
            "host": self.base_url,
            "company_id": self._company_id,
            "user_email": self.email,
            "synced_at": now_iso,
            
            "cash_balance": cash_balance,
            "monthly_revenue": received_this_month,
            "annual_emitted_revenue": annual_emitted,
            "annual_revenue_goal": annual_goal,
            "annual_goal_progress_pct": progress_pct,
            "total_debt": total_debt,
            "amount_to_receive": amount_to_receive,
            "overdue_to_receive": overdue_to_receive,
            "amount_to_pay": amount_to_pay,
            "total_fixed_costs": total_fixed_costs,
            "fixed_costs": fixed_costs_list,
            "expenses_this_month": expenses_this_month,
            "expenses_breakdown": expenses_by_cat,
            
            "active_employees_count": active_employees_count,
            "payroll_monthly_cost": payroll_monthly_cost,
            "employees": employees_list,
            "labor_rates": labor,
            "works_summary": works_summary,
            "budgets_summary": budgets_summary,
            "pipeline_phases": pipeline.get("phases", []),
            "debts": debts,
        }


async def sync_obelisco_to_ceo_ai(user_id: str, company_id: Optional[str] = None, connector: Optional[Obelisco360Connector] = None) -> Dict[str, Any]:
    """Execute full 360 sync and persist into CEO AI database."""
    if not connector:
        cred = await db.obelisco_credentials.find_one({"user_id": user_id}) or {}
        base_url = cred.get("base_url") or DEFAULT_OBELISCO_URL
        email = cred.get("email") or DEFAULT_OBELISCO_EMAIL
        password = cred.get("password") or DEFAULT_OBELISCO_PASSWORD
        connector = Obelisco360Connector(base_url, email, password)

    cid = company_id or await active_company_id(user_id)
    if not cid:
        comp = await db.companies.find_one({"user_id": user_id})
        cid = str(comp["_id"]) if comp else "default"

    snapshot = await connector.fetch_full_360_snapshot()
    now_iso = datetime.now(timezone.utc).isoformat()

    erp_context_doc = {
        "user_id": user_id,
        "company_id": cid,
        "active": True,
        "system_name": "Obelisco Manager 360",
        "source_label": "Obelisco Manager · Nuvem 360°",
        "updated_at": now_iso,
        "cash_balance": snapshot["cash_balance"],
        "monthly_revenue": snapshot["monthly_revenue"],
        "total_debt": snapshot["total_debt"],
        "fixed_costs": snapshot["fixed_costs"],
        "total_fixed_costs": snapshot["total_fixed_costs"],
        "amount_to_receive": snapshot["amount_to_receive"],
        "overdue_to_receive": snapshot["overdue_to_receive"],
        "amount_to_pay": snapshot["amount_to_pay"],
        "annual_emitted_revenue": snapshot["annual_emitted_revenue"],
        "annual_goal_progress_pct": snapshot["annual_goal_progress_pct"],
        "active_employees_count": snapshot["active_employees_count"],
        "payroll_monthly_cost": snapshot["payroll_monthly_cost"],
        "works_summary": snapshot["works_summary"],
        "budgets_summary": snapshot["budgets_summary"],
        "expenses_breakdown": snapshot["expenses_breakdown"],
    }
    await db.erp_financial_contexts.update_one(
        {"user_id": user_id, "company_id": cid},
        {"$set": erp_context_doc, "$setOnInsert": {"created_at": now_iso}},
        upsert=True,
    )

    await db.obelisco_snapshots.update_one(
        {"user_id": user_id, "company_id": cid},
        {"$set": {**snapshot, "user_id": user_id, "company_id": cid, "updated_at": now_iso}},
        upsert=True
    )

    await db.companies.update_one(
        {"user_id": user_id},
        {"$set": {
            "bank_balance": snapshot["cash_balance"],
            "obelisco_synced_at": now_iso,
            "obelisco_connected": True
        }}
    )

    await invalidate_ai_cache(user_id)
    logger.info(f"Full 360 Obelisco Sync completed for user {user_id}")
    return snapshot
